import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { Bot, CalendarClock, CalendarDays, CheckCircle2, HelpCircle, MessageSquare, Paperclip, ThumbsUp, UserX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables } from "@/integrations/supabase/types";

export type ConversationRow = Database["public"]["Views"]["ats_conversation_list"]["Row"];
export type ConversationState = Tables<"ats_conversation_state">;
export type ConvView = "needs_reply" | "follow_up" | "waiting" | "snoozed" | "done" | "unread" | "all";
export type ReplyIntent = "confirm" | "reschedule" | "availability" | "withdraw" | "documents" | "question" | "thanks" | "auto_reply" | "other";
export interface ProposedTime { start: string; label: string; dateOnly: boolean; text: string }
export interface IntentData { times?: ProposedTime[]; preview?: string; confidence?: string; signals?: string[]; lang?: string }
export type ConversationCounts = Record<"needs_reply" | "follow_up" | "waiting" | "snoozed" | "done" | "unread" | "all", number>;

export const CONV_PAGE = 40;

export const convKeys = {
  all: ["ats", "conversations"] as const,
  list: (view: ConvView, search: string) => ["ats", "conversations", "list", view, search] as const,
  counts: ["ats", "conversations", "counts"] as const,
  state: (candidateId: string) => ["ats", "conversations", "state", candidateId] as const,
};

export const useConversations = (view: ConvView, search: string, enabled = true) =>
  useInfiniteQuery({
    queryKey: convKeys.list(view, search),
    enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc("ats_conversations", {
        p_view: view, p_search: search || undefined, p_before: (pageParam as string | null) ?? undefined, p_limit: CONV_PAGE,
      });
      if (error) throw error;
      return (data ?? []) as ConversationRow[];
    },
    getNextPageParam: (last) => (last.length === CONV_PAGE ? last[last.length - 1]?.last_at ?? undefined : undefined),
    refetchInterval: 60_000,
  });

export const useConversationCounts = (enabled = true) =>
  useQuery({
    queryKey: convKeys.counts,
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ats_conversation_counts");
      if (error) throw error;
      const d = (data ?? {}) as Record<string, unknown>;
      const n = (k: string) => Number(d[k] ?? 0) || 0;
      return { needs_reply: n("needs_reply"), follow_up: n("follow_up"), waiting: n("waiting"), snoozed: n("snoozed"), done: n("done"), unread: n("unread"), all: n("all") } as ConversationCounts;
    },
  });

export const useConversationState = (candidateId?: string | null) =>
  useQuery({
    queryKey: convKeys.state(candidateId ?? ""),
    enabled: !!candidateId,
    queryFn: async () => {
      const { data, error } = await supabase.from("ats_conversation_state").select("*").eq("candidate_id", candidateId!).maybeSingle();
      if (error) throw error;
      return data as ConversationState | null;
    },
  });

export type ConvAction = "done" | "reopen" | "snooze" | "follow_up" | "clear_follow_up";
export async function setConversation(candidateId: string, action: ConvAction, until?: string) {
  const { error } = await supabase.rpc("ats_set_conversation", { p_candidate_id: candidateId, p_action: action, p_until: until });
  if (error) throw error;
}
export async function setMessageIntent(id: string, intent: ReplyIntent) {
  const { error } = await supabase.rpc("ats_set_message_intent", { p_message_id: id, p_intent: intent });
  if (error) throw error;
}
export async function markHandled(id: string, action: string | null) {
  const { error } = await supabase.rpc("ats_mark_message_handled", { p_message_id: id, p_action: action as string });
  if (error) throw error;
}
export async function setInterviewResponse(interviewId: string, response: string, messageId?: string) {
  const { error } = await supabase.rpc("ats_set_interview_response", { p_interview_id: interviewId, p_response: response, p_message_id: messageId });
  if (error) throw error;
}
export async function logContact(a: {
  candidateId: string; applicationId: string | null; channel: "call" | "whatsapp"; outcome: string;
  note?: string | null; templateCode?: string | null; followUpAt?: string | null;
}) {
  const { data, error } = await supabase.rpc("ats_log_contact", {
    p_candidate_id: a.candidateId, p_application_id: a.applicationId as string, p_channel: a.channel, p_outcome: a.outcome,
    p_note: a.note ?? undefined, p_template_code: a.templateCode ?? undefined, p_follow_up_at: a.followUpAt ?? undefined,
  });
  if (error) throw error;
  return data as string;
}

