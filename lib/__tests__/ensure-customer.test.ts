/**
 * Regression test for the bug where `customers.create` was called with
 * idempotencyKey `signup:${env}:${userId}` — keyed on a stable user
 * identifier. After a dev-reset deleted the Stripe customer, the next
 * signup call would replay the cached "create" response (Stripe's
 * idempotency TTL is 24h) and persist the tombstoned customer id into
 * the new subscriptions row.
 *
 * Fix: per-attempt UUID in the idempotency key so each create is its own
 * logical operation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/stripe/config", () => ({
  stripeMode: () => "live" as const,
}));

vi.mock("@/lib/stripe/client", () => ({
  stripe: () => ({}),
}));

vi.mock("@/lib/db", () => ({
  schema: {
    subscriptions: {
      userId: "userId",
      env: "env",
      stripeCustomerId: "stripeCustomerId",
    },
  },
  db: () => ({}),
}));

vi.mock("@/lib/trial-config", () => ({
  TRIAL_DURATION_MS: 7 * 24 * 60 * 60 * 1000,
}));

import { createStripeCustomerForUser } from "@/lib/stripe/ensure-customer";

interface Row {
  userId: string;
  env: string;
  email: string | null;
  stripeCustomerId: string | null;
  trialEndsAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

function makeFakeDb() {
  const rows: Row[] = [];
  const dbFn = () => ({
    insert: () => ({
      values: (vals: Row) => ({
        onConflictDoUpdate: (opts: { set: Partial<Row> }) => {
          const idx = rows.findIndex(
            (r) => r.userId === vals.userId && r.env === vals.env,
          );
          if (idx >= 0) {
            rows[idx] = { ...rows[idx], ...opts.set };
          } else {
            rows.push(vals);
          }
          return Promise.resolve();
        },
      }),
    }),
  });
  return { database: dbFn, rows };
}

interface CreateCall {
  params: { email?: string; metadata: { userId: string } };
  options: { idempotencyKey: string };
}

function makeFakeStripe(customerId = "cus_new_123") {
  const calls: CreateCall[] = [];
  const sdk = () => ({
    customers: {
      create: vi.fn(async (params: CreateCall["params"], options: CreateCall["options"]) => {
        calls.push({ params, options });
        return { id: customerId, object: "customer" };
      }),
    },
  });
  return { stripe: sdk, calls };
}

describe("createStripeCustomerForUser — per-attempt idempotency key", () => {
  let fakeDb: ReturnType<typeof makeFakeDb>;
  let fakeStripe: ReturnType<typeof makeFakeStripe>;

  beforeEach(() => {
    fakeDb = makeFakeDb();
    fakeStripe = makeFakeStripe();
  });

  it("uses a UUID-suffixed idempotency key so two calls don't collide", async () => {
    await createStripeCustomerForUser("user-1", "a@x.com", {
      database: fakeDb.database as unknown as typeof import("@/lib/db").db,
      stripe: fakeStripe.stripe as unknown as typeof import("@/lib/stripe/client").stripe,
    });
    await createStripeCustomerForUser("user-1", "a@x.com", {
      database: fakeDb.database as unknown as typeof import("@/lib/db").db,
      stripe: fakeStripe.stripe as unknown as typeof import("@/lib/stripe/client").stripe,
    });

    expect(fakeStripe.calls).toHaveLength(2);
    const [k1, k2] = fakeStripe.calls.map((c) => c.options.idempotencyKey);
    // Both keys should be scoped to env+user but unique per call — that's the
    // guarantee that prevents Stripe's 24h cache from replaying a stale (and
    // possibly deleted) customer id across reset cycles.
    expect(k1).toMatch(/^signup:live:user-1:/);
    expect(k2).toMatch(/^signup:live:user-1:/);
    expect(k1).not.toBe(k2);
  });

  it("persists the freshly created customer id into the subscriptions row", async () => {
    fakeStripe = makeFakeStripe("cus_fresh_xyz");
    await createStripeCustomerForUser("user-2", "b@x.com", {
      database: fakeDb.database as unknown as typeof import("@/lib/db").db,
      stripe: fakeStripe.stripe as unknown as typeof import("@/lib/stripe/client").stripe,
    });

    expect(fakeDb.rows).toHaveLength(1);
    expect(fakeDb.rows[0]).toMatchObject({
      userId: "user-2",
      env: "live",
      email: "b@x.com",
      stripeCustomerId: "cus_fresh_xyz",
    });
  });

  it("explicit idempotencyKey is honored (escape hatch for callers that need true retry safety)", async () => {
    await createStripeCustomerForUser("user-3", null, {
      database: fakeDb.database as unknown as typeof import("@/lib/db").db,
      stripe: fakeStripe.stripe as unknown as typeof import("@/lib/stripe/client").stripe,
      idempotencyKey: "explicit-key-abc",
    });
    expect(fakeStripe.calls[0].options.idempotencyKey).toBe("explicit-key-abc");
  });
});
