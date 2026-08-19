import { supabase } from "@/integrations/supabase/client";

/**
 * Some employee document rows point at a private bucket instead of a public
 * URL (issued HR letters live in `hr-doc-issued`). Those are stored as
 * `bucket://path` and resolved to a short-lived signed URL on demand.
 */
const PRIVATE_PREFIX = /^([a-z0-9-]+):\/\/(.+)$/i;

export function isPrivateDocRef(url?: string | null): boolean {
  return !!url && PRIVATE_PREFIX.test(url) && !/^https?:\/\//i.test(url);
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
  const resolved = await resolveDocUrl(url);
  window.open(resolved, "_blank", "noopener,noreferrer");
}
