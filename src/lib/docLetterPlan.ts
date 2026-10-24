/**
 * The letter plan: everything decided before a letter is issued — who signs it,
 * the value of every template variable, which details HR still has to type,
 * which resolved terms HR may adjust, and what to check first.
 *
 * Pure functions shared by Documents → Generate and the onboarding
 * "Send onboarding form" dialog, so a letter comes out the same whichever
 * screen issues it.
 */
import type { PlaceholderMapping } from "@/lib/docTemplate";
import { renderTemplateHtml } from "@/lib/docRender";
import {
  ALWAYS_EDITABLE_KEYS,
  SYSTEM_FILLED_KEYS,
  formatValue,
  isCtcDerivedResolver,
  salaryValues,
  type CatalogField,
  type ResolvedValues,
} from "@/lib/docResolvers";
import { MIN_ANNUAL_CTC, componentFieldStem, parseAmount } from "@/lib/docCtcBreakdown";

export type PlaceholderKind = "text" | "signature" | "seal";

export type TemplateSubject = "employee" | "candidate" | "any";

/** Who a template is issued to — offer letters go to candidates by default. */
export function templateSubject(t: { subject?: string | null; category?: string | null } | null | undefined): TemplateSubject {
  if (t?.subject === "employee" || t?.subject === "candidate" || t?.subject === "any") return t.subject;
  return t?.category === "offer" ? "candidate" : "employee";
}

export interface SignatoryRow {
  id: string;
  display_name?: string | null;
  designation?: string | null;
  signature_path?: string | null;
  seal_path?: string | null;
  [key: string]: unknown;
}

export type CatalogIndex = Map<string, CatalogField>;

export function catalogIndex(catalog: CatalogField[]): CatalogIndex {
  return new Map(catalog.map((c) => [c.field_key, c]));
}

/**
 * Placeholder kind comes from the mapping (explicit `kind`, else the mapped
 * variable's data type) — never from how the token happens to be spelled, so
 * {gm_signature} or {authorised_signatory} behave correctly.
 */
export function placeholderKind(m: PlaceholderMapping, byKey: CatalogIndex): PlaceholderKind {
  if (m.kind) return m.kind;
  const dt = m.field_key ? byKey.get(m.field_key)?.data_type : undefined;
  if (dt === "signature") return "signature";
  if (dt === "image") return "seal";
  return "text";
}

export function imageTokensOf(mappings: PlaceholderMapping[], byKey: CatalogIndex): Set<string> {
  return new Set(mappings.filter((m) => placeholderKind(m, byKey) !== "text").map((m) => m.token));
}

const SIGNATORY_NAME_TOKEN = /^signatory_name|^hr_name|_signatory_name/;
const SIGNATORY_DESIGNATION_TOKEN = /^signatory_designation|^hr_designation/;

export function isSignatoryNameMapping(m: PlaceholderMapping): boolean {
  return m.field_key === "signatory_name" || SIGNATORY_NAME_TOKEN.test(m.token);
}

export function isSignatoryDesignationMapping(m: PlaceholderMapping): boolean {
  return m.field_key === "signatory_designation" || SIGNATORY_DESIGNATION_TOKEN.test(m.token);
}

/** Values the system fills itself (reference number, issuer) — never asked, never blocking. */
export function isSystemMapping(m: PlaceholderMapping): boolean {
  return SYSTEM_FILLED_KEYS.has(m.field_key || m.token) || SYSTEM_FILLED_KEYS.has(m.token);
}

/** A signature image bound to a signatory fixes the signer; otherwise HR picks who signs. */
export function fixedSignatoryIdOf(mappings: PlaceholderMapping[], byKey: CatalogIndex): string | null {
  return mappings.find((m) => m.signatory_id && placeholderKind(m, byKey) !== "text")?.signatory_id || null;
}

export function usesSignatoryOf(mappings: PlaceholderMapping[], byKey: CatalogIndex): boolean {
  return mappings.some(
    (m) => placeholderKind(m, byKey) !== "text" || isSignatoryNameMapping(m) || isSignatoryDesignationMapping(m),
  );
}

/** The signatory the letter is signed by — every signatory variable follows it. */
export function signingSignatoryOf<S extends SignatoryRow>(
  fixedSignatoryId: string | null,
  signerId: string | null | undefined,
  signatories: S[],
): S | null {
  const id = fixedSignatoryId || signerId || (signatories.length === 1 ? signatories[0].id : null);
  return signatories.find((x) => x.id === id) || null;
}

