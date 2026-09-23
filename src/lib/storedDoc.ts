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
  const m = isPrivateDocRef(url) ? PRIVATE_PREFIX.exec(url) : null;
  if (!m) return url;
  const [, bucket, path] = m;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw error || new Error("Could not open this document");
  return data.signedUrl;
}

/** Open a stored document in a new tab, signing private references first. */
export async function openStoredDocument(url: string) {
  const preview = window.open("", "_blank");
  try {
    const match = isPrivateDocRef(url) ? PRIVATE_PREFIX.exec(url) : null;
    if (!match) {
      if (preview && !preview.closed) preview.location.replace(url);
      else window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    const [, bucket, path] = match;
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data) throw error || new Error("Could not open this document");
    const objectUrl = URL.createObjectURL(data);
    if (preview && !preview.closed) {
      preview.location.replace(objectUrl);
    } else {
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = path.split("/").pop() || "document";
      link.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (error) {
    if (preview && !preview.closed) preview.close();
    throw error;
  }
}
