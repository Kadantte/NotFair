/**
 * Tests for the canonical Stripe sync pattern: every webhook funnels into
 * `syncStripeSubscription(customerId)`, which re-fetches the latest state
 * from Stripe and writes the canonical row. The webhook router is just an
 * idempotency check + customer-id resolver.
 *
 * Test strategy: inject a fake `stripe` SDK and a fake DB. Build subscription
 * objects directly (not webhook events) — the event payload is irrelevant
 * because the sync function ignores it and re-fetches from Stripe.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/stripe/config", async () => ({
  isStripeTestMode: () => true,
  stripeMode: () => "test" as const,
  getStripeSecretKey: () => "sk_test_dummy",
  getStripePublishableKey: () => "pk_test_dummy",
  getStripeWebhookSecret: () => "whsec_dummy",
  getGrowthProductId: () => "prod_test",
  getGrowthMonthlyPriceId: () => "price_monthly",
  getGrowthYearlyPriceId: () => "price_yearly",
  resolvePrice: (id: string) => {
    if (id === "price_monthly") return { plan: "growth" as const, interval: "month" as const };
    if (id === "price_yearly") return { plan: "growth" as const, interval: "year" as const };
    return null;
  },
}));

vi.mock("@/lib/db", () => ({
  schema: {
    subscriptions: {
      userId: "userId",
      stripeCustomerId: "stripeCustomerId",
      stripeSubscriptionId: "stripeSubscriptionId",
    },
    processedStripeEvents: {
      eventId: "eventId",
    },
  },
  db: () => ({}),
}));

vi.mock("@/lib/stripe/client", () => ({
  stripe: () => ({}), // unused — handlers receive an injected stripe
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ["eq", col, val]),
}));

import {
  syncStripeSubscription,
  handleStripeEvent,
} from "@/lib/stripe/sync";

// ─── Fake DB ──────────────────────────────────────────────────────────

interface FakeRow {
  userId: string;
  email: string | null;
  stripeCustomerId: string | null;
  data: Record<string, unknown> | null;
}

function makeFakeDb(initial: { subs?: FakeRow[]; events?: string[] } = {}) {
  const rows: FakeRow[] = [...(initial.subs ?? [])];
  const events = new Set<string>(initial.events ?? []);

  const dbFn = () => ({
    insert: (_table: unknown) => ({
      values: (vals: Partial<FakeRow> & { eventId?: string; type?: string }) => {
        // Two tables: subscriptions and processedStripeEvents.
        // Distinguish by the shape of `vals` — events have an `eventId`.
        const isEvents = typeof vals.eventId === "string";
        if (isEvents) {
          return {
            onConflictDoNothing: () => ({
              returning: () => {
                if (events.has(vals.eventId!)) return [];
                events.add(vals.eventId!);
                return [{ eventId: vals.eventId! }];
              },
            }),
          };
        }
        return {
          onConflictDoUpdate: (opts: { target: unknown; set: Partial<FakeRow> }) => {
            const idx = rows.findIndex((r) => r.userId === vals.userId);
            if (idx >= 0) {
              rows[idx] = { ...rows[idx], ...opts.set };
            } else {
              rows.push({
                userId: vals.userId!,
                email: vals.email ?? null,
                stripeCustomerId: vals.stripeCustomerId ?? null,
                data: (vals.data as Record<string, unknown> | null) ?? null,
              });
            }
            return Promise.resolve();
          },
        };
      },
    }),
    update: () => ({
      set: (set: Partial<FakeRow>) => ({
        where: (clause: unknown[]) => ({
          returning: () => {
            const value = (clause as unknown[])[2] as string;
            const matched: { userId: string }[] = [];
            for (let i = 0; i < rows.length; i++) {
              if (
                rows[i].stripeCustomerId === value ||
                rows[i].userId === value
              ) {
                rows[i] = { ...rows[i], ...set };
                matched.push({ userId: rows[i].userId });
              }
            }
            return matched;
          },
        }),
      }),
    }),
  });

  return { database: dbFn as unknown as typeof import("@/lib/db").db, rows, events };
}

// ─── Fake Stripe SDK ──────────────────────────────────────────────────

interface FakeStripeOpts {
  subscription?: Partial<Stripe.Subscription> | null;
  customerEmail?: string | null;
  customerDeleted?: boolean;
}

function makeStripe(opts: FakeStripeOpts = {}) {
  const subscription = opts.subscription === null ? null : (opts.subscription ?? {});
  const sdk = () => ({
    subscriptions: {
      list: vi.fn(async () => ({
        data: subscription ? [subscription as Stripe.Subscription] : [],
        has_more: false,
        object: "list" as const,
        url: "",
      })),
    },
    customers: {
      retrieve: vi.fn(async () => {
        if (opts.customerDeleted) return { id: "cus_x", deleted: true };
        return { id: "cus_x", email: opts.customerEmail ?? null } as Stripe.Customer;
      }),
    },
  });
  return sdk as unknown as typeof import("@/lib/stripe/client").stripe;
}

function makeSub(overrides: Partial<{
  id: string;
  status: Stripe.Subscription.Status;
  priceId: string;
  interval: "month" | "year";
  cancelAtPeriodEnd: boolean;
  cancelAt: number | null;
  trialEnd: number | null;
  userId: string;
  customerId: string;
  periodEnd: number;
}> = {}): Stripe.Subscription {
  const periodEnd = overrides.periodEnd ?? Math.floor(Date.UTC(2026, 11, 1) / 1000);
  return {
    id: overrides.id ?? "sub_test_123",
    object: "subscription",
    status: overrides.status ?? "active",
    customer: overrides.customerId ?? "cus_test_123",
    cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
    cancel_at: overrides.cancelAt ?? null,
    trial_end: overrides.trialEnd ?? null,
    metadata: { userId: overrides.userId ?? "user-google-1" },
    items: {
      object: "list",
      data: [
        {
          id: "si_1",
          object: "subscription_item",
          current_period_end: periodEnd,
          price: {
            id: overrides.priceId ?? "price_monthly",
            object: "price",
            recurring: { interval: overrides.interval ?? "month" },
          },
        },
      ],
      has_more: false,
      url: "",
    },
    current_period_end: periodEnd,
  } as unknown as Stripe.Subscription;
}

function event<T extends Stripe.Event["type"]>(
  type: T,
  obj: Record<string, unknown>,
  id = `evt_${type}_${Math.random().toString(36).slice(2, 8)}`,
): Stripe.Event {
  return {
    id,
    type,
    object: "event",
    api_version: "2026-03-25.dahlia",
    created: Math.floor(Date.now() / 1000),
    data: { object: obj },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  } as unknown as Stripe.Event;
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("syncStripeSubscription — re-fetch from Stripe and mirror state", () => {
  let fakeDb: ReturnType<typeof makeFakeDb>;

  beforeEach(() => {
    fakeDb = makeFakeDb();
  });

  // Helper: pull a Stripe field out of the row's `data` jsonb, since the
  // sync function only writes to that one column now.
  function dataField<T = unknown>(row: FakeRow | undefined, path: string): T | undefined {
    if (!row?.data) return undefined;
    const parts = path.split(".");
    let current: unknown = row.data;
    for (const p of parts) {
      if (current && typeof current === "object" && p in (current as object)) {
        current = (current as Record<string, unknown>)[p];
      } else return undefined;
    }
    return current as T;
  }

  it("syncs an active monthly subscription end-to-end into `data`", async () => {
    const sub = makeSub({ status: "active", interval: "month", priceId: "price_monthly", userId: "user-1" });
    const stripe = makeStripe({ subscription: sub, customerEmail: "founder@example.com" });

    const result = await syncStripeSubscription("cus_test_123", { database: fakeDb.database, stripe });

    expect(result).toMatchObject({ action: "synced", userId: "user-1" });
    expect(fakeDb.rows).toHaveLength(1);
    // Flat columns: only the lookup keys + email.
    expect(fakeDb.rows[0]).toMatchObject({
      userId: "user-1",
      email: "founder@example.com",
      stripeCustomerId: "cus_test_123",
    });
    // Everything else lives in `data` — verify the resolver inputs are present.
    expect(dataField(fakeDb.rows[0], "status")).toBe("active");
    expect(dataField(fakeDb.rows[0], "items.data.0.price.id")).toBe("price_monthly");
    expect(dataField(fakeDb.rows[0], "items.data.0.price.recurring.interval")).toBe("month");
  });

  it("syncs a yearly subscription with the right interval", async () => {
    const sub = makeSub({ interval: "year", priceId: "price_yearly", userId: "user-2" });
    const stripe = makeStripe({ subscription: sub, customerEmail: "y@example.com" });

    await syncStripeSubscription("cus_test_123", { database: fakeDb.database, stripe });
    expect(dataField(fakeDb.rows[0], "items.data.0.price.recurring.interval")).toBe("year");
    expect(dataField(fakeDb.rows[0], "items.data.0.price.id")).toBe("price_yearly");
  });

  // ─── The bug that motivated the canonical refactor ────────────────

  it("modern portal cancel: cancel_at set, cancel_at_period_end stays false — both preserved verbatim in `data`", async () => {
    const cancelAt = Math.floor(Date.UTC(2026, 4, 10) / 1000);
    const sub = makeSub({ userId: "user-1", cancelAtPeriodEnd: false, cancelAt });
    const stripe = makeStripe({ subscription: sub, customerEmail: null });

    await syncStripeSubscription("cus_test_123", { database: fakeDb.database, stripe });

    // Both fields land in `data` exactly as Stripe sent them — no collapsing.
    expect(dataField(fakeDb.rows[0], "cancel_at_period_end")).toBe(false);
    expect(dataField(fakeDb.rows[0], "cancel_at")).toBe(cancelAt);
    expect(dataField(fakeDb.rows[0], "status")).toBe("active");
  });

  it("legacy portal cancel: cancel_at_period_end true, cancel_at null", async () => {
    const sub = makeSub({ userId: "user-1", cancelAtPeriodEnd: true, cancelAt: null });
    const stripe = makeStripe({ subscription: sub });

    await syncStripeSubscription("cus_test_123", { database: fakeDb.database, stripe });
    expect(dataField(fakeDb.rows[0], "cancel_at_period_end")).toBe(true);
    expect(dataField(fakeDb.rows[0], "cancel_at")).toBeNull();
  });

  // ─── Lifecycle: cancel, renew, demote ─────────────────────────────

  it("auto-renew: re-running sync after Stripe advances period_end updates `data`", async () => {
    let sub = makeSub({ userId: "user-1", periodEnd: 1_700_000_000 });
    let stripe = makeStripe({ subscription: sub });
    await syncStripeSubscription("cus_x", { database: fakeDb.database, stripe });
    expect(dataField(fakeDb.rows[0], "items.data.0.current_period_end")).toBe(1_700_000_000);

    sub = makeSub({ userId: "user-1", periodEnd: 1_800_000_000 });
    stripe = makeStripe({ subscription: sub });
    await syncStripeSubscription("cus_x", { database: fakeDb.database, stripe });
    expect(dataField(fakeDb.rows[0], "items.data.0.current_period_end")).toBe(1_800_000_000);
    expect(fakeDb.rows).toHaveLength(1);
  });

  it("subscription deleted at Stripe → list returns empty → row's `data` is cleared (resolver returns free)", async () => {
    fakeDb = makeFakeDb({
      subs: [
        {
          userId: "user-1",
          email: "f@x",
          stripeCustomerId: "cus_kill",
          data: { foo: "bar" },
        },
      ],
    });
    const stripe = makeStripe({ subscription: null, customerEmail: "f@x" });

    const result = await syncStripeSubscription("cus_kill", { database: fakeDb.database, stripe });
    expect(result).toMatchObject({ action: "demoted", userId: "user-1" });
    expect(fakeDb.rows[0].data).toBeNull();
  });

  it("payment failure: Stripe sets status=past_due — mirrored verbatim into `data`", async () => {
    const sub = makeSub({ userId: "user-1", status: "past_due" });
    const stripe = makeStripe({ subscription: sub });

    await syncStripeSubscription("cus_pd", { database: fakeDb.database, stripe });
    expect(dataField(fakeDb.rows[0], "status")).toBe("past_due");
  });

  it("trial: Stripe sets trial_end and status=trialing — both land in `data`", async () => {
    const trialEnd = Math.floor(Date.UTC(2026, 4, 1) / 1000);
    const sub = makeSub({ userId: "user-1", status: "trialing", trialEnd });
    const stripe = makeStripe({ subscription: sub });

    await syncStripeSubscription("cus_t", { database: fakeDb.database, stripe });
    expect(dataField(fakeDb.rows[0], "status")).toBe("trialing");
    expect(dataField(fakeDb.rows[0], "trial_end")).toBe(trialEnd);
  });

  // ─── Defensive cases ──────────────────────────────────────────────

  it("subscription with no userId metadata is skipped (no row written)", async () => {
    const sub = makeSub({ userId: "" });
    (sub as unknown as { metadata: Record<string, string> }).metadata = {};
    const stripe = makeStripe({ subscription: sub });

    const result = await syncStripeSubscription("cus_x", { database: fakeDb.database, stripe });
    expect(result.action).toBe("skipped");
    expect(fakeDb.rows).toHaveLength(0);
  });

  it("deleted Stripe customer → no-op", async () => {
    const stripe = makeStripe({ customerDeleted: true });
    const result = await syncStripeSubscription("cus_dead", { database: fakeDb.database, stripe });
    expect(result.action).toBe("skipped");
    expect(fakeDb.rows).toHaveLength(0);
  });

  it("unknown price id is preserved verbatim (resolver decides plan at read time)", async () => {
    const sub = makeSub({ priceId: "price_unknown_xyz" });
    const stripe = makeStripe({ subscription: sub });
    await syncStripeSubscription("cus_x", { database: fakeDb.database, stripe });
    // Sync writes whatever Stripe sent — plan resolution happens in the read path.
    expect(dataField(fakeDb.rows[0], "items.data.0.price.id")).toBe("price_unknown_xyz");
  });
});

// ─── handleStripeEvent: idempotency + customer-id resolution ─────────

describe("handleStripeEvent — idempotent webhook router", () => {
  let fakeDb: ReturnType<typeof makeFakeDb>;

  beforeEach(() => {
    fakeDb = makeFakeDb();
  });

  it("processes a fresh event by funneling to syncStripeSubscription", async () => {
    const sub = makeSub({ userId: "user-1" });
    const stripe = makeStripe({ subscription: sub });

    const e = event("customer.subscription.updated", {
      id: "sub_test_123",
      customer: "cus_test_123",
    });
    const result = await handleStripeEvent(e, { database: fakeDb.database, stripe });
    expect(result).toMatchObject({ action: "synced", userId: "user-1" });
    expect(fakeDb.events.has(e.id)).toBe(true);
  });

  it("idempotency: replaying the same event id is a no-op", async () => {
    const sub = makeSub({ userId: "user-1" });
    const stripe = makeStripe({ subscription: sub });

    const e = event("customer.subscription.updated", { id: "sub_x", customer: "cus_x" });
    await handleStripeEvent(e, { database: fakeDb.database, stripe });
    const second = await handleStripeEvent(e, { database: fakeDb.database, stripe });

    expect(second.action).toBe("skipped");
    expect(second).toMatchObject({ reason: expect.stringContaining("duplicate") });
    // Row was only written once.
    expect(fakeDb.rows).toHaveLength(1);
  });

  it("checkout.session.completed: customer id is on the session, sync uses that", async () => {
    const sub = makeSub({ userId: "user-1" });
    const stripe = makeStripe({ subscription: sub, customerEmail: "f@x" });

    const e = event("checkout.session.completed", {
      id: "cs_test_x",
      customer: "cus_from_checkout",
      subscription: "sub_test_123",
    });
    const result = await handleStripeEvent(e, { database: fakeDb.database, stripe });
    expect(result.action).toBe("synced");
  });

  it("invoice.payment_failed: customer id is on the invoice, sync runs", async () => {
    const sub = makeSub({ userId: "user-1", status: "past_due" });
    const stripe = makeStripe({ subscription: sub });

    const e = event("invoice.payment_failed", {
      id: "in_x",
      customer: "cus_pd",
      subscription: "sub_x",
    });
    const result = await handleStripeEvent(e, { database: fakeDb.database, stripe });
    expect(result.action).toBe("synced");
    expect((fakeDb.rows[0].data as { status: string } | null)?.status).toBe("past_due");
  });

  it("event with no customer id is skipped", async () => {
    const stripe = makeStripe({ subscription: null });
    const e = event("payment_intent.succeeded", { id: "pi_1" });
    const result = await handleStripeEvent(e, { database: fakeDb.database, stripe });
    expect(result.action).toBe("skipped");
  });
});
