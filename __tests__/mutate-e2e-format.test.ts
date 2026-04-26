/**
 * End-to-end format tests: calls the real google-ads.ts functions with a
 * mock customer, captures the operations they pass to mutateResources,
 * then feeds those operations through the REAL protobuf encoder.
 *
 * If our code constructs an invalid operation (e.g. passing an object to a
 * remove field that expects a string), the protobuf encoder will throw —
 * proving the bug would break in production, not just in our assertions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { protos } = require("google-ads-node");
const services = protos.google.ads.googleads.v22.services;

// Capture every call to mutateResources
const capturedOps: Array<{ entity: string; operation: string; resource: unknown }[]> = [];

const mockMutateResources = vi.fn().mockImplementation((ops: any[]) => {
  capturedOps.push(ops);
  return Promise.resolve({ mutate_operation_responses: [] });
});
const mockQuery = vi.fn().mockResolvedValue([]);
const mockCustomer = {
  mutateResources: mockMutateResources,
  query: mockQuery,
};

vi.mock("google-ads-api", () => ({
  GoogleAdsApi: class {
    Customer() {
      return mockCustomer;
    }
  },
}));

vi.mock("@/lib/env", () => ({
  getRequiredEnv: vi.fn().mockReturnValue("mock-value"),
}));

import {
  removeKeyword,
  removeNegativeKeyword,
  removeCampaign,
  pauseKeyword,
  enableKeyword,
  addKeyword,
  addNegativeKeyword,
  pauseCampaign,
  enableCampaign,
  updateBid,
  type AuthContext,
} from "@/lib/google-ads";

const AUTH: AuthContext = {
  refreshToken: "test-token",
  customerId: "123-456-7890",
};

/** Minimal toSnakeCase matching the library's logic */
function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
}

/** Minimal getFieldMask matching the library's logic */
function getFieldMask(resource: Record<string, unknown>): { paths: string[] } {
  return {
    paths: Object.keys(resource).filter((k) => k !== "resource_name"),
  };
}

/**
 * Takes a captured mutation op and tries to encode it as a real protobuf.
 * This is what happens on the wire — if it throws, the API call would fail.
 */
function encodeAsProtobuf(mutation: {
  entity: string;
  operation: string;
  resource: unknown;
}) {
  const opKey = toSnakeCase(`${mutation.entity}Operation`);
  const operation: Record<string, unknown> = {
    [mutation.operation]: mutation.resource,
  };
  if (mutation.operation === "update") {
    operation.update_mask = getFieldMask(mutation.resource as Record<string, unknown>);
  }

  const mutateOp = new services.MutateOperation({ [opKey]: operation });
  return services.MutateOperation.encode(mutateOp).finish();
}

/**
 * Encode all captured operations through the real protobuf layer.
 * If any operation is malformed, this throws.
 */
function assertAllCapturedOpsEncodeSuccessfully() {
  for (const opSet of capturedOps) {
    for (const op of opSet) {
      expect(() => encodeAsProtobuf(op)).not.toThrow();
    }
  }
}

describe("real function output → protobuf encoding", () => {
  beforeEach(() => {
    capturedOps.length = 0;
    mockMutateResources.mockClear();
    mockQuery.mockClear();
    mockMutateResources.mockImplementation((ops: any[]) => {
      capturedOps.push(ops);
      return Promise.resolve({ mutate_operation_responses: [] });
    });
  });

  it("removeKeyword output encodes to valid protobuf", async () => {
    await removeKeyword(AUTH, "111", "222");
    assertAllCapturedOpsEncodeSuccessfully();
  });

  it("removeNegativeKeyword output encodes to valid protobuf", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign_criterion: {
          keyword: { text: "spam" },
          criterion_id: "999",
        },
      },
    ]);

    await removeNegativeKeyword(AUTH, "555", "spam");
    assertAllCapturedOpsEncodeSuccessfully();
  });

  it("removeCampaign output encodes to valid protobuf", async () => {
    await removeCampaign(AUTH, "777");
    assertAllCapturedOpsEncodeSuccessfully();
  });

  it("pauseKeyword output encodes to valid protobuf", async () => {
    mockQuery.mockResolvedValueOnce([
      { ad_group_criterion: { criterion_id: "222", status: 2, negative: false, keyword: { text: "running shoes" } } },
      { ad_group_criterion: { criterion_id: "333", status: 2, negative: false, keyword: { text: "trail runners" } } },
    ]);

    await pauseKeyword(AUTH, "100", "111", "222");
    assertAllCapturedOpsEncodeSuccessfully();
  });

  it("enableKeyword output encodes to valid protobuf", async () => {
    await enableKeyword(AUTH, "111", "222");
    assertAllCapturedOpsEncodeSuccessfully();
  });

  it("addKeyword output encodes to valid protobuf", async () => {
    mockMutateResources.mockImplementationOnce((ops: any[]) => {
      capturedOps.push(ops);
      return Promise.resolve({
        mutate_operation_responses: [
          {
            ad_group_criterion_result: {
              resource_name: "customers/1234567890/adGroupCriteria/111~12345",
            },
          },
        ],
      });
    });

    await addKeyword(AUTH, "111", "test keyword", "PHRASE");
    assertAllCapturedOpsEncodeSuccessfully();
  });

  it("addNegativeKeyword output encodes to valid protobuf", async () => {
    await addNegativeKeyword(AUTH, "100", "bad keyword", "PHRASE");
    assertAllCapturedOpsEncodeSuccessfully();
  });

  it("pauseCampaign output encodes to valid protobuf", async () => {
    await pauseCampaign(AUTH, "100");
    assertAllCapturedOpsEncodeSuccessfully();
  });

  it("enableCampaign output encodes to valid protobuf", async () => {
    await enableCampaign(AUTH, "100");
    assertAllCapturedOpsEncodeSuccessfully();
  });

  it("updateBid output encodes to valid protobuf", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign: { bidding_strategy_type: "MANUAL_CPC" },
        ad_group_criterion: { cpc_bid_micros: 1_400_000 },
      },
    ]);

    await updateBid(AUTH, "100", "111", "222", 1_500_000);
    assertAllCapturedOpsEncodeSuccessfully();
  });

  it("all remove operations produce protobuf-encodable output", async () => {
    // Run all remove functions
    await removeKeyword(AUTH, "111", "222");
    await removeCampaign(AUTH, "777");

    mockQuery.mockResolvedValueOnce([
      {
        campaign_criterion: {
          keyword: { text: "junk" },
          criterion_id: "888",
        },
      },
    ]);
    await removeNegativeKeyword(AUTH, "555", "junk");

    // Every single captured operation must encode without error
    assertAllCapturedOpsEncodeSuccessfully();

    // Double-check: at least 3 remove operations were captured
    const removeOps = capturedOps.flat().filter((op) => op.operation === "remove");
    expect(removeOps.length).toBe(3);
  });
});
