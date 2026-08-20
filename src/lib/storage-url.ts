import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Buckets that hold PII / KYC / financial documents. They are PRIVATE in
 * Supabase Storage, so their objects can only be read through a short-lived
 * signed URL created for an authenticated, RLS-authorised session.
 *
 * Historic rows still store the old `/storage/v1/object/public/<bucket>/<path>`
 * strings — those are parsed back into (bucket, path) and re-signed on read, so
 * nothing needs to be migrated in the database.
 */
export const PRIVATE_DOCUMENT_BUCKETS = new Set([
  "kyc-documents",
  "employee-documents",
  "investigation-documents",
  "documents",
  "sales_attachments",
  "transaction-bills",
  "internal-chat-files",
  "task-attachments",
]);

export const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export type StorageRef = { bucket: string; path: string };

/** Pull (bucket, path) out of a stored public/sign storage URL. */
export function parseStorageRef(url: string): StorageRef | null {
  if (!url) return null;
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return { bucket: decodeURIComponent(m[1]), path: decodeURIComponent(m[2].split("?")[0]) };
}

const cache = new Map<string, { url: string; expires: number }>();

/**
 * Resolve any stored document reference to a URL the browser can actually open.
 * Public buckets / external URLs pass through untouched.
 */
export async function resolveStorageUrl(
  url?: string | null,
  fallbackBucket?: string,
): Promise<string> {
  if (!url) return "";
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;

  let ref = parseStorageRef(url);
  if (!ref && fallbackBucket && !/^https?:\/\//i.test(url)) {
    ref = { bucket: fallbackBucket, path: url };
  }
  if (!ref || !PRIVATE_DOCUMENT_BUCKETS.has(ref.bucket)) return url;

  const key = `${ref.bucket}:${ref.path}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.url;

  const { data, error } = await supabase.storage
    .from(ref.bucket)
    .createSignedUrl(ref.path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return "";

  cache.set(key, { url: data.signedUrl, expires: Date.now() + (SIGNED_URL_TTL_SECONDS - 120) * 1000 });
  return data.signedUrl;
}

/** Open a stored document in a new tab, signing it first when needed. */
export async function openStorageFile(url?: string | null, fallbackBucket?: string) {
  if (!url) return;
  const resolved = await resolveStorageUrl(url, fallbackBucket);
  if (resolved) window.open(resolved, "_blank", "noopener");
}

/** Download a stored document, signing it first when needed. */
export async function downloadStorageFile(
  url?: string | null,
  fileName?: string,
  fallbackBucket?: string,
) {
  const resolved = await resolveStorageUrl(url, fallbackBucket);
  if (!resolved) return;
  const a = document.createElement("a");
  a.href = resolved;
  a.download = fileName || "download";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** React hook for `<img src>` / `<a href>` bindings. */
export function useStorageUrl(url?: string | null, fallbackBucket?: string): string {
  const [resolved, setResolved] = useState<string>(() => {
    if (!url) return "";
    const ref = parseStorageRef(url);
    return !ref || !PRIVATE_DOCUMENT_BUCKETS.has(ref.bucket) ? url : "";
  });

  useEffect(() => {
    let alive = true;
    if (!url) { setResolved(""); return; }
    resolveStorageUrl(url, fallbackBucket).then((u) => { if (alive) setResolved(u); });
    return () => { alive = false; };
  }, [url, fallbackBucket]);

  return resolved;
}
