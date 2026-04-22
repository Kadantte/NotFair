import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cachedQuery,
  invalidateCache,
  clearCache,
  getCacheMetrics,
  __resetCacheForTests,
} from "./query-cache";

beforeEach(() => {
  __resetCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
  __resetCacheForTests();
});

describe("cachedQuery — hit / miss / write", () => {
  it("invokes fetch on first call and caches the result", async () => {
    const fetch = vi.fn().mockResolvedValue([{ id: "1" }]);
    const result = await cachedQuery("alice", "123", null, "SELECT x", fetch);
    expect(result).toEqual([{ id: "1" }]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getCacheMetrics()).toMatchObject({ misses: 1, writes: 1, hits: 0 });
  });

  it("returns cached data on subsequent calls without invoking fetch", async () => {
    const fetch = vi.fn().mockResolvedValue("payload");
    await cachedQuery("alice", "123", null, "SELECT x", fetch);
    const second = await cachedQuery("alice", "123", null, "SELECT x", fetch);
    expect(second).toBe("payload");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getCacheMetrics()).toMatchObject({ hits: 1, misses: 1 });
  });

  it("normalises whitespace in queries so equivalent queries hit the same key", async () => {
    const fetch = vi.fn().mockResolvedValue("v");
    await cachedQuery("a", "1", null, "SELECT   x   FROM  campaign", fetch);
    await cachedQuery("a", "1", null, "SELECT x FROM campaign", fetch);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("cachedQuery — TTL", () => {
  it("refetches after the 45s TTL elapses", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce("old").mockResolvedValueOnce("new");

    const first = await cachedQuery("u", "1", null, "q", fetch);
    expect(first).toBe("old");

    await vi.advanceTimersByTimeAsync(44_999);
    const stillCached = await cachedQuery("u", "1", null, "q", fetch);
    expect(stillCached).toBe("old");
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    const fresh = await cachedQuery("u", "1", null, "q", fetch);
    expect(fresh).toBe("new");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("cachedQuery — user scoping", () => {
  it("isolates entries by userId so two users don't share a cache slot", async () => {
    const fetchAlice = vi.fn().mockResolvedValue("alice-data");
    const fetchBob = vi.fn().mockResolvedValue("bob-data");

    const a = await cachedQuery("alice", "123", null, "SELECT x", fetchAlice);
    const b = await cachedQuery("bob", "123", null, "SELECT x", fetchBob);

    expect(a).toBe("alice-data");
    expect(b).toBe("bob-data");
    expect(fetchAlice).toHaveBeenCalledTimes(1);
    expect(fetchBob).toHaveBeenCalledTimes(1);
  });

  it("falls back to an anonymous bucket when userId is null", async () => {
    const fetch = vi.fn().mockResolvedValue("anon");
    await cachedQuery(null, "1", null, "q", fetch);
    const second = await cachedQuery(undefined, "1", null, "q", fetch);
    expect(second).toBe("anon");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("cachedQuery — manager-routed keys", () => {
  it("distinguishes direct vs manager-routed access for the same customer", async () => {
    const direct = vi.fn().mockResolvedValue("direct");
    const viaMcc = vi.fn().mockResolvedValue("mcc");
    const r1 = await cachedQuery("u", "123", null, "q", direct);
    const r2 = await cachedQuery("u", "123", "999", "q", viaMcc);
    expect(r1).toBe("direct");
    expect(r2).toBe("mcc");
    expect(direct).toHaveBeenCalledTimes(1);
    expect(viaMcc).toHaveBeenCalledTimes(1);
  });
});

describe("cachedQuery — request coalescing", () => {
  it("collapses concurrent identical queries into one upstream fetch", async () => {
    let resolve!: (v: string) => void;
    const fetch = vi.fn(
      () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    );

    const p1 = cachedQuery("u", "1", null, "q", fetch);
    const p2 = cachedQuery("u", "1", null, "q", fetch);
    const p3 = cachedQuery("u", "1", null, "q", fetch);

    resolve("shared");
    const [v1, v2, v3] = await Promise.all([p1, p2, p3]);

    expect(v1).toBe("shared");
    expect(v2).toBe("shared");
    expect(v3).toBe("shared");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getCacheMetrics()).toMatchObject({ coalesced: 2, misses: 1 });
  });

  it("releases the inflight slot after the fetch resolves so later misses can re-fetch if invalidated", async () => {
    const fetch = vi.fn().mockResolvedValue("v");
    await cachedQuery("u", "1", null, "q", fetch);
    invalidateCache("1");
    await cachedQuery("u", "1", null, "q", fetch);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(getCacheMetrics().inflight).toBe(0);
  });

  it("releases the inflight slot on fetch failure", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("ok");
    await expect(cachedQuery("u", "1", null, "q", fetch)).rejects.toThrow("boom");
    const second = await cachedQuery("u", "1", null, "q", fetch);
    expect(second).toBe("ok");
    expect(getCacheMetrics().inflight).toBe(0);
  });
});

describe("invalidateCache", () => {
  it("removes every entry for the customer across all users", async () => {
    await cachedQuery("alice", "123", null, "q1", vi.fn().mockResolvedValue("a1"));
    await cachedQuery("bob", "123", null, "q2", vi.fn().mockResolvedValue("b2"));
    await cachedQuery("alice", "456", null, "q3", vi.fn().mockResolvedValue("a3"));

    const removed = invalidateCache("123");
    expect(removed).toBe(2);
    expect(getCacheMetrics().size).toBe(1);
  });

  it("does NOT false-match a customerId that appears elsewhere in the key", async () => {
    // Cache query for customer 456 whose query literal happens to contain "123"
    const fetch = vi.fn().mockResolvedValue("v");
    await cachedQuery("u", "456", null, "SELECT x FROM campaign WHERE id = 123", fetch);
    const removed = invalidateCache("123");
    expect(removed).toBe(0);
    expect(getCacheMetrics().size).toBe(1);
  });

  it("matches manager-routed keys", async () => {
    await cachedQuery("u", "123", "999", "q", vi.fn().mockResolvedValue("v"));
    const removed = invalidateCache("123");
    expect(removed).toBe(1);
  });
});

describe("clearCache", () => {
  it("drops every cached entry and every inflight promise", async () => {
    // Set up an inflight that never resolves; it must still be cleared.
    const pending = cachedQuery(
      "u",
      "1",
      null,
      "q",
      () => new Promise(() => {}),
    );
    await cachedQuery("u", "2", null, "q", vi.fn().mockResolvedValue("v"));

    clearCache();
    expect(getCacheMetrics().size).toBe(0);
    expect(getCacheMetrics().inflight).toBe(0);
    // The pending promise would hang forever; we don't await it.
    void pending;
  });
});

describe("LRU eviction", () => {
  it("evicts the oldest entries once the cap is exceeded", async () => {
    // Build past the cap in a loop to avoid hand-listing 5000 entries.
    const cap = 5_000;
    const overflow = 50;
    for (let i = 0; i < cap + overflow; i++) {
      await cachedQuery("u", String(i), null, "q", () => Promise.resolve(i));
    }
    const metrics = getCacheMetrics();
    expect(metrics.size).toBe(cap);
    expect(metrics.evictions).toBe(overflow);
  });
});

describe("getCacheMetrics", () => {
  it("reports a snapshot that is not aliased to the internal mutable state", async () => {
    await cachedQuery("u", "1", null, "q", vi.fn().mockResolvedValue("v"));
    const snap = getCacheMetrics();
    // Mutating the snapshot must not corrupt internal counters.
    (snap as unknown as Record<string, number>).hits = 9999;
    const fresh = getCacheMetrics();
    expect(fresh.hits).toBe(0);
  });

  it("exposes hits, misses, coalesced, writes, evictions, invalidations, size, inflight", async () => {
    const snap = getCacheMetrics();
    for (const k of [
      "hits",
      "misses",
      "coalesced",
      "writes",
      "evictions",
      "invalidations",
      "size",
      "inflight",
    ] as const) {
      expect(snap).toHaveProperty(k);
    }
  });
});
