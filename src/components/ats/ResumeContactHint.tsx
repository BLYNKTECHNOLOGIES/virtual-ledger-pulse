import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { atsErrorMessage } from "@/lib/ats/errors";
import { ATS_BUCKET } from "@/lib/ats/files";
import { candKeys, type AtsCandidate, type AtsFile } from "@/lib/ats/candidates";
import { guessFromResume } from "@/lib/ats/importParse";
import { readResumeText } from "@/lib/ats/resumeImport";

const READABLE = /\.(pdf|docx?|rtf)$/i;

/** The resume to read for missing contact details: the main resume, else the newest one that has text (not a photo). */
export function readableResume(files: AtsFile[]): AtsFile | null {
  const resumes = files.filter((f) => f.kind === "resume" && READABLE.test(f.file_name ?? ""));
  return resumes.find((f) => f.is_primary) ?? resumes[0] ?? null;
}

interface Dup { candidate_id: string; ref_no: string; full_name: string; matched_on: string }

/**
 * When a candidate has no email (or no phone) on the profile, reads their resume and offers what it finds:
 * one click adds it. An address that already belongs to another candidate is shown as a possible duplicate instead.
 */
export function ResumeContactHint({ candidate: c, files, className }: { candidate: AtsCandidate; files: AtsFile[]; className?: string }) {
  const qc = useQueryClient();
  const needEmail = !c.email?.trim();
  const needPhone = !c.phone?.trim();
  const file = needEmail || needPhone ? readableResume(files) : null;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const read = useQuery({
    queryKey: ["resume-contact", file?.id ?? "none"],
    enabled: !!file,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(ATS_BUCKET).download(file!.storage_path);
      if (error || !data) throw error ?? new Error("The resume couldn't be downloaded");
      const text = await readResumeText(new File([data], file!.file_name, { type: data.type || file!.mime_type || "" }));
      const g = guessFromResume(text, file!.file_name);
      return { email: g.email, phone: g.phone, readable: !!text.trim() };
    },
  });
  const email = needEmail ? read.data?.email ?? null : null;
  const phone = needPhone ? read.data?.phone ?? null : null;
  const dups = useQuery({
    queryKey: ["resume-contact-dups", c.id, email, phone],
    enabled: !!(email || phone),
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ats_find_duplicates", { p_email: email, p_phone: phone, p_exclude: c.id } as any);
      if (error) throw error;
      return (data ?? []) as Dup[];
    },
  });

  if (!file || dismissed === file.id) return null;
  // Every state renders the same live region first, so it stays mounted and screen readers hear the result.
  const view = (say: string, visible: React.ReactNode = null) => (
    <><p className="sr-only" role="status" aria-live="polite">{say}</p>{visible}</>
  );
  if (!read.data || ((email || phone) && dups.isLoading)) return view("");

  if (!email && !phone) {
    if (!needEmail) return view("");
    const none = `No email address${read.data.readable ? " — the resume has none either." : " — the resume is a scanned image, so its email can't be read."}`;
    return view(none, <p className={cn("text-xs text-muted-foreground", className)}>{none}</p>);
  }

  const rows = dups.data ?? [];
  const emailOwner = email ? rows.find((d) => d.matched_on === "email" || d.matched_on === "email_and_phone") : undefined;
  const phoneOwner = phone ? rows.find((d) => d.matched_on === "phone" || d.matched_on === "email_and_phone") : undefined;
  const addEmail = !!email && !emailOwner;
  const addPhone = !!phone && !phoneOwner;
  const ownerLink = (d: Dup) => (
    <a href={`/hrms/ats/candidates/${d.candidate_id}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
      {d.ref_no} · {d.full_name}
    </a>
  );

  const add = async () => {
    if (busy || !(addEmail || addPhone)) return;
    const patch: Record<string, string> = {};
    let q: any = supabase.from("ats_candidates");
    if (addEmail) patch.email = email!;
    if (addPhone) patch.phone = phone!;
    q = q.update(patch).eq("id", c.id);
    // Only fill what is still empty (someone may have added it meanwhile).
    for (const k of Object.keys(patch)) q = q.is(k, null);
    setBusy(true);
    const { data, error } = await q.select("id");
    setBusy(false);
    qc.invalidateQueries({ queryKey: candKeys.all });
    if (error) { toast.error(atsErrorMessage(error)); return; }
    if (!data?.length) { toast.info("The profile was changed meanwhile, so nothing was added."); return; }
    toast.success(addEmail && addPhone ? "Email and phone added to the profile" : addEmail ? "Email added to the profile" : "Phone added to the profile");
  };

  const what = [email, phone].filter(Boolean).join(" · ");
  return view(`Found in the resume: ${what}`, (
    <div className={cn("grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2.5 gap-y-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center", className)}>
      <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary sm:mt-0" aria-hidden />
      <div className="min-w-0">
        <p className="break-words text-foreground">
          <span className="text-muted-foreground">Found in the resume: </span><span className="font-medium">{what}</span>
        </p>
        {(emailOwner || phoneOwner) && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {emailOwner && phoneOwner && emailOwner.candidate_id === phoneOwner.candidate_id
              ? <>{email && phone ? "Both are" : email ? "The email is" : "The phone is"} already on {ownerLink(emailOwner)}</>
              : <>
                  {emailOwner && <>The email is already on {ownerLink(emailOwner)}</>}
                  {emailOwner && phoneOwner && "; "}
                  {phoneOwner && <>{emailOwner ? "the" : "The"} phone is already on {ownerLink(phoneOwner)}</>}
                </>}
            {" "}— possibly the same person.
          </p>
        )}
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-1.5 sm:col-start-auto">
        {(addEmail || addPhone) && (
          <Button size="sm" className="h-7" disabled={busy} onClick={add}>
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {addEmail && addPhone ? "Add both to profile" : addEmail ? "Add email to profile" : "Add phone to profile"}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7" disabled={busy} onClick={() => setDismissed(file.id)}>Not now</Button>
      </div>
    </div>
  ));
}
