import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAtsSettings } from "./api";

/** Optional self-scheduling (off by default): HR offers times, the candidate picks one on a public link. */
export const useSelfScheduleOn = () => {
  const s = useAtsSettings();
  return !!(s.data as any)?.self_schedule_enabled;
};

export interface SlotOffer {
  id: string; application_id: string; candidate_id: string; move_interview_id: string | null;
  title: string; mode: "in_person" | "video" | "phone"; location: string | null; meeting_url: string | null;
  candidate_note: string | null; duration_minutes: number; slots: string[]; panel: string[]; move_stage: boolean;
  status: "open" | "booked" | "cancelled"; expires_at: string; booked_start: string | null; booked_at: string | null;
  interview_id: string | null; created_by_name: string | null; created_at: string;
}

export const slotKeys = { offers: (appId: string) => ["ats", "slot-offers", appId] as const };

export const useSlotOffers = (applicationId: string | null | undefined, enabled = true) =>
  useQuery({
    queryKey: slotKeys.offers(applicationId ?? ""),
    enabled: !!applicationId && enabled,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("ats_slot_offers").select("*")
        .eq("application_id", applicationId).in("status", ["open", "booked"]).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SlotOffer[];
    },
  });

export interface CreateSlotOfferInput {
  application_id: string; move_interview_id: string | null; title: string; mode: string;
  location: string | null; meeting_url: string | null; duration_minutes: number; panel: string[];
  candidate_note: string | null; move_to_interview_stage: boolean; slots: string[];
}
export interface CreatedSlotOffer { offer_id: string; link: string; expires_at: string; slots: string[] }

// Links live only in memory for this tab: never in localStorage or the database.
const linkStore = new Map<string, string>();
export const offerLink = (offerId: string) => linkStore.get(offerId) ?? null;

export async function createSlotOffer(p: CreateSlotOfferInput): Promise<CreatedSlotOffer> {
  const { data, error } = await (supabase.rpc as any)("ats_create_slot_offer", { p });
  if (error) throw error;
  const r = data as { offer_id: string; link: string; expires_at: string; slots: string[] };
  linkStore.set(r.offer_id, r.link);
  return { offer_id: r.offer_id, link: r.link, expires_at: r.expires_at, slots: r.slots };
}

export async function cancelSlotOffer(id: string) {
  const { error } = await (supabase.rpc as any)("ats_cancel_slot_offer", { p_offer_id: id });
  if (error) throw error;
  linkStore.delete(id);
}

const fmtSlot = (iso: string) => {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" }).format(d).replace(/,/g, "");
  const t = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(d).toUpperCase();
  return `${day}, ${t} IST`;
};
/** One line per time: "• Thu 15 Oct, 11:00 AM IST". */
export const slotListText = (slots: string[]) => [...slots].sort().map((s) => `• ${fmtSlot(s)}`).join("\n");

export const SLOT_SAMPLE = { slot_link: "https://erp.blynkex.com/interview/pick/EXAMPLE", slot_list: "• Thu 15 Oct, 11:00 AM IST\n• Thu 15 Oct, 3:00 PM IST" };
export const SLOT_TEMPLATE_CODES = ["interview-pick-a-slot", "wa-pick-a-slot"];
export const fillSlots = (s: string, link: string, list: string) =>
  s.replace(/\{\{\s*slot_link\s*\}\}/g, link).replace(/\{\{\s*slot_list\s*\}\}/g, list);
