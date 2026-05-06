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
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];

  return Object.entries(value).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key));
}

function getAtPath(value: JsonValue, keyPath: string): JsonValue {
  return keyPath.split(".").reduce<JsonValue>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined as unknown as JsonValue;
    return current[key];
  }, value);
}

function placeholders(value: JsonValue): string[] {
  if (typeof value !== "string") return [];
  return Array.from(value.matchAll(/\{([A-Za-z0-9_]+)(?:[,}])/g), (match) => match[1]).sort();
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
});
