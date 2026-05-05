import {
  fieldDataTypes as adsFieldDataTypes,
  fields as adsFields,
} from "google-ads-api/build/src/protos/autogen/fields";
import { enums as adsEnums } from "google-ads-api/build/src/protos/autogen/enums";

// ─── Humanized Response Contract ─────────────────────────────────────
//
// Shipped library (google-ads-api v22) carries:
//   - `fields.enumFields`: { "<resource>.<field>": "<EnumName>" }  (432 entries)
//   - `enums.<EnumName>`:  bidirectional { [number]: string, [string]: number }  (352 enums)
//
// We use both as the single source of truth so the humanizer needs no
// hand-maintained enum table — every enum field Google ships is covered.
//
// Augmentation is **non-destructive**:
//   - Enum integer at `campaign.bidding_strategy_type = 10`
//       → adds sibling `bidding_strategy_type_name = "MAXIMIZE_CONVERSIONS"`,
//         leaves the original integer in place.
//   - Money in micros at `campaign.target_cpa.target_cpa_micros = 11000000`
//       → adds sibling `target_cpa_value = 11`, leaves micros in place.
//
// Why augment instead of replace? Mutation tools (write-tools.ts) and internal
// readers (bulk.ts, campaign-ops.ts) compare against the raw integer/micros
// shape today. Replacing breaks those callers; augmenting is purely additive
// so the LLM gets a readable name without invalidating any existing path.

// Build O(1) field-path → enum integer-to-name lookup once at module load.
// Skips any enum the field map references but the enum module doesn't ship —
// google-ads-api occasionally lags behind the API metadata, and we'd rather
// silently no-op than throw on field paths nobody queries anyway.
const ENUM_NAME_BY_PATH: Record<string, Record<number, string>> = (() => {
  const out: Record<string, Record<number, string>> = {};
  const enumFields = (adsFields as { enumFields?: Record<string, string> }).enumFields ?? {};
  for (const [path, enumName] of Object.entries(enumFields)) {
    const enumObj = (adsEnums as Record<string, unknown>)[enumName];
    if (!enumObj || typeof enumObj !== "object") continue;
    const nameByValue: Record<number, string> = {};
    for (const [k, v] of Object.entries(enumObj)) {
      // TypeScript-emitted bidirectional enums have BOTH "NAME": 10 and "10": "NAME".
      // We want the integer→name direction, which is the entries where the key
      // parses as a number.
      const asNum = Number(k);
      if (Number.isInteger(asNum) && typeof v === "string") nameByValue[asNum] = v;
    }
    if (Object.keys(nameByValue).length > 0) out[path] = nameByValue;
  }
  Object.assign(out, enumMapsFromFieldDataTypes());
  return out;
})();

type FieldSchema = Record<string, unknown>;

function enumMapsFromFieldDataTypes(): Record<string, Record<number, string>> {
  const out: Record<string, Record<number, string>> = {};
  let schema: FieldSchema;
  try {
    schema = JSON.parse(adsFieldDataTypes) as FieldSchema;
  } catch {
    return out;
  }

  for (const [path, node] of Object.entries(schema)) {
    if (!isGaqlRootPath(path)) continue;
    walkFieldSchema(schema, node, path, out, new Set());
  }
  return out;
}

function walkFieldSchema(
  schema: FieldSchema,
  node: unknown,
  path: string,
  out: Record<string, Record<number, string>>,
  seenRefs: Set<string>,
) {
  const resolved = resolveFieldSchemaRef(schema, node, seenRefs);
  if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) return;

  const enumMap = enumMapFromSchemaNode(resolved);
  if (enumMap) {
    out[path] = enumMap;
    return;
  }

  for (const [key, child] of Object.entries(resolved)) {
    walkFieldSchema(schema, child, `${path}.${key}`, out, new Set(seenRefs));
  }
}

function resolveFieldSchemaRef(
  schema: FieldSchema,
  node: unknown,
  seenRefs: Set<string>,
): unknown {
  let current = node;
  while (
    current &&
    typeof current === "object" &&
    !Array.isArray(current) &&
    typeof (current as { $ref?: unknown }).$ref === "string"
  ) {
    const ref = (current as { $ref: string }).$ref;
    if (seenRefs.has(ref)) return undefined;
    seenRefs.add(ref);
    current = resolveJsonPointer(schema, ref);
  }
  return current;
}

