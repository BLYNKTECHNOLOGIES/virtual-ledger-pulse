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


export function mergeMappings(
  placeholders: ParsedPlaceholder[],
  existing: PlaceholderMapping[]
): PlaceholderMapping[] {
  const byToken = new Map(existing.map((m) => [m.token, m]));
  return placeholders.map(
    (p) => byToken.get(p.token) || { token: p.token, field_key: null, signatory_id: null }
  );
}
