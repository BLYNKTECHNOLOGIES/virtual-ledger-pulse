import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = "https://vagiqbespusdxsbqpvbo.supabase.co";
const SUPABASE_PROJECT_ID = new URL(SUPABASE_URL).hostname.split(".")[0];
const SUPABASE_STORAGE_URL = `https://${SUPABASE_PROJECT_ID}.storage.supabase.co`;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhZ2lxYmVzcHVzZHhzYnFwdmJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMzM2OTcsImV4cCI6MjA2NTYwOTY5N30.LTH1iLnl11H4KZ_qWekz-x7PGhD7UAgpw8EEifGKnrM";

const cleanStoragePath = (path: string) =>
  path
    .split("/")
    .map((part) => part.trim().replace(/[^a-zA-Z0-9._=-]+/g, "_").replace(/^_+|_+$/g, ""))
    .filter(Boolean)
    .join("/");

const getTusErrorMessage = (error: unknown) => {
  const err = error as { message?: string; originalResponse?: { getStatus?: () => number; getBody?: () => string } };
  const status = err?.originalResponse?.getStatus?.();
  const body = err?.originalResponse?.getBody?.();
  if (status || body) return `Large file upload failed${status ? ` (${status})` : ""}${body ? `: ${body}` : ""}`;
  return err?.message || "Large file upload failed";
};

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
}: ResumableUploadOptions): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  // Small uploads sent through supabase-js automatically carry the publishable
  // key, so they work even for legacy ERP sessions where Supabase Auth has not
  // been restored yet. TUS uploads are raw XHR requests, so they must receive a
  // bearer token explicitly. Falling back to the publishable key keeps large
  // uploads on the same auth path as standard Storage uploads while Storage RLS
  // still enforces bucket permissions server-side.
  const bearerToken = sessionData.session?.access_token || SUPABASE_PUBLISHABLE_KEY;
  const objectPath = cleanStoragePath(path);
  if (!bearerToken) throw new Error("Large file upload could not start because storage authentication was unavailable.");

  return new Promise<string>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${SUPABASE_STORAGE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${bearerToken}`,
        "x-upsert": upsert ? "true" : "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName: objectPath,
        contentType: contentType || (file as File).type || "application/octet-stream",
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024, // required by Supabase storage TUS
      onError: (error) => reject(new Error(getTusErrorMessage(error))),
      onProgress: (sent, total) => {
        if (onProgress && total > 0) onProgress(Math.round((sent / total) * 100));
      },
      onSuccess: () => resolve(objectPath),
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
export async function smartUpload(opts: ResumableUploadOptions): Promise<string> {
  const path = cleanStoragePath(opts.path);
  if (opts.file.size > RESUMABLE_THRESHOLD_BYTES) {
    return resumableUpload({ ...opts, path });
  }
  const { error } = await supabase.storage
    .from(opts.bucket)
    .upload(path, opts.file, {
      contentType: opts.contentType || (opts.file as File).type || undefined,
      upsert: opts.upsert,
    });
  if (error) throw error;
  return path;
}
