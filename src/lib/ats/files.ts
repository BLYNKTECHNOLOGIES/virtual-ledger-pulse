import { supabase } from "@/integrations/supabase/client";

export const ATS_BUCKET = "ats-files";
export const ATS_ALLOWED_EXT = ["pdf", "doc", "docx", "jpg", "jpeg", "png", "webp"] as const;
export const ATS_MAX_BYTES = 10 * 1024 * 1024;
export const ATS_FILE_KINDS = [
  { value: "resume", label: "Resume" },
  { value: "cover_letter", label: "Cover letter" },
  { value: "photo", label: "Photo" },
  { value: "certificate", label: "Certificate" },
  { value: "id_proof", label: "ID proof" },
  { value: "other", label: "Other" },
] as const;
export type AtsFileKind = (typeof ATS_FILE_KINDS)[number]["value"];
export const fileKindLabel = (k?: string | null) => ATS_FILE_KINDS.find((x) => x.value === k)?.label ?? "File";

/** Thrown with a user-facing message; callers can show `.message` directly. */
export class AtsFileError extends Error {
  constructor(message: string, readonly reason: "type" | "size" | "duplicate" | "upload" | "record") {
    super(message);
  }
}

export const fileExt = (name: string) => (name.split(".").pop() ?? "").toLowerCase();

export function validateAtsFile(file: File): string | null {
  const ext = fileExt(file.name);
  if (!(ATS_ALLOWED_EXT as readonly string[]).includes(ext)) return "Only PDF, Word (.doc, .docx) and image (JPG, PNG, WebP) files can be uploaded.";
  if (file.size > ATS_MAX_BYTES) return "Files must be 10 MB or smaller.";
  if (file.size === 0) return "This file is empty.";
  return null;
}

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const pad = (n: number) => String(n).padStart(2, "0");
function stamp(d = new Date()): string {
  // IST wall-clock timestamp, yyyyMMdd-HHmmss
  const ist = new Date(d.getTime() + 330 * 60_000);
  return `${ist.getUTCFullYear()}${pad(ist.getUTCMonth() + 1)}${pad(ist.getUTCDate())}-${pad(ist.getUTCHours())}${pad(ist.getUTCMinutes())}${pad(ist.getUTCSeconds())}`;
}

export function sanitiseBaseName(name: string): string {
  const base = name.replace(/\.[^.]*$/, "").toLowerCase();
  const s = base.replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return s || "file";
}

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
};

export interface UploadAtsFileArgs {
  file: File;
  candidateId: string;
  applicationId?: string | null;
  kind: AtsFileKind;
  /** "import" for resumes added by an import; "manual" (the default) otherwise. */
  source?: "manual" | "import";
}

/**
 * Validates, de-duplicates (SHA-256 per candidate), uploads to the private
 * ats-files bucket and records the ats_files row. The database makes the first
 * resume primary. If the row insert fails the uploaded object is removed.
 */
export async function uploadAtsFile({ file, candidateId, applicationId, kind, source }: UploadAtsFileArgs) {
  const invalid = validateAtsFile(file);
  if (invalid) throw new AtsFileError(invalid, invalid.includes("10 MB") ? "size" : "type");

  const sha256 = await sha256Hex(file);
  const { data: dup, error: dupErr } = await supabase
    .from("ats_files").select("id").eq("candidate_id", candidateId).eq("sha256", sha256).limit(1);
  if (dupErr) throw dupErr;
  if (dup && dup.length) throw new AtsFileError("This file is already attached.", "duplicate");

  const ext = fileExt(file.name);
  const path = `candidates/${candidateId}/${stamp()}-${sanitiseBaseName(file.name)}.${ext}`.toLowerCase();
  const mime = file.type || MIME[ext] || "application/octet-stream";

  const up = await supabase.storage.from(ATS_BUCKET).upload(path, file, { contentType: mime, upsert: false });
  if (up.error) throw new AtsFileError("The file couldn't be uploaded. Please try again.", "upload");

  const { data, error } = await supabase
    .from("ats_files")
    .insert({
      candidate_id: candidateId,
      application_id: applicationId ?? null,
      kind,
      file_name: file.name.slice(0, 255),
      storage_path: path,
      mime_type: mime,
      size_bytes: file.size,
      sha256,
      source: source ?? "manual",
    })
    .select("*")
    .single();
  if (error) {
    await supabase.storage.from(ATS_BUCKET).remove([path]).catch(() => undefined);
    throw error;
  }
  return data;
}

export async function signAtsFile(path: string, ttl = 600): Promise<string> {
  const { data, error } = await supabase.storage.from(ATS_BUCKET).createSignedUrl(path, ttl);
  if (error || !data?.signedUrl) throw error ?? new Error("sign failed");
  return data.signedUrl;
}

export function fmtBytes(n?: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
