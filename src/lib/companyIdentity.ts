import { supabase } from "@/integrations/supabase/client";

/**
 * Single source of truth for who the company legally is.
 * One row in `hr_company_identity`, read by HR letters and invoices alike —
 * nothing borrows the invoice profile for legal facts any more.
 */
export interface CompanyIdentity {
  id: string;
  legal_name: string;
  trade_name: string;
  cin: string;
  gstin: string;
  pan: string;
  registered_address: string;
  corporate_address: string;
  phone: string;
  email: string;
  website: string;
  logo_path: string | null;
  logo_url: string | null;
  /** Storage path of an uploaded A4 letterhead image (wins over letterhead_url). */
  letterhead_path: string | null;
  /** Fallback letterhead URL (the pre-seeded company letterhead). */
  letterhead_url: string | null;
  letterhead_margin_top_mm: number;
  letterhead_margin_bottom_mm: number;
  letterhead_margin_left_mm: number;
  letterhead_margin_right_mm: number;
}

export const COMPANY_IDENTITY_BUCKET = "company-identity";

export const DEFAULT_LETTERHEAD_MARGINS = {
  top: 35,
  bottom: 30,
  left: 19,
  right: 19,
};

export async function fetchCompanyIdentity(): Promise<CompanyIdentity | null> {
  const { data, error } = await (supabase as any)
    .from("hr_company_identity").select("*").limit(1).maybeSingle();
  if (error) throw error;
  return (data as CompanyIdentity) || null;
}

/** A signed, time-limited URL for a file inside the company-identity bucket. */
export async function signCompanyFile(path: string, seconds = 600): Promise<string | null> {
  const { data } = await supabase.storage.from(COMPANY_IDENTITY_BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl || null;
}

/** Read any URL back as a base64 data URI so printed artefacts stay self-contained. */
export async function toDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export interface LetterheadSpec {
  /** Full-page A4 background, inlined as a data URI. */
  imageDataUri: string | null;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
}

/**
 * Resolve the letterhead every letter is printed on. The image is a complete
 * A4 page (header band, footer band, watermark) that the letter body can never
 * overwrite — the body is confined to the configured safe area.
 */
export async function resolveLetterhead(identity: CompanyIdentity | null): Promise<LetterheadSpec> {
  const spec: LetterheadSpec = {
    imageDataUri: null,
    marginTopMm: Number(identity?.letterhead_margin_top_mm ?? DEFAULT_LETTERHEAD_MARGINS.top),
    marginBottomMm: Number(identity?.letterhead_margin_bottom_mm ?? DEFAULT_LETTERHEAD_MARGINS.bottom),
    marginLeftMm: Number(identity?.letterhead_margin_left_mm ?? DEFAULT_LETTERHEAD_MARGINS.left),
    marginRightMm: Number(identity?.letterhead_margin_right_mm ?? DEFAULT_LETTERHEAD_MARGINS.right),
  };
  if (!identity) return spec;

  const src = identity.letterhead_path
    ? await signCompanyFile(identity.letterhead_path)
    : identity.letterhead_url;
  if (src) spec.imageDataUri = await toDataUri(src);
  return spec;
}
