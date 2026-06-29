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
 * Results are cached by File reference, so calling `resolveKycUpload` at approval
 * time simply awaits the in-flight (or finished) background upload instead of
 * starting a fresh one. If a background upload failed, the cache entry is dropped
 * so the approval path transparently retries.
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

// Keyed by File reference. WeakMap lets the browser GC entries once the file is
// no longer referenced in component state.
const uploadCache = new WeakMap<File, Promise<KycUploadResult>>();

const randomToken = () => Math.random().toString(36).slice(2, 10);

const sanitizeName = (name: string) => name.replace(/[^\w.\-]+/g, '_').slice(-120);

/**
 * Start (or reuse) a background upload for a file. Safe to call repeatedly with
 * the same File — only one upload runs.
 */
export function prefetchKycUpload(file: File, opts: KycUploadOptions = {}): Promise<KycUploadResult> {
  const existing = uploadCache.get(file);
  if (existing) return existing;

  const promise = (async (): Promise<KycUploadResult> => {
    const toUpload: File = file;

    const path = `pending-kyc/${Date.now()}_${randomToken()}_${sanitizeName(toUpload.name)}`;
    const uploadedPath = await smartUpload({ bucket: 'kyc-documents', path, file: toUpload, contentType: toUpload.type || undefined });

    const { data } = supabase.storage.from('kyc-documents').getPublicUrl(uploadedPath);
    return {
      url: data?.publicUrl || '',
      fileName: toUpload.name,
      fileSize: toUpload.size,
      mimeType: toUpload.type || null,
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
 * prior failure).
 */
export function resolveKycUpload(file: File, opts: KycUploadOptions = {}): Promise<KycUploadResult> {
  return prefetchKycUpload(file, opts);
}
