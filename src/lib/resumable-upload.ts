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

/**
 * Supabase Free projects cannot store a single object larger than 50MB. The
 * project/bucket limit is not visible to the browser until the upload starts,
 * so lengthy vKYC videos can fail before any useful app-side error appears.
 * Store very large files as safe-size chunks plus a tiny manifest. The viewer
 * reconstructs the original file when staff opens/downloads it.
 */
export const MULTIPART_THRESHOLD_BYTES = 45 * 1024 * 1024; // safely below 50MB

const MULTIPART_MANIFEST_KIND = "supabase-multipart-file";

export interface ResumableUploadOptions {
  bucket: string;
  path: string;
  file: File | Blob;
  contentType?: string;
  upsert?: boolean;
  onProgress?: (percent: number) => void;
}

export interface MultipartUploadManifest {
  kind: "supabase-multipart-file";
  version: 1;
  bucket: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  originalPath: string;
  createdAt: string;
  chunks: Array<{ index: number; path: string; size: number }>;
}

const isNetworkOrTusError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "");
  return /network|fetch|timeout|abort|tus|resumable|large file|failed to fetch|load failed|request timed out/i.test(message);
};

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
  if (!tus.isSupported) {
    throw new Error("Large file upload is not supported in this browser. Please use latest Chrome/Edge and try again.");
  }

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

  const runTusUpload = (endpoint: string) => new Promise<string>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${bearerToken}`,
        "x-upsert": upsert ? "true" : "false",
      },
      parallelUploads: 1,
      addRequestId: true,
      uploadDataDuringCreation: true,
      storeFingerprintForResuming: false,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName: objectPath,
        contentType: contentType || (file as File).type || "application/octet-stream",
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024, // required by Supabase storage TUS
      onBeforeRequest: (req) => {
        // Supabase Storage validates the API key on some deployments/proxies.
        // tus-js-client preserves these headers for POST/PATCH/HEAD requests.
        req.setHeader("apikey", SUPABASE_PUBLISHABLE_KEY);
      },
      onError: (error) => reject(new Error(getTusErrorMessage(error))),
      onProgress: (sent, total) => {
        if (onProgress && total > 0) onProgress(Math.round((sent / total) * 100));
      },
      onSuccess: () => resolve(objectPath),
    });

    // Do not resume old browser-stored TUS URLs here. The vKYC path contains a
    // fresh timestamp, and earlier failed attempts may have stored stale upload
    // URLs from the old endpoint. Resuming those makes the same file fail again.
    upload.start();
  });

  try {
    return await runTusUpload(`${SUPABASE_STORAGE_URL}/storage/v1/upload/resumable`);
  } catch (error) {
    // If the user's network blocks the direct storage hostname, retry once via
    // the standard Supabase API hostname. This keeps long vKYC upload reliable
    // across office networks while still preferring the faster official host.
    if (isNetworkOrTusError(error)) {
      return runTusUpload(`${SUPABASE_URL}/storage/v1/upload/resumable`);
    }
    throw error;
  }
}

const uploadSmallOrResumable = async (opts: ResumableUploadOptions): Promise<string> => {
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
};

async function multipartUpload(opts: ResumableUploadOptions): Promise<string> {
  const originalPath = cleanStoragePath(opts.path);
  const fileName = (opts.file as File).name || originalPath.split("/").pop() || "large-file";
  const contentType = opts.contentType || (opts.file as File).type || "application/octet-stream";
  const pathParts = originalPath.split("/");
  const originalFilePart = pathParts.pop() || fileName;
  const folder = pathParts.join("/");
  const safeBase = originalFilePart.replace(/\.[^.]+$/, "");
  const uploadId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const chunkFolder = cleanStoragePath(`${folder}/__multipart__/${safeBase}_${uploadId}`);
  const manifestPath = cleanStoragePath(`${folder}/__multipart_manifests__/${safeBase}_${uploadId}.manifest.json`);
  const chunks: MultipartUploadManifest["chunks"] = [];
  const uploadedPaths: string[] = [];
  let uploadedBytes = 0;

  try {
    for (let start = 0, index = 0; start < opts.file.size; start += MULTIPART_THRESHOLD_BYTES, index++) {
      const end = Math.min(start + MULTIPART_THRESHOLD_BYTES, opts.file.size);
      const chunk = opts.file.slice(start, end, "application/octet-stream");
      const chunkPath = `${chunkFolder}/part-${String(index).padStart(5, "0")}.bin`;

      const uploadedChunkPath = await uploadSmallOrResumable({
        bucket: opts.bucket,
        path: chunkPath,
        file: chunk,
        contentType: "application/octet-stream",
        upsert: opts.upsert,
        onProgress: (chunkPercent) => {
          const currentChunkUploaded = chunk.size * (chunkPercent / 100);
          const overallPercent = Math.min(99, Math.round(((uploadedBytes + currentChunkUploaded) / opts.file.size) * 100));
          opts.onProgress?.(overallPercent);
        },
      });

      chunks.push({ index, path: uploadedChunkPath, size: chunk.size });
      uploadedPaths.push(uploadedChunkPath);
      uploadedBytes += chunk.size;
      opts.onProgress?.(Math.min(99, Math.round((uploadedBytes / opts.file.size) * 100)));
    }

    const manifest: MultipartUploadManifest = {
      kind: MULTIPART_MANIFEST_KIND,
      version: 1,
      bucket: opts.bucket,
      fileName,
      fileSize: opts.file.size,
      contentType,
      originalPath,
      createdAt: new Date().toISOString(),
      chunks,
    };

    const manifestBlob = new Blob([JSON.stringify(manifest)], { type: "application/json" });
    const uploadedManifestPath = await uploadSmallOrResumable({
      bucket: opts.bucket,
      path: manifestPath,
      file: manifestBlob,
      contentType: "application/json",
      upsert: opts.upsert,
    });
    opts.onProgress?.(100);
    return uploadedManifestPath;
  } catch (error) {
    // Best-effort cleanup. If cleanup itself fails, keep the original upload
    // error because that is the useful message for the operator.
    if (uploadedPaths.length > 0) {
      await supabase.storage.from(opts.bucket).remove(uploadedPaths).catch(() => undefined);
    }
    throw error;
  }
}

/**
 * Upload a file to storage, automatically choosing resumable (TUS) for large
 * files and the standard upload for small ones.
 */
export async function smartUpload(opts: ResumableUploadOptions): Promise<string> {
  const path = cleanStoragePath(opts.path);
  if (opts.file.size > MULTIPART_THRESHOLD_BYTES) {
    return multipartUpload({ ...opts, path });
  }

  if (opts.file.size > RESUMABLE_THRESHOLD_BYTES) {
    return resumableUpload({ ...opts, path });
  }
  try {
    return uploadSmallOrResumable({ ...opts, path });
  } catch (error) {
    // Some videos are under the size threshold but still exceed the browser/app
    // fetch timeout because of slow upload speed. Retry those through TUS.
    if (isNetworkOrTusError(error)) {
      return resumableUpload({ ...opts, path });
    }
    throw error;
  }
}
