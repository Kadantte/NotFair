import { describe, expect, it } from "vitest";
import { getCachedCustomer, getCustomer } from "@/lib/google-ads/client";
import { DEMO_CUSTOMER_ID } from "@/lib/demo/constants";

const demoAuth = { refreshToken: "unused", customerId: DEMO_CUSTOMER_ID };

describe("demo stub customer (safety net for ungated paths)", () => {
  it("getCustomer(demoAuth).query() returns an empty array", async () => {
    const customer = getCustomer(demoAuth);
    const rows = await customer.query("SELECT campaign.id FROM campaign");
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(0);
  });

  it("getCachedCustomer(demoAuth).query() returns an empty array", async () => {
    const customer = getCachedCustomer(demoAuth);
    const rows = await customer.query("SELECT campaign.id FROM campaign");
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(0);
  });

  it("getCustomer(demoAuth).mutateResources() returns a plausible success response", async () => {
    const customer = getCustomer(demoAuth);
    const result = (await customer.mutateResources(
      [
        { entity: "campaign", operation: "update", resource: {} },
        { entity: "campaign", operation: "update", resource: {} },
      ] as unknown as Parameters<typeof customer.mutateResources>[0],
    )) as unknown as { mutate_operation_responses: unknown[] };
    expect(result).toMatchObject({
      mutate_operation_responses: [{}, {}],
    });
  });
});
