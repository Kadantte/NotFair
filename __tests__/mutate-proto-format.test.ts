/**
 * Integration tests that verify mutateResources operations produce valid
 * protobuf wire format using the REAL google-ads-node protobuf definitions.
 *
 * These tests don't call the Google Ads API, but they DO use the actual
 * protobuf encode/decode path to prove the operations we construct are valid.
 * If a remove operation passes an object instead of a string, the protobuf
 * encoder will throw — catching the exact bug class we hit in production.
 *
 * This is the closest you can get to an integration test without credentials.
 */

import { describe, it, expect } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { protos } = require("google-ads-node");

const services = protos.google.ads.googleads.v22.services;

/**
 * Simulate what google-ads-api's buildMutationRequestAndService does
 * (service.js lines 147-175) — builds a MutateOperation protobuf from
 * our mutation object, then encodes it. If our format is wrong, the
 * protobuf encoder throws.
 */
function buildAndEncode(mutation: {
  entity: string;
  operation: "create" | "update" | "remove";
  resource: unknown;
}): { encoded: Uint8Array; decoded: any } {
  // Reproduce the library's logic: toSnakeCase(entityOperation) → proto key
  const opKey = toSnakeCase(`${mutation.entity}Operation`);
  const operation: Record<string, unknown> = {
    [mutation.operation]: mutation.resource,
  };

  if (mutation.operation === "update") {
    operation.update_mask = getFieldMask(mutation.resource as Record<string, unknown>);
  }

  const mutateOp = new services.MutateOperation({ [opKey]: operation });
  const encoded = services.MutateOperation.encode(mutateOp).finish();
  const decoded = services.MutateOperation.decode(encoded);
  return { encoded, decoded: decoded.toJSON() };
}

/** Minimal toSnakeCase matching the library's behavior */
function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
}

/** Minimal getFieldMask matching the library's behavior */
function getFieldMask(resource: Record<string, unknown>): { paths: string[] } {
  return {
    paths: Object.keys(resource).filter((k) => k !== "resource_name"),
  };
}

