import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { renderTemplate, usesInterviewFields, useWhatsAppTemplates, type AtsEmailTemplate } from "@/lib/ats/mail";
import { ivState, useAppInterviews } from "@/lib/ats/interviews";
import { candKeys, type AtsAppRow, type AtsCandidate } from "@/lib/ats/candidates";
import { convKeys, logContact } from "@/lib/ats/conversations";
import { atsErrorMessage } from "@/lib/ats/errors";

const LEFTOVER_RE = /\{\{[^}]*\}\}/;

/** Fills a WhatsApp template body for an interview (server renderer). */
export async function fillWhatsAppForInterview(interviewId: string, body: string) {
  const { data, error } = await (supabase.rpc as any)("ats_render_interview_text", { p_interview_id: interviewId, p_subject: "", p_body: body });
  if (error) throw error;
  return String((data as { body?: string } | null)?.body ?? "");
}

/** The reminder template for interviews: 'wa-interview-reminder', else the first active WhatsApp template with purpose 'interview'. */
export function pickWhatsAppReminder(templates: AtsEmailTemplate[] | undefined) {
  const list = templates ?? [];
  return list.find((t) => t.code === "wa-interview-reminder") ?? list.find((t) => t.purpose === "interview") ?? null;
}

export function WhatsAppDialog({ open, onOpenChange, candidateId, applicationId, firstName, waPhone, initialText, templateCode }: {
  open: boolean; onOpenChange: (o: boolean) => void; candidateId: string; applicationId: string | null;
  firstName: string; waPhone: string; initialText: string; templateCode: string | null;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState(initialText);
  const [lastInit, setLastInit] = useState(initialText);
  if (initialText !== lastInit) { setLastInit(initialText); setText(initialText); }
  const leftover = LEFTOVER_RE.test(text);
  const empty = !text.trim();

  const copy = () => navigator.clipboard.writeText(text).then(() => toast.success("Copied"), () => toast.error("Couldn't copy"));
  const openWa = async () => {
    window.open(`https://wa.me/91${waPhone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    try {
      await logContact({ candidateId, applicationId, channel: "whatsapp", outcome: "opened", templateCode, note: text.slice(0, 200) });
      toast.success("WhatsApp opened · logged on the timeline");
    } catch (e) {
      toast.error(atsErrorMessage(e));
    }
    qc.invalidateQueries({ queryKey: candKeys.events(candidateId) });
    qc.invalidateQueries({ queryKey: convKeys.all });
    onOpenChange(false);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={`WhatsApp message to ${firstName}`}>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">+91 {waPhone}</p>
        <div className="space-y-1">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={Math.min(12, Math.max(6, text.split("\n").length + 1))} className="text-foreground" />
          <p className="text-right text-xs text-muted-foreground">{text.length}/2000</p>
        </div>
        {leftover && <p className="text-sm text-warning">Replace the {"{{placeholders}}"} first</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={leftover || empty} onClick={copy}>Copy text</Button>
          <Button disabled={leftover || empty} onClick={openWa}><MessageCircle className="mr-1.5 h-4 w-4" /> Open WhatsApp</Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

export function WhatsAppMenu({ candidate, app, waPhone }: { candidate: AtsCandidate; app: AtsAppRow | null; waPhone: string | null }) {
  const templates = useWhatsAppTemplates();
  const ivs = useAppInterviews(app?.application_id ?? null);
  const upcoming = useMemo(() => (ivs.data ?? []).filter((iv) => ivState(iv) === "upcoming")
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))[0] ?? null, [ivs.data]);
  const [dlg, setDlg] = useState<{ text: string; code: string } | null>(null);
  if (!waPhone) return null;
  const list = (templates.data ?? []).filter((t) => !usesInterviewFields(t) || !!upcoming);
  const firstName = (candidate.full_name ?? "").trim().split(/\s+/)[0] || "the candidate";

  const choose = async (t: AtsEmailTemplate) => {
    try {
      const text = usesInterviewFields(t)
        ? await fillWhatsAppForInterview(upcoming!.id, t.body ?? "")
        : (await renderTemplate(t.id, app?.application_id ?? null, candidate.id)).body;
      setDlg({ text, code: t.code });
    } catch (e) { toast.error(atsErrorMessage(e)); }
  };

  return (
    <>
      <div className="inline-flex">
        <Button asChild size="sm" variant="outline" className="h-8 gap-1 rounded-r-none">
          <a href={`https://wa.me/91${waPhone}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 w-7 rounded-l-none border-l-0 px-0" aria-label="WhatsApp ready messages"><ChevronDown className="h-3.5 w-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild><a href={`https://wa.me/91${waPhone}`} target="_blank" rel="noopener noreferrer">Open chat</a></DropdownMenuItem>
            {list.length > 0 && <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs">Send a ready message</DropdownMenuLabel>
              {list.map((t) => <DropdownMenuItem key={t.id} onSelect={() => void choose(t)}>{t.name}</DropdownMenuItem>)}
            </>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {dlg && (
        <WhatsAppDialog open onOpenChange={(o) => !o && setDlg(null)} candidateId={candidate.id} applicationId={app?.application_id ?? null}
          firstName={firstName} waPhone={waPhone} initialText={dlg.text} templateCode={dlg.code} />
      )}
    </>
  );
}
