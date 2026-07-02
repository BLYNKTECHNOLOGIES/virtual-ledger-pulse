import { supabase } from '@/integrations/supabase/client';
import { smartUpload } from '@/lib/resumable-upload';

/**
 * Background ("pre-fetch") uploads for client KYC / onboarding documents.
 *
 * The approval click used to upload every document sequentially — including a
 * real-time vKYC video re-encode — which took 4–6 minutes. Instead we start
 * uploading each file the moment the reviewer attaches it. By the time they
 * press "Approve", the bytes are already in storage and the approval only has
 * to persist DB rows (near-instant).
 *
 * PERMANENCE (root-cause fix for 404s):
 * Uploads previously landed in a temporary `pending-kyc/` folder that a daily
 * cleanup cron pruned (unreferenced files older than 24h). If a review sat in
 * the queue for more than 24h, the temp file was deleted before approval, yet
 * the cached upload promise still resolved to that dead URL — so opening the
 * document later returned "Object not found" (404). Large vKYC videos are also
 * stored as a multipart manifest + separate chunk objects, which the temp
 * cleanup could orphan.
 *
 * We now upload directly to a PERMANENT `kyc/` path that no cleanup job prunes,
 * so every persisted document URL always points at a durable object. The small
 * cost is that files from reviews that are never completed are not auto-removed —
 * an acceptable trade-off, since losing an approved client's KYC document is far
 * worse than retaining a few orphaned uploads.
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
const PERMANENT_PREFIX = 'kyc';

// Keyed by File reference. WeakMap lets the browser GC entries once the file is
// no longer referenced in component state.
const uploadCache = new WeakMap<File, Promise<KycUploadResult>>();

const randomToken = () => Math.random().toString(36).slice(2, 10);

const sanitizeName = (name: string) => name.replace(/[^\w.\-]+/g, '_').slice(-120);

/**
 * Start (or reuse) a background upload for a file. Safe to call repeatedly with
 * the same File — only one upload runs. Uploads directly to a permanent path.
 */
export function prefetchKycUpload(file: File, _opts: KycUploadOptions = {}): Promise<KycUploadResult> {
  const existing = uploadCache.get(file);
  if (existing) return existing;

  const promise = (async (): Promise<KycUploadResult> => {
    const path = `${PERMANENT_PREFIX}/${Date.now()}_${randomToken()}_${sanitizeName(file.name)}`;
    const uploadedPath = await smartUpload({ bucket: BUCKET, path, file, contentType: file.type || undefined });

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(uploadedPath);
    return {
      url: data?.publicUrl || '',
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || null,
    };
  })();

  // Drop failed uploads from the cache so the approval flow can retry inline.
  promise.catch(() => uploadCache.delete(file));

  uploadCache.set(file, promise);
  return promise;
}

/**
 * Resolve a file to an uploaded result at approval time. Awaits the background
 * upload if it's still running, or starts one if none exists (e.g. retry after a
 * prior failure). The returned URL always points at a permanent object.
 */
export function resolveKycUpload(file: File, opts: KycUploadOptions = {}): Promise<KycUploadResult> {
  return prefetchKycUpload(file, opts);
}
