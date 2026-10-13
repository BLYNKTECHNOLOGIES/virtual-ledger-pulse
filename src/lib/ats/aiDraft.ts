import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAtsSettings } from "./api";

/** Optional AI reply drafts (off by default). Drafts are written on request and never stored or sent automatically. */
export const useAiDraftsOn = () => !!(useAtsSettings().data as any)?.ai_drafts_enabled;

const MESSAGES: Record<string, string> = {
  ai_busy: "The AI is busy. Try again in a minute.",
  ai_failed: "Couldn't write a draft. Write the reply yourself or try again.",
  ai_off: "AI drafts are turned off in Settings.",
  nothing_to_reply: "There's no reply from the candidate to answer yet.",
  mail_disabled: "Candidate email is turned off in Settings.",
  forbidden: "You don't have access to do this.",
};
export const aiDraftError = (code?: string | null) => MESSAGES[code ?? ""] ?? MESSAGES.ai_failed;

export class AiDraftError extends Error {
  constructor(public code: string) { super(aiDraftError(code)); }
}

export async function requestReplyDraft(candidateId: string, applicationId: string | null): Promise<string> {
  const { data, error } = await supabase.functions.invoke("ats-reply-draft", { body: { candidateId, applicationId } });
  if (error) {
    let code = "ai_failed";
    if (error instanceof FunctionsHttpError) {
      try { code = (await error.context.json())?.error ?? code; } catch { /* unreadable */ }
    }
    throw new AiDraftError(code);
  }
  const body = typeof (data as any)?.body === "string" ? (data as any).body : "";
  if (!body) throw new AiDraftError((data as any)?.error ?? "ai_failed");
  return body;
}
