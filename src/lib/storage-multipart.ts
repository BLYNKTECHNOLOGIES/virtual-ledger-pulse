import { supabase } from "@/integrations/supabase/client";
import type { MultipartUploadManifest } from "@/lib/resumable-upload";

const MANIFEST_KIND = "supabase-multipart-file";

export const isMultipartManifestUrl = (url?: string | null) =>
  !!url && /\/__multipart_manifests__\/.*\.manifest\.json(?:\?|$)/i.test(url);

const getPublicStoragePath = (url: string, bucket: string) => {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) return null;
  return decodeURIComponent(url.slice(markerIndex + marker.length).split("?")[0]);
};

export async function resolveMultipartManifestUrl(url: string, fallbackBucket = "kyc-documents") {
  if (!isMultipartManifestUrl(url)) return url;

  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not read the large video manifest.");

  const manifest = (await response.json()) as MultipartUploadManifest;
  if (manifest.kind !== MANIFEST_KIND || !Array.isArray(manifest.chunks) || manifest.chunks.length === 0) {
    throw new Error("The large video manifest is invalid.");
  }

  const bucket = manifest.bucket || fallbackBucket;
  const buffers: ArrayBuffer[] = [];
  for (const chunk of [...manifest.chunks].sort((a, b) => a.index - b.index)) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(chunk.path);
    const chunkResponse = await fetch(data.publicUrl);
    if (!chunkResponse.ok) throw new Error(`Could not load video chunk ${chunk.index + 1}.`);
    buffers.push(await chunkResponse.arrayBuffer());
  }

  return URL.createObjectURL(new Blob(buffers, { type: manifest.contentType || "application/octet-stream" }));
}

export async function openStorageDocumentUrl(url: string, bucket = "kyc-documents") {
  if (!isMultipartManifestUrl(url)) {
    window.open(url, "_blank");
    return;
  }

  const popup = window.open("", "_blank");
  if (popup) {
    popup.document.write("<p style='font-family: sans-serif; padding: 16px;'>Preparing large video...</p>");
  }

  try {
    const resolvedUrl = await resolveMultipartManifestUrl(url, bucket);
    if (popup) popup.location.href = resolvedUrl;
    else window.open(resolvedUrl, "_blank");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not open this large video.";
    if (popup) popup.document.body.innerHTML = `<p style="font-family: sans-serif; padding: 16px; color: #b91c1c;">${message}</p>`;
    throw error;
  }
}

export async function downloadStorageDocumentUrl(url: string, fileName?: string, bucket = "kyc-documents") {
  const resolvedUrl = await resolveMultipartManifestUrl(url, bucket);
  const anchor = document.createElement("a");
  anchor.href = resolvedUrl;
  anchor.download = fileName || "download";
  anchor.target = "_blank";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export const getMultipartOriginalStoragePath = (url: string, bucket = "kyc-documents") =>
  getPublicStoragePath(url, bucket);