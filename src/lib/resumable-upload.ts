import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = "https://vagiqbespusdxsbqpvbo.supabase.co";

/**
 * Threshold above which we switch to resumable (TUS) uploads.
 * The standard single-request storage upload is capped (~50MB) and is also
 * subject to the global 30s fetch timeout in the Supabase client, so large
 * vKYC videos fail. Resumable uploads chunk the file (6MB chunks), retry on
 * failure, and have no single-request size/time limit.
 */
export const RESUMABLE_THRESHOLD_BYTES = 6 * 1024 * 1024; // 6MB

export interface ResumableUploadOptions {
  bucket: string;
  path: string;
  file: File | Blob;
  contentType?: string;
  upsert?: boolean;
  onProgress?: (percent: number) => void;
}

/**
 * Upload a (potentially large) file to Supabase Storage using the TUS
 * resumable protocol. Returns once the upload is fully committed.
 */
export async function resumableUpload({
  bucket,
  path,
  file,
  contentType,
  upsert = false,
  onProgress,
}: ResumableUploadOptions): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Not authenticated");

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-upsert": upsert ? "true" : "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: contentType || (file as File).type || "application/octet-stream",
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024, // required by Supabase storage TUS
      onError: (error) => reject(error),
      onProgress: (sent, total) => {
        if (onProgress && total > 0) onProgress(Math.round((sent / total) * 100));
      },
      onSuccess: () => resolve(),
    });

    // Resume an interrupted upload if a matching one exists.
    upload.findPreviousUploads().then((previous) => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    });
  });
}

/**
 * Upload a file to storage, automatically choosing resumable (TUS) for large
 * files and the standard upload for small ones.
 */
export async function smartUpload(opts: ResumableUploadOptions): Promise<void> {
  if (opts.file.size > RESUMABLE_THRESHOLD_BYTES) {
    await resumableUpload(opts);
    return;
  }
  const { error } = await supabase.storage
    .from(opts.bucket)
    .upload(opts.path, opts.file, {
      contentType: opts.contentType || (opts.file as File).type || undefined,
      upsert: opts.upsert,
    });
  if (error) throw error;
}