describe("protobuf wire format validation", () => {
  describe("remove operations: resource must be a string", () => {
    it("ad_group_criterion remove with string resource encodes correctly", () => {
      const mutation = {
        entity: "ad_group_criterion",
        operation: "remove" as const,
        resource: "customers/1234567890/adGroupCriteria/111~222",
      };

      const { decoded } = buildAndEncode(mutation);
      const op = decoded.ad_group_criterion_operation;
      expect(op.remove).toBe("customers/1234567890/adGroupCriteria/111~222");
    });

    it("ad_group_criterion remove with object resource FAILS to encode", () => {
      const mutation = {
        entity: "ad_group_criterion",
        operation: "remove" as const,
        resource: {
          resource_name: "customers/1234567890/adGroupCriteria/111~222",
        },
      };

      expect(() => buildAndEncode(mutation)).toThrow(/string/);
    });

    it("campaign_criterion remove with string resource encodes correctly", () => {
      const mutation = {
        entity: "campaign_criterion",
        operation: "remove" as const,
        resource: "customers/1234567890/campaignCriteria/100~999",
      };

      const { decoded } = buildAndEncode(mutation);
      const op = decoded.campaign_criterion_operation;
      expect(op.remove).toBe("customers/1234567890/campaignCriteria/100~999");
    });

    it("campaign_criterion remove with object resource FAILS to encode", () => {
      const mutation = {
        entity: "campaign_criterion",
        operation: "remove" as const,
        resource: {
          resource_name: "customers/1234567890/campaignCriteria/100~999",
        },
      };

      expect(() => buildAndEncode(mutation)).toThrow(/string/);
    });

    it("campaign remove with string resource encodes correctly", () => {
      const mutation = {
        entity: "campaign",
        operation: "remove" as const,
        resource: "customers/1234567890/campaigns/777",
      };

      const { decoded } = buildAndEncode(mutation);
      const op = decoded.campaign_operation;
      expect(op.remove).toBe("customers/1234567890/campaigns/777");
    });

    it("campaign remove with object resource FAILS to encode", () => {
      const mutation = {
        entity: "campaign",
        operation: "remove" as const,
        resource: {
          resource_name: "customers/1234567890/campaigns/777",
        },
      };

      expect(() => buildAndEncode(mutation)).toThrow(/string/);
    });
  });

  describe("create operations: resource must be an object", () => {
    it("ad_group_criterion create with object resource encodes correctly", () => {
      const mutation = {
        entity: "ad_group_criterion",
        operation: "create" as const,
        resource: {
          ad_group: "customers/1234567890/adGroups/111",
          keyword: { text: "test keyword", match_type: 4 },
        },
      };

      const { decoded } = buildAndEncode(mutation);
      const op = decoded.ad_group_criterion_operation;
      expect(op.create).toBeDefined();
      expect(op.create.keyword.text).toBe("test keyword");
    });

    it("campaign_criterion create with object resource encodes correctly", () => {
      const mutation = {
        entity: "campaign_criterion",
        operation: "create" as const,
        resource: {
          campaign: "customers/1234567890/campaigns/100",
          negative: true,
          keyword: { text: "bad keyword", match_type: 4 },
        },
      };

      const { decoded } = buildAndEncode(mutation);
      const op = decoded.campaign_criterion_operation;
      expect(op.create).toBeDefined();
      expect(op.create.keyword.text).toBe("bad keyword");
      expect(op.create.negative).toBe(true);
    });
  });

  describe("update operations: resource must be an object with resource_name", () => {
    it("ad_group_criterion update with resource_name + status encodes correctly", () => {
      const mutation = {
        entity: "ad_group_criterion",
        operation: "update" as const,
        resource: {
          resource_name: "customers/1234567890/adGroupCriteria/111~222",
          status: 3, // PAUSED
        },
      };

      const { decoded } = buildAndEncode(mutation);
      const op = decoded.ad_group_criterion_operation;
      expect(op.update).toBeDefined();
      expect(op.update.resource_name).toBe(
        "customers/1234567890/adGroupCriteria/111~222",
      );
    });

    it("campaign update with resource_name + status encodes correctly", () => {
      const mutation = {
        entity: "campaign",
        operation: "update" as const,
        resource: {
          resource_name: "customers/1234567890/campaigns/100",
          status: 3, // PAUSED
        },
      };

      const { decoded } = buildAndEncode(mutation);
      const op = decoded.campaign_operation;
      expect(op.update).toBeDefined();
      expect(op.update.status).toBe("PAUSED");
    });
  });

  describe("full roundtrip: MutateGoogleAdsRequest", () => {
    it("builds a valid request with mixed create/update/remove ops", () => {
      const mutations = [
        {
          entity: "campaign",
          operation: "update" as const,
          resource: {
            resource_name: "customers/1234567890/campaigns/100",
            status: 2, // ENABLED
          },
        },
        {
          entity: "ad_group_criterion",
          operation: "remove" as const,
          resource: "customers/1234567890/adGroupCriteria/111~222",
        },
        {
          entity: "campaign_criterion",
          operation: "create" as const,
          resource: {
            campaign: "customers/1234567890/campaigns/100",
            negative: true,
            keyword: { text: "spam", match_type: 4 },
          },
        },
      ];

      const mutateOperations = mutations.map((mutation) => {
        const opKey = toSnakeCase(`${mutation.entity}Operation`);
        const operation: Record<string, unknown> = {
          [mutation.operation]: mutation.resource,
        };
        if (mutation.operation === "update") {
          operation.update_mask = getFieldMask(
            mutation.resource as Record<string, unknown>,
          );
        }
        return new services.MutateOperation({ [opKey]: operation });
      });

      const request = new services.MutateGoogleAdsRequest({
        customer_id: "1234567890",
        mutate_operations: mutateOperations,
      });

      // Encode the full request — this is what gets sent over the wire
      const encoded = services.MutateGoogleAdsRequest.encode(request).finish();
      expect(encoded.length).toBeGreaterThan(0);

      // Decode and verify
      const decoded = services.MutateGoogleAdsRequest.decode(encoded).toJSON();
      expect(decoded.customer_id).toBe("1234567890");
      expect(decoded.mutate_operations).toHaveLength(3);

      // Verify each operation roundtripped correctly
      const [updateOp, removeOp, createOp] = decoded.mutate_operations;
      expect(updateOp.campaign_operation.update.status).toBe("ENABLED");
      expect(removeOp.ad_group_criterion_operation.remove).toBe(
        "customers/1234567890/adGroupCriteria/111~222",
      );
      expect(createOp.campaign_criterion_operation.create.keyword.text).toBe(
        "spam",
      );
    });
  });
});
