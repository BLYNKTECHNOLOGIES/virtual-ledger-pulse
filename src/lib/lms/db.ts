import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { smartUpload } from "@/lib/resumable-upload";
import { LMS_BUCKET } from "./constants";

/**
 * LMS data access. The lms_* tables are reached through an untyped view of the
 * shared client so LMS code compiles whether or not the generated types file
 * already lists them; row shapes live in ./types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const lmsDb = supabase as any;

/** Reads every row of a query, past the 1000-row page limit. */
export function lmsFetchAll<T>(build: () => unknown): Promise<T[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return fetchAllPaginated<T>(build as () => any);
}

export async function lmsThrow<T>(promise: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}

/** Signed link for a private LMS file (1 hour). */
export async function lmsSignedUrl(path: string, seconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(LMS_BUCKET).createSignedUrl(path, seconds);
  if (error || !data?.signedUrl) throw new Error(error?.message || "Could not open the file");
  return data.signedUrl;
}

/**
 * Uploads through the app's shared uploader: small files in one request, larger
 * ones resumably, and files above the storage limit as chunks plus a manifest.
 * Returns the stored path (the manifest's path for a chunked file).
 */
export async function lmsUpload(path: string, file: File, onProgress?: (pct: number) => void): Promise<string> {
  return await smartUpload({ bucket: LMS_BUCKET, path, file, contentType: file.type || undefined, upsert: false, onProgress });
}

/** A file stored as chunks has a manifest path like "<module>/multipart_manifests/<name>.manifest.json". */
export function isChunkedPath(path: string | null | undefined): boolean {
  return !!path && /(^|\/)_*multipart_manifests_*\/[^?]*\.manifest\.json$/i.test(path);
}

const SAFE_BLOB_TYPE = /^(video\/[\w.+-]+|audio\/[\w.+-]+|image\/(png|jpe?g|gif|webp|avif)|application\/pdf)$/i;

interface ChunkManifest {
  kind: string;
  contentType?: string;
  chunks: { index: number; path: string; size: number }[];
}

async function readManifest(path: string): Promise<ChunkManifest> {
  const res = await fetch(await lmsSignedUrl(path, 600));
  if (!res.ok) throw new Error("Could not read the large file's manifest.");
  const m = (await res.json()) as ChunkManifest;
  if (!m || !Array.isArray(m.chunks) || m.chunks.length === 0) throw new Error("The large file's manifest is invalid.");
  return m;
}

/**
 * A link the browser can play or open. Chunked files are joined in the browser
 * into a temporary blob link (call revoke when done with it).
 */
export async function lmsFileUrl(path: string, onProgress?: (pct: number) => void): Promise<{ url: string; revoke?: () => void }> {
  if (!isChunkedPath(path)) return { url: await lmsSignedUrl(path, 4 * 3600) };
  const manifest = await readManifest(path);
  const chunks = [...manifest.chunks].sort((a, b) => a.index - b.index);
  const total = chunks.reduce((s, c) => s + (c.size || 0), 0) || 1;
  const parts: ArrayBuffer[] = [];
  let loaded = 0;
  for (const c of chunks) {
    const r = await fetch(await lmsSignedUrl(c.path, 600));
    if (!r.ok) throw new Error(`Could not load part ${c.index + 1} of the file.`);
    const buf = await r.arrayBuffer();
    parts.push(buf);
    loaded += buf.byteLength;
    onProgress?.(Math.min(99, Math.round((loaded / total) * 100)));
  }
  // Only media types the class screen plays are kept; anything else becomes a plain download.
  const type = SAFE_BLOB_TYPE.test(manifest.contentType ?? "") ? (manifest.contentType as string) : "application/octet-stream";
  const url = URL.createObjectURL(new Blob(parts, { type }));
  onProgress?.(100);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}

/** Removes a stored file; for a chunked file, its parts and manifest. */
export async function lmsRemoveFile(path: string): Promise<void> {
  const paths = [path];
  if (isChunkedPath(path)) {
    try {
      const m = await readManifest(path);
      paths.push(...m.chunks.map((c) => c.path));
    } catch {
      /* the manifest is gone or unreadable: remove what we can */
    }
  }
  const { error } = await supabase.storage.from(LMS_BUCKET).remove(paths);
  if (error) throw new Error(error.message);
}

/** Storage-safe file name: letters, digits, dot, dash and underscore only. */
export function safeFileName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.slice(-120) || "file";
}
