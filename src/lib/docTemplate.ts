// Canonical placeholder syntax for HR Document Studio templates.
//   {field_key}        -> a variable
//   {sign1} {sign2}    -> repeated "instances" of the same kind, mapped separately
//   {{ and }}          -> literal braces (escaped)
// Matching is case-insensitive and tolerant of spaces: "{ Employee Name }" === "{employee_name}".

export interface ParsedPlaceholder {
  /** Raw text as written inside the braces, e.g. " Employee Name " */
  raw: string;
  /** Normalised token, e.g. "employee_name" or "sign2" */
  token: string;
  /** Token with any trailing instance number stripped, e.g. "sign" */
  base: string;
  /** Instance number when the token ends with digits, e.g. 2 for "sign2" */
  instance: number | null;
  /** How many times this token occurs in the document */
  count: number;
}

export interface ParseResult {
  placeholders: ParsedPlaceholder[];
  /** Braces we could not parse (unclosed / empty / illegal characters) */
  unparsed: string[];
}

const ESCAPE_OPEN = "\u0000LBRACE\u0000";
const ESCAPE_CLOSE = "\u0000RBRACE\u0000";

export function normaliseToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function splitInstance(token: string): { base: string; instance: number | null } {
  const m = token.match(/^([a-z_][a-z0-9_]*?)_?(\d+)$/);
  if (!m) return { base: token, instance: null };
  return { base: m[1], instance: Number(m[2]) };
}

/**
 * Remove regions that must never be scanned for placeholders — a CSS rule like
 * `body { margin: 0 }` inside an imported letterhead is not a variable.
 */
export function stripNonContentRegions(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

/** Strip HTML tags to plain text so placeholders split across formatting runs still resolve. */
export function htmlToText(html: string): string {
  return stripNonContentRegions(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}


export function parsePlaceholders(source: string, isHtml = true): ParseResult {
  const text = (isHtml ? htmlToText(source) : source)
    .replace(/\{\{/g, ESCAPE_OPEN)
    .replace(/\}\}/g, ESCAPE_CLOSE);

  const found = new Map<string, ParsedPlaceholder>();
  const unparsed: string[] = [];

  const re = /\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const raw = match[1];
    const token = normaliseToken(raw);
    if (!token) {
      unparsed.push(match[0]);
      continue;
    }
    const existing = found.get(token);
    if (existing) {
      existing.count += 1;
    } else {
      const { base, instance } = splitInstance(token);
      found.set(token, { raw, token, base, instance, count: 1 });
    }
  }

  // Any brace left over after removing well-formed pairs is malformed.
  const leftovers = text.replace(re, "");
  for (const bad of leftovers.match(/\{[^{}]*|[^{}]*\}/g) || []) {
    const trimmed = bad.trim();
    if (trimmed === "{" || trimmed === "}" || /[{}]/.test(trimmed)) {
      if (/[{}]/.test(trimmed)) unparsed.push(trimmed.slice(0, 40));
    }
  }

  return { placeholders: [...found.values()], unparsed: [...new Set(unparsed)] };
}

/** Render escaped braces back to literal characters for display/output. */
export function unescapeBraces(text: string): string {
  return text.replace(/\{\{/g, "{").replace(/\}\}/g, "}");
}

export type PlaceholderMapping = {
  token: string;
  field_key: string | null;
  /** Explicit placeholder kind — never inferred from the token spelling. */
  kind?: "text" | "signature" | "seal";
  /** For signature/image kinds: the chosen signatory */
  signatory_id?: string | null;
  label?: string | null;
};


/** The slice of a variable-dictionary entry that auto-mapping needs. */
export interface DictionaryEntry {
  field_key: string;
  aliases?: string[] | null;
  data_type?: string | null;
}

/**
 * Normalised spelling → dictionary key. A field's own key always wins over
 * another field's alias, so adding an alias can never hijack an existing key.
 */
export function buildAliasIndex(catalog: DictionaryEntry[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const f of catalog) {
    const key = normaliseToken(f.field_key || "");
    if (key && !index.has(key)) index.set(key, f.field_key);
  }
  for (const f of catalog) {
    for (const a of f.aliases || []) {
      const alias = normaliseToken(String(a || ""));
      if (alias && !index.has(alias)) index.set(alias, f.field_key);
    }
  }
  return index;
}

/** Dictionary key a template token refers to: exact key, alias, then the un-numbered base ({sign2} → sign). */
export function autoMapToken(token: string, index: Map<string, string>): string | null {
  const t = normaliseToken(token);
  if (!t) return null;
  if (index.has(t)) return index.get(t)!;
  const { base, instance } = splitInstance(t);
  if (instance !== null && base && index.has(base)) return index.get(base)!;
  return null;
}

export function kindForDataType(dataType?: string | null): "text" | "signature" | "seal" {
  if (dataType === "signature") return "signature";
  if (dataType === "image") return "seal";
  return "text";
}

/**
 * Keep existing mappings, add new tokens, and — when the dictionary is known —
 * map every still-unmapped token to the shared variable it names, so a template
 * using {{CANDIDATE_NAME}} or {{EMPLOYEE_NAME}} needs no manual mapping.
 * An explicit mapping is never overwritten.
 */
export function mergeMappings(
  placeholders: ParsedPlaceholder[],
  existing: PlaceholderMapping[],
  catalog?: DictionaryEntry[]
): PlaceholderMapping[] {
  const byToken = new Map(existing.map((m) => [m.token, m]));
  const merged = placeholders.map(
    (p) => byToken.get(p.token) || { token: p.token, field_key: null, signatory_id: null }
  );
  return catalog && catalog.length ? autoFillMappings(merged, catalog) : merged;
}

/**
 * Fill only the mappings that are still empty from the dictionary. Never adds,
 * removes or changes a mapping — safe to run whenever the dictionary loads.
 */
export function autoFillMappings(mappings: PlaceholderMapping[], catalog: DictionaryEntry[]): PlaceholderMapping[] {
  if (!catalog.length || !mappings.some((m) => !m.field_key)) return mappings;
  const index = buildAliasIndex(catalog);
  const typeOf = new Map(catalog.map((f) => [f.field_key, f.data_type]));
  let changed = false;
  const out = mappings.map((m) => {
    if (m.field_key) return m;
    const key = autoMapToken(m.token, index);
    if (!key) return m;
    changed = true;
    return { ...m, field_key: key, kind: kindForDataType(typeOf.get(key)) };
  });
  return changed ? out : mappings;
}
