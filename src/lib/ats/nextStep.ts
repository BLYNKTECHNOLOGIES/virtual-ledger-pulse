import type { ProposedTime, ReplyIntent } from "./conversations";

export type StepKey =
  | "mark_confirmed" | "reply_see_you" | "reply" | "no_reply" | "change_time" | "ask_times" | "schedule"
  | "schedule_at" | "other_time" | "withdraw" | "use_resume" | "docs_received" | "office_address" | "pick_time";
export interface Step { key: StepKey; label: string; time?: ProposedTime }

export interface NextStepCtx {
  intent: ReplyIntent;
  /** The application has an upcoming scheduled interview. */
  hasUpcoming: boolean;
  /** …and the candidate already accepted it. */
  upcomingAccepted: boolean;
  times: ProposedTime[];
  /** Application is active or on hold. */
  appOpen: boolean;
  /** This email has a saved .pdf/.doc/.docx attachment whose file kind is 'other'. */
  canUseResume: boolean;
  /** Text mentions address / location / map / kahan / पता. */
  mentionsAddress: boolean;
}

export const ADDRESS_RE = /\b(address|location|located|map|maps|directions?|landmark|kahan|kahaan|pata|reach (the )?office|where is (the |your )?office)\b|पता|कहाँ|कहां/i;

/** Buttons of the next-step bar, primary first. */
export function nextSteps(c: NextStepCtx): Step[] {
  const reply: Step = { key: "reply", label: "Reply" };
  const noReply: Step = { key: "no_reply", label: "No reply needed" };
  switch (c.intent) {
    case "confirm":
      return c.hasUpcoming && !c.upcomingAccepted
        ? [{ key: "mark_confirmed", label: "Mark interview confirmed" }, { key: "reply_see_you", label: "Reply: see you then" }]
        : [reply, noReply];
    case "reschedule":
      return c.hasUpcoming
        ? [{ key: "change_time", label: "Change interview time", time: c.times[0] }, { key: "ask_times", label: "Ask for times" }]
        : [{ key: "schedule", label: "Schedule interview", time: c.times[0] }, { key: "ask_times", label: "Ask for times" }];
    case "availability":
      if (c.times.length)
        return [...c.times.slice(0, 3).map((t): Step => ({ key: "schedule_at", label: `Schedule ${t.label}`, time: t })), { key: "other_time", label: "Other time" }];
      return [reply, noReply];
    case "withdraw":
      return c.appOpen ? [{ key: "withdraw", label: "Mark as withdrawn" }, reply] : [reply, noReply];
    case "documents":
      return [...(c.canUseResume ? [{ key: "use_resume", label: "Use as resume" } as Step] : []), { key: "docs_received", label: "Documents received" }];
    case "question":
      return [reply, ...(c.mentionsAddress ? [{ key: "office_address", label: "Send office address" } as Step] : []), noReply];
    default:
      return [reply, noReply];
  }
}
