import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { locales } from "@/i18n/locales";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type MessageObject = { [key: string]: JsonValue };

const messagesDir = path.join(process.cwd(), "messages");

function readMessages(locale: string): MessageObject {
  return JSON.parse(fs.readFileSync(path.join(messagesDir, `${locale}.json`), "utf8")) as MessageObject;
}

function flattenKeys(value: JsonValue, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((child, index) => flattenKeys(child, prefix ? `${prefix}.${index}` : String(index)));
  }

  if (!value || typeof value !== "object") return [prefix];

  return Object.entries(value).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key));
}

function getAtPath(value: JsonValue, keyPath: string): JsonValue {
  return keyPath.split(".").reduce<JsonValue>((current, key) => {
    if (Array.isArray(current)) return current[Number(key)] ?? undefined as unknown as JsonValue;
    if (!current || typeof current !== "object") return undefined as unknown as JsonValue;
    return current[key];
  }, value);
}

function placeholders(value: JsonValue): string[] {
  if (typeof value !== "string") return [];
  return Array.from(value.matchAll(/\{([A-Za-z0-9_]+)(?:[,}])/g), (match) => match[1]).sort();
}

const marketingCopyNamespaces = [
  "SetupGuidesMenu",
  "McpSetupHero",
  "MarketingEngine",
  "Pricing",
  "McpPage",
  "GoogleAdsMcpPage",
  "MetaAdsMcpPage",
  "GoogleAdsClaudePage",
  "GoogleAdsAuditPage",
];

const allowedIdenticalMarketingValues = new Set([
  "Claude Code",
  "Claude Desktop",
  "Codex",
  "CPC",
  "CPA",
  "Google Ads",
  "Hermes",
  "Meta Ads",
  "MCP",
  "NotFair",
  "OAuth",
  "ROAS",
]);

function isAllowedIdenticalMarketingCopy(key: string, value: string): boolean {
  if (!/[A-Za-z]/.test(value)) return true;
  if (allowedIdenticalMarketingValues.has(value.replace(/[.:]$/u, ""))) return true;
  if (/\.(agentName|delta|impact|name|num|rank|roas|spend|value)$/.test(key)) return true;
  if (/\.tools\.items\.\d+\.name$/.test(key)) return true;

  return false;
}

describe("i18n message bundles", () => {
  const englishMessages = readMessages("en");
  const englishKeys = flattenKeys(englishMessages).sort();

  it("keeps every locale in key parity with English", () => {
    for (const locale of locales) {
      const localeMessages = readMessages(locale);

      expect(flattenKeys(localeMessages).sort(), locale).toEqual(englishKeys);
    }
  });

  it("keeps ICU placeholder names consistent across locales", () => {
    for (const locale of locales) {
      const localeMessages = readMessages(locale);

      for (const key of englishKeys) {
        expect(placeholders(getAtPath(localeMessages, key)), `${locale}:${key}`).toEqual(
          placeholders(getAtPath(englishMessages, key)),
        );
      }
    }
  });

  it("localizes shared homepage sections, not only the top hero", () => {
    const representativeKeys = [
      "McpSetupHero.intro",
      "MarketingEngine.chapters.0.title",
      "Pricing.header.title",
      "SetupGuidesMenu.button",
    ];

    for (const locale of locales) {
      const localeMessages = readMessages(locale);

      for (const key of representativeKeys) {
        const value = getAtPath(localeMessages, key);
        expect(typeof value, `${locale}:${key}`).toBe("string");

        if (locale !== "en") {
          expect(value, `${locale}:${key}`).not.toBe(getAtPath(englishMessages, key));
        }
      }
    }
  });

  it("localizes representative major marketing pages", () => {
    const representativeKeys = [
      "McpPage.useCases.0.body",
      "GoogleAdsMcpPage.hero.title",
      "MetaAdsMcpPage.tools.title",
      "GoogleAdsClaudePage.hero.body",
      "GoogleAdsAuditPage.findings.title",
    ];

    for (const locale of locales) {
      const localeMessages = readMessages(locale);

      for (const key of representativeKeys) {
        const value = getAtPath(localeMessages, key);
        expect(typeof value, `${locale}:${key}`).toBe("string");

        if (locale !== "en") {
          expect(value, `${locale}:${key}`).not.toBe(getAtPath(englishMessages, key));
        }
      }
    }
  });

  it("does not copy visible English marketing copy into non-English locales", () => {
    const englishMarketingEntries = new Map(
      marketingCopyNamespaces.flatMap((namespace) => (
        flattenKeys(englishMessages[namespace] ?? {}, namespace).map((key) => [key, getAtPath(englishMessages, key)] as const)
      )),
    );

    for (const locale of locales) {
      if (locale === "en") continue;

      const localeMessages = readMessages(locale);

      for (const [key, englishValue] of englishMarketingEntries) {
        if (typeof englishValue !== "string") continue;

        const localeValue = getAtPath(localeMessages, key);
        if (typeof localeValue !== "string") continue;
        if (isAllowedIdenticalMarketingCopy(key, localeValue)) continue;

        expect(localeValue, `${locale}:${key}`).not.toBe(englishValue);
      }
    }
  });
});