function resolveJsonPointer(schema: FieldSchema, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  return ref
    .slice(2)
    .split("/")
    .reduce<unknown>((node, part) => {
      if (!node || typeof node !== "object" || Array.isArray(node)) return undefined;
      return (node as FieldSchema)[part];
    }, schema);
}

function enumMapFromSchemaNode(node: object): Record<number, string> | undefined {
  const entries = Object.entries(node);
  if (entries.length === 0 || !entries.every(([, value]) => typeof value === "number")) {
    return undefined;
  }
  const nameByValue: Record<number, string> = {};
  for (const [name, value] of entries) {
    if (Number.isInteger(value)) nameByValue[value] = name;
  }
  return Object.keys(nameByValue).length > 0 ? nameByValue : undefined;
}

function isGaqlRootPath(path: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(path);
}

/** Exposed for tests. */
export function _enumNameForPath(path: string, value: number): string | undefined {
  return ENUM_NAME_BY_PATH[path]?.[value];
}

/** Exposed for tests. */
export function _enumPathCount(): number {
  return Object.keys(ENUM_NAME_BY_PATH).length;
}

/**
 * Recursively walk a GAQL row, augmenting enum integers with `<field>_name`
 * companions and `_micros` numbers with `<field-stripped>_value` companions.
 *
 * `path` is the dotted resource-relative path used to look up enum metadata
 * (e.g. `"campaign.bidding_strategy_type"`). The top-level keys of a GAQL
 * row are resource names (`campaign`, `metrics`, `segments`), so the path
 * grows naturally from those.
 *
 * Mutates the input shallowly per object level. Returns the same object so
 * callers can chain. Arrays are walked element-wise (Google returns repeated
 * fields like `final_urls` as arrays of primitives — those don't need any
 * extra handling because no GAQL repeated field is itself an enum).
 */
function humanizeNode(node: unknown, path: string): unknown {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) humanizeNode(node[i], path);
    return node;
  }
  if (node === null || typeof node !== "object") return node;

  const obj = node as Record<string, unknown>;
  // Snapshot keys before mutating — we're about to add `_name` / `_value`
  // siblings and don't want to walk our own additions.
  const keys = Object.keys(obj);

  for (const key of keys) {
    const childPath = path ? `${path}.${key}` : key;
    const value = obj[key];

    // Recurse into nested objects/arrays first so we hit deeper enums and
    // micros before considering augmentation at this level.
    if (value !== null && typeof value === "object") {
      humanizeNode(value, childPath);
      continue;
    }

    // Enum augmentation — only when the value is an integer AND the field
    // path is a known enum field. String-form enums (some response decoders
    // already return names) are left alone; double-wrapping into
    // `<field>_name` would be redundant.
    if (typeof value === "number" && Number.isInteger(value)) {
      const nameMap = ENUM_NAME_BY_PATH[childPath];
      if (nameMap) {
        const name = nameMap[value];
        if (name && !(`${key}_name` in obj)) obj[`${key}_name`] = name;
        continue;
      }
    }

    // Money augmentation — any numeric `_micros` field gets a `_value`
    // sibling in major units (micros / 1e6). Currency-agnostic by design:
    // Google stores all currencies in micros, so the division is correct
    // for USD, EUR, JPY, etc. Display formatting (JPY zero-decimal, locale
    // separators) is a later layer.
    if (typeof value === "number" && key.endsWith("_micros")) {
      const baseKey = key.slice(0, -"_micros".length);
      const valueKey = `${baseKey}_value`;
      if (!(valueKey in obj)) obj[valueKey] = value / 1_000_000;
    }
  }

  return obj;
}

/**
 * Augment GAQL response rows in-place with humanized enum names and
 * micros→major-unit values. Safe to call on already-humanized rows: the
 * augmentation checks for the sibling key before writing.
 */
export function humanizeGaqlRows<T>(rows: T[]): T[] {
  for (const row of rows) humanizeNode(row, "");
  return rows;
}