/** Per-token signatory text (name / designation) so two signatories never collide. */
export function signatoryTokenValues(
  mappings: PlaceholderMapping[],
  signatories: SignatoryRow[],
  signing: SignatoryRow | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of mappings) {
    const isName = isSignatoryNameMapping(m);
    const isDesig = isSignatoryDesignationMapping(m);
    if (!isName && !isDesig) continue;
    const s = m.signatory_id ? signatories.find((x) => x.id === m.signatory_id) : signing;
    if (!s) continue;
    // Only real values here — an empty designation must fall through to what HR types.
    const v = isName ? s.display_name : s.designation;
    if (v) out[m.token] = String(v);
  }
  return out;
}

export function signatoryFieldValues(signing: SignatoryRow | null): Record<string, string> {
  return signing
    ? { signatory_name: String(signing.display_name || ""), signatory_designation: String(signing.designation || "") }
    : {};
}

/** The value one template token receives from a value set. */
export function mappingValue(
  m: PlaceholderMapping,
  tokenValues: Record<string, string>,
  vals: Record<string, unknown>,
): string {
  return String(tokenValues[m.token] ?? (m.field_key ? vals[m.field_key] : undefined) ?? vals[m.token] ?? "");
}

/** Token → merged value, as the locked Word lane receives it. */
export function docxTokenValues(
  mappings: PlaceholderMapping[],
  tokenValues: Record<string, string>,
  vals: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of mappings) out[m.token] = mappingValue(m, tokenValues, vals);
  return out;
}

/** Tokens without a value for a given value set (images and system values never count). */
export function pendingTokens(
  mappings: PlaceholderMapping[],
  imageTokens: Set<string>,
  tokenValues: Record<string, string>,
  vals: Record<string, unknown>,
): string[] {
  return mappings
    .filter((m) => !imageTokens.has(m.token) && !isSystemMapping(m) && !mappingValue(m, tokenValues, vals))
    .map((m) => m.token);
}

/** A token no dictionary variable covers is asked as plain text under a readable label. */
export function adHocField(key: string): CatalogField {
  return {
    field_key: key,
    label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    field_group: "custom",
    data_type: "text",
    formatter: null,
    resolver_id: null,
    is_sensitive: false,
    default_value: null,
  };
}

/**
 * Fields the letter needs that the records could not fill. Decided from the
 * records alone (`baseValues`), so an input stays on screen while HR types into
 * it. Salary variables are never asked one by one: they follow from the annual
 * CTC. `exclude` holds keys the calling screen asks for in its own inputs.
 */
export function promptFieldsFor(opts: {
  mappings: PlaceholderMapping[];
  baseValues: Record<string, unknown>;
  byKey: CatalogIndex;
  tokenValues: Record<string, string>;
  imageTokens: Set<string>;
  /** Native lane: tokens the rendered HTML could not fill from the records. */
  nativeUnresolved?: string[] | null;
  exclude?: Set<string>;
}): CatalogField[] {
  const { mappings, baseValues, byKey, tokenValues, imageTokens, nativeUnresolved, exclude } = opts;
  const byToken = new Map(mappings.map((m) => [m.token, m]));
  const keys = new Set<string>();
  for (const token of pendingTokens(mappings, imageTokens, tokenValues, baseValues)) {
    const key = byToken.get(token)?.field_key || token;
    if (isCtcDerivedResolver(byKey.get(key)?.resolver_id)) keys.add("annual_ctc");
    else keys.add(key);
  }
  // Native letters may hold tokens the editor never mapped.
  for (const t of nativeUnresolved || []) {
    if (imageTokens.has(t) || SYSTEM_FILLED_KEYS.has(t) || byToken.has(t)) continue;
    keys.add(t);
  }
  return [...keys].filter((k) => !exclude?.has(k)).map((key) => byKey.get(key) || adHocField(key));
}

/**
 * Resolved-but-adjustable fields this template uses (letter date, last working
 * day, probation and notice terms, work location) — letters are routinely dated
 * in the past and offer terms are agreed per person.
 */
export function editableFieldsFor(
  mappings: PlaceholderMapping[],
  byKey: CatalogIndex,
  promptKeys: Set<string>,
  exclude?: Set<string>,
): CatalogField[] {
  const used = new Set(
    mappings.map((m) => m.field_key).filter((k): k is string => !!k && ALWAYS_EDITABLE_KEYS.has(k)),
  );
  return [...used]
    .filter((k) => !promptKeys.has(k) && !exclude?.has(k))
    .map((k) => byKey.get(k))
    .filter(Boolean) as CatalogField[];
}

