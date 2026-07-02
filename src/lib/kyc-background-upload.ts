import { supabase } from '@/integrations/supabase/client';
import { smartUpload } from '@/lib/resumable-upload';

/**
 * Background ("pre-fetch") uploads for client KYC / onboarding documents.
 *
 * The approval click used to upload every document sequentially — including a
 * real-time vKYC video re-encode — which took 4–6 minutes. Instead we now start
 * uploading each file to a temporary storage location the moment the reviewer
 * attaches it. By the time they press "Approve", the bytes are already in
 * storage and the approval only has to persist DB rows (near-instant).
 *
 * IMPORTANT — permanence:
 * Prefetch uploads land in the temporary `pending-kyc/` folder, which a daily
 * cleanup cron prunes (files older than 24h that aren't referenced yet). If a
 * review sat in the queue for more than 24h, the temp file was deleted before
 * approval, yet the cached upload promise still resolved to that (now dead) URL —
 * producing 404s when the document was later opened.
 *
 * To guarantee permanence, `resolveKycUpload` (called at approval time) now
 * FINALIZES each file: it moves the object out of `pending-kyc/` into a
 * permanent `kyc/` path that the cleanup cron never touches. If the temp object
 * is already gone (cleaned up), it re-uploads from the in-memory File. The
 * returned URL therefore always points at a persisted permanent object.
 */

export interface KycUploadResult {
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
}

export interface KycUploadOptions {
  /** Deprecated: large vKYC videos are uploaded as-is through resumable storage. */
  compress?: boolean;
}

const BUCKET = 'kyc-documents';
const PENDING_PREFIX = 'pending-kyc';
const PERMANENT_PREFIX = 'kyc';

interface PrefetchResult {
  /** Storage path inside the bucket, e.g. "pending-kyc/123_abc_file.jpg". */
  path: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
}

// Keyed by File reference. WeakMap lets the browser GC entries once the file is
// no longer referenced in component state.
const uploadCache = new WeakMap<File, Promise<PrefetchResult>>();
const finalizeCache = new WeakMap<File, Promise<KycUploadResult>>();

const randomToken = () => Math.random().toString(36).slice(2, 10);

const sanitizeName = (name: string) => name.replace(/[^\w.\-]+/g, '_').slice(-120);

const publicUrl = (path: string) => supabase.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl || '';

/**
 * Start (or reuse) a background upload for a file. Safe to call repeatedly with
 * the same File — only one upload runs. Uploads to the temporary pending folder.
 */
export function prefetchKycUpload(file: File, _opts: KycUploadOptions = {}): Promise<PrefetchResult> {
  const existing = uploadCache.get(file);
  if (existing) return existing;

  const promise = (async (): Promise<PrefetchResult> => {
    const path = `${PENDING_PREFIX}/${Date.now()}_${randomToken()}_${sanitizeName(file.name)}`;
    const uploadedPath = await smartUpload({ bucket: BUCKET, path, file, contentType: file.type || undefined });
    return {
      path: uploadedPath,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || null,
    };
  })();

  // Drop failed uploads from the cache so a later call can retry inline.
  promise.catch(() => uploadCache.delete(file));

  uploadCache.set(file, promise);
  return promise;
}

/**
 * Resolve a file to a PERMANENT uploaded result at approval time.
 *
 * Awaits the background upload if still running, moves the object to a permanent
 * path so the cleanup cron never deletes it, and re-uploads from the in-memory
 * File if the temp object was already cleaned up. Cached per File so repeated
 * calls are cheap and idempotent.
 */
export function resolveKycUpload(file: File, opts: KycUploadOptions = {}): Promise<KycUploadResult> {
  const existing = finalizeCache.get(file);
  if (existing) return existing;

  const promise = (async (): Promise<KycUploadResult> => {
    const permanentPath = `${PERMANENT_PREFIX}/${Date.now()}_${randomToken()}_${sanitizeName(file.name)}`;

    // Try to reuse the background upload and move it to the permanent location.
    try {
      const pre = await prefetchKycUpload(file, opts);
      if (pre.path.startsWith(`${PENDING_PREFIX}/`)) {
        const { error: moveErr } = await supabase.storage.from(BUCKET).move(pre.path, permanentPath);
        if (!moveErr) {
          return { url: publicUrl(permanentPath), fileName: pre.fileName, fileSize: pre.fileSize, mimeType: pre.mimeType };
        }
        // Move failed (temp object cleaned up / missing) → fall through to re-upload.
      } else {
        // Already permanent for some reason.
        return { url: publicUrl(pre.path), fileName: pre.fileName, fileSize: pre.fileSize, mimeType: pre.mimeType };
      }
    } catch {
      // Prefetch failed → re-upload directly to the permanent path below.
    }

    // Fallback: upload the in-memory File straight to the permanent path.
    const uploadedPath = await smartUpload({ bucket: BUCKET, path: permanentPath, file, contentType: file.type || undefined });
    return { url: publicUrl(uploadedPath), fileName: file.name, fileSize: file.size, mimeType: file.type || null };
  })();

  // Drop failures so the approval flow can retry inline on a later attempt.
  promise.catch(() => finalizeCache.delete(file));

  finalizeCache.set(file, promise);
  return promise;
}
