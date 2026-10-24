/**
 * Does a candidate's live offer still say what their onboarding record says?
 *
 * The same comparison the "Send onboarding form" dialog makes, run headless, so
 * the Stage 1 card can warn when Stage 1 or Stage 2 changed the terms after the
 * offer went out, and "Resend email" never re-sends an outdated offer.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchCatalog, resolveSubjectValues, type CatalogField } from "@/lib/docResolvers";
import { catalogIndex, planLetter } from "@/lib/docLetterPlan";
import type { PlaceholderMapping } from "@/lib/docTemplate";
import {
  SEND_DIALOG_KEYS,
  SIGNED_BY_KEY,
  describeOfferChanges,
  offerChanges,
  offerPrefill,
  type LiveOffer,
} from "@/lib/hrms/selfServiceSend";

export const LIVE_OFFER_COLUMNS =
  "id, reference_no, template_id, template_version_id, values_snapshot, signatory_ids, pdf_path, status, issued_at, created_at, file_path, file_mime, employee_id, employee_document_id, template_name";

/** The candidate's newest live offer (created_at, then id — the order every screen and the server use). */
export async function fetchLiveOffer(onboardingId: string): Promise<(LiveOffer & Record<string, any>) | null> {
  const { data, error } = await (supabase as any)
    .from("hr_documents_issued")
    .select(LIVE_OFFER_COLUMNS)
    .eq("onboarding_id", onboardingId)
    .eq("category", "offer")
    .in("status", ["issued", "delivered"])
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export interface OfferFreshness {
  /** The candidate's current (newest live) offer. */
  offer: { id: string; reference_no: string } | null;
  /** The offer the form (joining package) carries, when it is not the current one. */
  packageOffer: { id: string; reference_no: string } | null;
  /** What differs between the current offer and the record (empty: it still matches). */
  changes: string[];
  /** The same, in words. */
  labels: string[];
}

/** Every read must succeed: a failed read is never mistaken for an outdated offer. */
function must(res: { data: any; error: unknown }, what: string): any {
  if (res.error) throw new Error(`Could not check the offer (${what}): ${(res.error as any)?.message || "unknown error"}`);
  return res.data;
}

export async function checkOfferFreshness(onboardingId: string): Promise<OfferFreshness> {
  const [live, record] = await Promise.all([
    fetchLiveOffer(onboardingId),
    (supabase as any).from("hr_employee_onboarding").select("date_of_joining, prejoining").eq("id", onboardingId).maybeSingle()
      .then((r: any) => must(r, "onboarding record")),
  ]);
  if (!live) return { offer: null, packageOffer: null, changes: [], labels: [] };
  const offer = { id: live.id, reference_no: live.reference_no };
  // The form must carry the current offer: a revision issued but not yet sent leaves it on an older one.
  const carried = (record?.prejoining?.enabled && record.prejoining.offer_file?.issued_id) || null;
  const packageOffer = carried && carried !== live.id
    ? { id: String(carried), reference_no: String(record.prejoining.offer_file.reference_no || record.prejoining.offer_reference || "") }
    : null;

  // A letter whose template was deleted keeps its own version (or none: then it counts as a template change).
  const template = live.template_id
    ? must(await (supabase as any).from("hr_doc_templates").select("id, current_version_id, status").eq("id", live.template_id).maybeSingle(), "template")
    : null;
  const versionId = template?.current_version_id || live.template_version_id;
  if (!versionId) return { offer, packageOffer, changes: ["template"], labels: ["the offer template"] };
  const [version, catalog, signatories] = await Promise.all([
    (supabase as any).from("hr_doc_template_versions").select("*").eq("id", versionId).maybeSingle().then((r: any) => must(r, "template version")),
    fetchCatalog(),
    (supabase as any).from("hr_doc_signatories").select("*").eq("is_active", true).then((r: any) => must(r, "signatories")),
  ]);
  if (!version) return { offer, packageOffer, changes: ["template"], labels: ["the offer template"] };

  const mappings: PlaceholderMapping[] = (version.placeholder_map as PlaceholderMapping[]) || [];
  const isDocx = version.lane === "docx" && !!version.source_file_path;
  const resolved = await resolveSubjectValues({ kind: "candidate", id: onboardingId }, catalog as CatalogField[]);
  const snap = (live.values_snapshot || {}) as Record<string, unknown>;
  const signerId = String(snap[SIGNED_BY_KEY] || "") || null;
  const base = {
    mappings,
    catalog: catalog as CatalogField[],
    signatories: (signatories || []) as any[],
    signerId,
    resolved,
    isDocx,
    native: { html: version.content_html, images: {} },
    exclude: SEND_DIALOG_KEYS,
  };
  // Everything HR typed for the live offer carries over (dates and amounts too: no one re-types them here).
  const first = planLetter({ ...base, overrides: {}, rawOverrides: {} });
  const typed = offerPrefill(snap, mappings, first.promptFields, first.editableFields, { allTypes: true });
  const plan = planLetter({ ...base, overrides: typed, rawOverrides: typed });
  const byKey = catalogIndex(catalog as CatalogField[]);
  const changes = offerChanges(live, plan.docxValues, mappings, versionId, typed, (plan.signingSignatory as any)?.id || null);
  // The joining date the letter was issued for, once (whatever its token is called).
  const dojIso = String(snap.joining_date_iso || "");
  const dojPrinted = mappings.some((m) => m.field_key === "date_of_joining" && changes.includes(m.token));
  if (dojIso && record?.date_of_joining && dojIso !== record.date_of_joining && !dojPrinted) changes.push("date_of_joining_iso");
  return { offer, packageOffer, changes, labels: describeOfferChanges(changes, mappings, byKey) };
}