/** Does this template print any salary figure? Salary notes only matter then. */
export function printsSalaryOf(mappings: PlaceholderMapping[], byKey: CatalogIndex): boolean {
  return mappings.some((m) => {
    const rid = m.field_key ? byKey.get(m.field_key)?.resolver_id : null;
    return !!rid && (rid === "salary.annual_ctc" || isCtcDerivedResolver(rid));
  });
}

/** Non-blocking things to check before issuing. */
export function letterNotes(opts: {
  resolved: ResolvedValues | null | undefined;
  printsSalary: boolean;
  mappings: PlaceholderMapping[];
  byKey: CatalogIndex;
  needsSignerChoice: boolean;
}): string[] {
  const { resolved, printsSalary, mappings, byKey, needsSignerChoice } = opts;
  const out = [...(resolved?.notes || []), ...(printsSalary ? resolved?.salaryNotes || [] : [])];
  // A salary component in the standard structure that this template never prints
  // means its annexure rows will not add up to the CTC printed beside them.
  const printed = new Set<string>();
  for (const m of mappings) {
    const rid = m.field_key ? byKey.get(m.field_key)?.resolver_id : null;
    const hit = rid ? /^salary\.([a-z0-9_]+)_(monthly|annual)$/.exec(rid) : null;
    if (hit && hit[1] !== "monthly_ctc") printed.add(hit[1]);
  }
  if (printed.size && resolved) {
    for (const c of resolved.structure) {
      const stem = componentFieldStem(c.key);
      if (Number(c.value) > 0 && !printed.has(stem)) {
        out.push(`The standard structure includes ${c.label || c.key} (${c.mode === "fixed" ? "fixed" : `${c.value}%`}) but this template does not print it — its break-up will not add up to the CTC.`);
      }
    }
  }
  if (needsSignerChoice) out.push("Choose who signs this letter.");
  return out;
}

/**
 * What HR typed into a letter field, made printable — or refused with a message
 * when it cannot be used as it is (an amount that is not a number is never guessed).
 */
export function parseFieldInput(field: CatalogField, raw: string): { printable: string; error: string } {
  let error = "";
  let printable = "";
  if (raw.trim()) {
    if (field.data_type === "currency") {
      const n = parseAmount(raw);
      if (n === null) error = "Enter the amount in rupees, e.g. 1,63,200";
      else if (field.field_key === "annual_ctc" && n < MIN_ANNUAL_CTC) {
        error = "That looks too small for an annual CTC — enter the yearly figure in rupees";
      }
    }
    if (!error) printable = formatValue(raw, field.data_type, field.formatter);
  }
  return { printable, error };
}

/** Salary variables follow the annual CTC — HR's typed CTC when the record had none. */
export function effectiveAnnualCtc(rawTyped: string | undefined, resolvedCtc: number | null | undefined): number | null {
  const typed = parseAmount(rawTyped);
  return typed && typed >= MIN_ANNUAL_CTC ? typed : resolvedCtc ?? null;
}

export interface LetterPlanInput<S extends SignatoryRow = SignatoryRow> {
  mappings: PlaceholderMapping[];
  catalog: CatalogField[];
  signatories: S[];
  /** Signer HR picked (ignored when a signature image fixes the signer). */
  signerId?: string | null;
  resolved: ResolvedValues | null | undefined;
  /** Printable values HR entered, by field key. */
  overrides: Record<string, string>;
  /** Raw input HR typed, by field key (the annual CTC is read from here). */
  rawOverrides: Record<string, string>;
  /** Locked Word lane (merged into the .docx) rather than native HTML. */
  isDocx: boolean;
  /** Native lane: template HTML, signature images and issuer for the preview. */
  native?: { html: string | null | undefined; images: Record<string, string>; generatedBy?: string | null } | null;
  /** Keys the calling screen asks for in its own inputs — never prompted twice. */
  exclude?: Set<string>;
}

export interface LetterPlan<S extends SignatoryRow = SignatoryRow> {
  byKey: CatalogIndex;
  kindOf: (m: PlaceholderMapping) => PlaceholderKind;
  imageTokens: Set<string>;
  fixedSignatoryId: string | null;
  usesSignatory: boolean;
  signingSignatory: S | null;
  needsSignerChoice: boolean;
  tokenValues: Record<string, string>;
  /** What the records give, before anything HR types — decides which fields to ask for. */
  baseValues: Record<string, string>;
  /** Records + CTC break-up + signatory + HR's entries: what the letter prints. */
  values: Record<string, string>;
  docxValues: Record<string, string>;
  effectiveCtc: number | null;
  /** Native lane preview with a draft reference (null for Word templates). */
  rendered: { html: string; unresolved: string[] } | null;
  promptFields: CatalogField[];
  editableFields: CatalogField[];
  /** Prompt fields still empty. */
  stillToFill: number;
  /** Tokens without a value right now — issuing is blocked while any remain. */
  unresolvedTokens: string[];
  printsSalary: boolean;
  notes: string[];
}

