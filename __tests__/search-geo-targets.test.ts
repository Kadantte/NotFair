/**
 * Tests for searchGeoTargets — validates response parsing and error handling
 * for the GeoTargetConstantService.SuggestGeoTargetConstants API.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSuggestGeoTargetConstants = vi.fn();
const mockCustomer = {
  geoTargetConstants: {
    suggestGeoTargetConstants: mockSuggestGeoTargetConstants,
  },
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

import { searchGeoTargets, type AuthContext } from "@/lib/google-ads";

const AUTH: AuthContext = {
  refreshToken: "test-token",
  customerId: "123-456-7890",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchGeoTargets", () => {
  it("parses snake_case response format", async () => {
    mockSuggestGeoTargetConstants.mockResolvedValue({
      geo_target_constant_suggestions: [
        {
          geo_target_constant: {
            resource_name: "geoTargetConstants/9061650",
            name: "Kitsap County",
            canonical_name: "Kitsap County,Washington,United States",
            target_type: "County",
            country_code: "US",
          },
          reach: 250000,
          search_term: "Kitsap County",
        },
      ],
    });

    const result = await searchGeoTargets(AUTH, "Kitsap County", "US");

    expect(result.query).toBe("Kitsap County");
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({
      id: "9061650",
      resourceName: "geoTargetConstants/9061650",
      name: "Kitsap County",
      canonicalName: "Kitsap County,Washington,United States",
      targetType: "County",
      countryCode: "US",
      reach: 250000,
      searchTerm: "Kitsap County",
    });
  });

  it("parses camelCase response format", async () => {
    mockSuggestGeoTargetConstants.mockResolvedValue({
      geoTargetConstantSuggestions: [
        {
          geoTargetConstant: {
            resourceName: "geoTargetConstants/1014044",
            name: "Pierce County",
            canonicalName: "Pierce County,Washington,United States",
            targetType: "County",
            countryCode: "US",
          },
          reach: 800000,
          searchTerm: "Pierce County",
        },
      ],
    });

    const result = await searchGeoTargets(AUTH, "Pierce County", "US");

    expect(result.results).toHaveLength(1);
    expect(result.results[0].id).toBe("1014044");
    expect(result.results[0].name).toBe("Pierce County");
  });

  it("parses flat array response format", async () => {
    mockSuggestGeoTargetConstants.mockResolvedValue([
      {
        geo_target_constant: {
          resource_name: "geoTargetConstants/2840",
          name: "United States",
          canonical_name: "United States",
          target_type: "Country",
          country_code: "US",
        },
        reach: 300000000,
        search_term: "United States",
      },
    ]);

    const result = await searchGeoTargets(AUTH, "United States");

    expect(result.results).toHaveLength(1);
    expect(result.results[0].id).toBe("2840");
    expect(result.results[0].targetType).toBe("Country");
  });

  it("returns empty results for no matches", async () => {
    mockSuggestGeoTargetConstants.mockResolvedValue({
      geo_target_constant_suggestions: [],
    });

    const result = await searchGeoTargets(AUTH, "Nonexistent Place");

    expect(result.query).toBe("Nonexistent Place");
    expect(result.results).toHaveLength(0);
  });

  it("limits results to 10", async () => {
    const suggestions = Array.from({ length: 15 }, (_, i) => ({
      geo_target_constant: {
        resource_name: `geoTargetConstants/${1000 + i}`,
        name: `Place ${i}`,
        canonical_name: `Place ${i},Country`,
        target_type: "City",
        country_code: "US",
      },
      reach: 100000 - i * 1000,
    }));

    mockSuggestGeoTargetConstants.mockResolvedValue({
      geo_target_constant_suggestions: suggestions,
    });

    const result = await searchGeoTargets(AUTH, "Place");

    expect(result.results).toHaveLength(10);
  });

  it("passes countryCode and locale to the API", async () => {
    mockSuggestGeoTargetConstants.mockResolvedValue({
      geo_target_constant_suggestions: [],
    });

    await searchGeoTargets(AUTH, "Vancouver", "CA", "fr");

    expect(mockSuggestGeoTargetConstants).toHaveBeenCalledWith({
      locale: "fr",
      country_code: "CA",
      location_names: { names: ["Vancouver"] },
    });
  });

  it("defaults locale to 'en' and omits country_code when not provided", async () => {
    mockSuggestGeoTargetConstants.mockResolvedValue({
      geo_target_constant_suggestions: [],
    });

    await searchGeoTargets(AUTH, "London");

    expect(mockSuggestGeoTargetConstants).toHaveBeenCalledWith({
      locale: "en",
      location_names: { names: ["London"] },
    });
  });

  it("throws a descriptive error on API failure", async () => {
    mockSuggestGeoTargetConstants.mockRejectedValue(
      new Error("PERMISSION_DENIED: access not allowed"),
    );

    await expect(searchGeoTargets(AUTH, "Seattle")).rejects.toThrow(
      'Geo target search failed for "Seattle"',
    );
  });

  it("normalizes countryCode to uppercase and trims query", async () => {
    mockSuggestGeoTargetConstants.mockResolvedValue({
      geo_target_constant_suggestions: [],
    });

    await searchGeoTargets(AUTH, "  Seattle  ", "us");

    expect(mockSuggestGeoTargetConstants).toHaveBeenCalledWith({
      locale: "en",
      country_code: "US",
      location_names: { names: ["Seattle"] },
    });
  });

  it("coerces reach from string to number", async () => {
    mockSuggestGeoTargetConstants.mockResolvedValue({
      geo_target_constant_suggestions: [
        {
          geo_target_constant: {
            resource_name: "geoTargetConstants/9061650",
            name: "Kitsap County",
          },
          reach: "250000",
        },
      ],
    });

    const result = await searchGeoTargets(AUTH, "Kitsap");

    expect(result.results[0].reach).toBe(250000);
    expect(typeof result.results[0].reach).toBe("number");
  });

  it("filters out results with empty IDs", async () => {
    mockSuggestGeoTargetConstants.mockResolvedValue({
      geo_target_constant_suggestions: [
        {
          geo_target_constant: {
            resource_name: "geoTargetConstants/9061650",
            name: "Kitsap County",
          },
          reach: 250000,
        },
        {
          // Missing resource_name — produces empty id
          geo_target_constant: {
            name: "Unknown Place",
          },
          reach: 100,
        },
      ],
    });

    const result = await searchGeoTargets(AUTH, "Kitsap");

    expect(result.results).toHaveLength(1);
    expect(result.results[0].name).toBe("Kitsap County");
  });
});
