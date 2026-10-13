import { supabase } from "@/integrations/supabase/client";
import { PRIVATE_DOCUMENT_BUCKETS, parseStorageRef } from "@/lib/storage-url";

/**
 * Some employee document rows point at a private bucket instead of a public
 * URL (issued HR letters live in `hr-doc-issued`). Those are stored as
 * `bucket://path` and resolved to a short-lived signed URL on demand.
 *
 * Historic rows (onboarding submissions, employee KYC uploads) still hold a
 * `/storage/v1/object/public/<bucket>/<path>` string for buckets that are in
 * fact PRIVATE — opening those directly returns `NoSuchBucket`. Those URLs are
 * parsed back into (bucket, path) and signed/downloaded on read as well.
 */
const PRIVATE_PREFIX = /^([a-z0-9-]+):\/\/(.+)$/i;

export function isPrivateDocRef(url?: string | null): boolean {
  return !!url && PRIVATE_PREFIX.test(url) && !/^https?:\/\//i.test(url);
}

/** (bucket, path) for any reference that needs signing, else null. */
function resolvePrivateRef(url?: string | null): { bucket: string; path: string } | null {
  if (!url) return null;
  const m = isPrivateDocRef(url) ? PRIVATE_PREFIX.exec(url) : null;
  if (m) return { bucket: m[1], path: m[2] };
  const ref = parseStorageRef(url);
  if (ref && PRIVATE_DOCUMENT_BUCKETS.has(ref.bucket)) return ref;
  return null;
}

export function privateDocRef(bucket: string, path: string): string {
  return `${bucket}://${path}`;
}

/** Resolve any stored document reference into an openable URL. */
export async function resolveDocUrl(url: string): Promise<string> {
  const ref = resolvePrivateRef(url);
  if (!ref) return url;
  const { data, error } = await supabase.storage.from(ref.bucket).createSignedUrl(ref.path, 300);
  if (error || !data?.signedUrl) throw error || new Error("Could not open this document");
  return data.signedUrl;
}

/**
 * Open a stored document in a new tab, signing private references first.
 *
 * Security: private files are opened via a short-lived signed URL so they are
 * served from the storage domain — never as an app-origin blob: URL, where an
 * uploaded SVG/HTML could run script with the signed-in HR session. The tab is
 * opened synchronously (popup-blocker safe) and its opener link is cut.
 */
export async function openStoredDocument(url: string) {
  const preview = window.open("", "_blank");
  if (preview) {
    try { preview.opener = null; } catch { /* ignore */ }
  }
  try {
    const target = await resolveDocUrl(url);
    if (preview && !preview.closed) preview.location.replace(target);
    else window.open(target, "_blank", "noopener,noreferrer");
  } catch (error) {
    if (preview && !preview.closed) preview.close();
    throw error;
  }
}