/** Every decision about one letter for one person, from the records and HR's entries. */
export function planLetter<S extends SignatoryRow>(input: LetterPlanInput<S>): LetterPlan<S> {
  const { mappings, catalog, signatories, signerId, resolved, overrides, rawOverrides, isDocx, native, exclude } = input;
  const byKey = catalogIndex(catalog);
  const kindOf = (m: PlaceholderMapping) => placeholderKind(m, byKey);
  const imageTokens = imageTokensOf(mappings, byKey);
  const fixedSignatoryId = fixedSignatoryIdOf(mappings, byKey);
  const usesSignatory = usesSignatoryOf(mappings, byKey);
  const signingSignatory = signingSignatoryOf(fixedSignatoryId, signerId, signatories);
  const needsSignerChoice = usesSignatory && !fixedSignatoryId && !signingSignatory && signatories.length > 1;
  const tokenValues = signatoryTokenValues(mappings, signatories, signingSignatory);
  const signatoryValues = signatoryFieldValues(signingSignatory);

  const effectiveCtc = effectiveAnnualCtc(rawOverrides.annual_ctc, resolved?.annualCtc);
  const baseValues: Record<string, string> = resolved
    ? { ...resolved.values, ...salaryValues(resolved.annualCtc, resolved.structure, catalog), ...signatoryValues }
    : { ...signatoryValues };
  const values: Record<string, string> = resolved
    ? { ...resolved.values, ...salaryValues(effectiveCtc, resolved.structure, catalog), ...signatoryValues, ...overrides }
    : { ...signatoryValues, ...overrides };
  const docxValues = docxTokenValues(mappings, tokenValues, values);

  const renderNative = (vals: Record<string, string>, referenceNo: string) =>
    !isDocx && native?.html
      ? renderTemplateHtml(native.html, {
          values: { ...vals, reference_no: referenceNo, generated_by: vals.generated_by || native.generatedBy || "" },
          tokenValues,
          images: native.images,
          mappings,
        })
      : null;
  const rendered = renderNative(values, "BLY-DRAFT");
  // Prompts follow the records alone; a token HR has just typed must not vanish mid-typing.
  const renderedFromRecords = isDocx ? null : renderNative(baseValues, "BLY-DRAFT");

  const promptFields = resolved
    ? promptFieldsFor({
        mappings,
        baseValues,
        byKey,
        tokenValues,
        imageTokens,
        nativeUnresolved: renderedFromRecords?.unresolved || null,
        exclude,
      })
    : [];
  const promptKeys = new Set(promptFields.map((f) => f.field_key));
  const editableFields = editableFieldsFor(mappings, byKey, promptKeys, exclude);
  const stillToFill = promptFields.filter((f) => !String(values[f.field_key] ?? "").trim()).length;

  const unresolved = new Set(pendingTokens(mappings, imageTokens, tokenValues, values));
  if (!isDocx) {
    for (const t of rendered?.unresolved || []) if (!imageTokens.has(t) && !SYSTEM_FILLED_KEYS.has(t)) unresolved.add(t);
  }

  const printsSalary = printsSalaryOf(mappings, byKey);
  const notes = letterNotes({ resolved, printsSalary, mappings, byKey, needsSignerChoice });

  return {
    byKey,
    kindOf,
    imageTokens,
    fixedSignatoryId,
    usesSignatory,
    signingSignatory,
    needsSignerChoice,
    tokenValues,
    baseValues,
    values,
    docxValues,
    effectiveCtc,
    rendered,
    promptFields,
    editableFields,
    stillToFill,
    unresolvedTokens: [...unresolved],
    printsSalary,
    notes,
  };
}

/** Signatories this letter records as signing it. */
export function letterSignatoryIds(plan: Pick<LetterPlan, "usesSignatory" | "signingSignatory">, mappings: PlaceholderMapping[]): string[] {
  return [
    ...new Set(
      [...mappings.map((m) => m.signatory_id), plan.usesSignatory ? plan.signingSignatory?.id : null].filter(
        (x): x is string => !!x,
      ),
    ),
  ];
}