export type IntentTone = "success" | "warning" | "primary" | "destructive" | "info" | "neutral";
export const INTENTS: ReplyIntent[] = ["confirm", "reschedule", "availability", "withdraw", "documents", "question", "thanks", "auto_reply", "other"];
export const INTENT_META: Record<ReplyIntent, { label: string; tone: IntentTone; icon: LucideIcon; hint: string }> = {
  confirm: { label: "Confirmed", tone: "success", icon: CheckCircle2, hint: "Says they will attend" },
  reschedule: { label: "Wants another time", tone: "warning", icon: CalendarClock, hint: "Asks to move the interview" },
  availability: { label: "Sent times", tone: "primary", icon: CalendarDays, hint: "Suggests dates or times" },
  withdraw: { label: "Not interested", tone: "destructive", icon: UserX, hint: "No longer wants the job" },
  documents: { label: "Sent documents", tone: "info", icon: Paperclip, hint: "Sent a resume or documents" },
  question: { label: "Has a question", tone: "warning", icon: HelpCircle, hint: "Asks something" },
  thanks: { label: "Thanks / OK", tone: "neutral", icon: ThumbsUp, hint: "A short thank-you" },
  auto_reply: { label: "Automatic reply", tone: "neutral", icon: Bot, hint: "Out-of-office or auto-response" },
  other: { label: "Reply", tone: "neutral", icon: MessageSquare, hint: "Anything else" },
};
export const intentMeta = (i?: string | null) => (i && i in INTENT_META ? INTENT_META[i as ReplyIntent] : null);

export const HANDLED_LABEL: Record<string, string> = {
  interview_accepted: "Interview marked as confirmed",
  calendar_accepted: "Accepted the calendar invite",
  documents_received: "Documents received",
  no_reply_needed: "No reply needed",
  interview_changed: "Interview time changed",
  interview_scheduled: "Interview scheduled",
  withdrawn: "Marked as withdrawn",
  resume_set: "Saved as resume",
};

export const intentData = (v: unknown): IntentData => (v && typeof v === "object" && !Array.isArray(v) ? (v as IntentData) : {});
export const proposedTimes = (v: unknown): ProposedTime[] =>
  (intentData(v).times ?? []).filter((t) => t && typeof t.start === "string" && typeof t.label === "string").slice(0, 3);

// ---------------------------------------------------------------- IST time choices
const IST = "Asia/Kolkata";
/** YYYY-MM-DD in IST, n days after `now`. */
export function istYmd(now: Date, addDays = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(new Date(now.getTime() + addDays * 86_400_000));
}
export const istIso = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00+05:30`).toISOString();
function istHour(now: Date) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: IST, hour: "2-digit", hour12: false }).format(now)) % 24;
}
function istDow(now: Date) {
  return new Date(`${istYmd(now)}T12:00:00+05:30`).getUTCDay();
}

export interface TimeChoice { key: string; label: string; until: string | null }
export function snoozeChoices(now = new Date()): TimeChoice[] {
  const out: TimeChoice[] = [];
  if (istHour(now) < 16) out.push({ key: "today", label: "Later today, 5:00 PM", until: istIso(istYmd(now), "17:00") });
  out.push({ key: "tomorrow", label: "Tomorrow, 10:00 AM", until: istIso(istYmd(now, 1), "10:00") });
  const toMon = ((8 - istDow(now)) % 7) || 7;
  out.push({ key: "monday", label: "Monday, 10:00 AM", until: istIso(istYmd(now, toMon), "10:00") });
  out.push({ key: "pick", label: "Pick date and time…", until: null });
  return out;
}

export const FOLLOW_UP_CHOICES = [
  { value: "off", label: "Off", days: 0 },
  { value: "1d", label: "1 day", days: 1 },
  { value: "2d", label: "2 days", days: 2 },
  { value: "3d", label: "3 days", days: 3 },
  { value: "1w", label: "1 week", days: 7 },
] as const;
export type FollowUpChoice = (typeof FOLLOW_UP_CHOICES)[number]["value"];
/** 10:00 AM IST, `days` days from now; null for Off. */
export function followUpAt(choice: FollowUpChoice, now = new Date()): string | null {
  const c = FOLLOW_UP_CHOICES.find((x) => x.value === choice);
  return c && c.days > 0 ? istIso(istYmd(now, c.days), "10:00") : null;
}
export const followUpChoices = (now = new Date()) =>
  FOLLOW_UP_CHOICES.map((c) => ({ ...c, until: followUpAt(c.value, now) }));
