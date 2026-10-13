import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mailKeys } from "@/lib/ats/mail";
import { candKeys } from "@/lib/ats/candidates";
import { intentMeta, useConversationCounts } from "@/lib/ats/conversations";

/** Is the given candidate already on screen (Inbox with c=id, or the candidate page)? */
function showingCandidate(id: string) {
  const { pathname, search } = window.location;
  if (pathname.startsWith(`/hrms/ats/candidates/${id}`)) return true;
  return pathname.startsWith("/hrms/ats/inbox") && new URLSearchParams(search).get("c") === id;
}

/** One realtime channel for ATS mail + conversation state; mounted once in AtsWorkspace. */
export function useAtsMailRealtime(enabled: boolean) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const navRef = useRef(nav);
  navRef.current = nav;

  useEffect(() => {
    if (!enabled) return;
    const pending = new Set<string>();
    let replies: { candidate_id: string; name: string; intent: string | null }[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      qc.invalidateQueries({ queryKey: ["ats", "mail"] });
      qc.invalidateQueries({ queryKey: ["ats", "conversations"] });
      for (const id of pending) {
        qc.invalidateQueries({ queryKey: mailKeys.thread(id) });
        qc.invalidateQueries({ queryKey: candKeys.events(id) });
      }
      pending.clear();
      const got = replies;
      replies = [];
      if (got.length === 1) {
        const r = got[0];
        toast(`New reply from ${r.name}`, {
          description: intentMeta(r.intent)?.label,
          action: { label: "Open", onClick: () => navRef.current(`/hrms/ats/inbox?view=needs_reply&c=${r.candidate_id}`) },
        });
      } else if (got.length > 1) {
        toast(`${got.length} new replies`, { action: { label: "Open Inbox", onClick: () => navRef.current("/hrms/ats/inbox?view=needs_reply") } });
      }
    };
    const bump = (cid?: string | null) => {
      if (cid) pending.add(cid);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 500);
    };
    const channel = supabase
      .channel("ats-mail")
      .on("postgres_changes", { event: "*", schema: "public", table: "ats_messages" }, (p: any) => {
        const row = (p.new && Object.keys(p.new).length ? p.new : p.old) ?? {};
        // Only fresh replies toast: imports of older emails ("Find older emails", backfill) stay silent.
        const fresh = row.received_at && Date.now() - new Date(row.received_at).getTime() <= 12 * 3_600_000;
        if (p.eventType === "INSERT" && row.direction === "inbound" && !row.is_automatic && row.intent !== "auto_reply" && row.candidate_id && fresh && !showingCandidate(row.candidate_id)) {
          replies.push({ candidate_id: row.candidate_id, name: row.from_name || row.from_address || "a candidate", intent: row.intent ?? null });
        }
        bump(row.candidate_id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ats_conversation_state" }, (p: any) => {
        const row = (p.new && Object.keys(p.new).length ? p.new : p.old) ?? {};
        bump(row.candidate_id);
      })
      .subscribe((status) => {
        // Polling (60 s) keeps screens fresh if this fails.
        console.info(`[ats-mail realtime] ${status}`);
      });
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}

/** Prefixes the tab title with "(n) " while inside the ATS and replies are waiting. */
export function useNeedsReplyTitle(n: number) {
  const { pathname } = useLocation();
  const original = useRef<string | null>(null);
  useEffect(() => {
    if (original.current === null) original.current = document.title.replace(/^\(\d+\)\s/, "");
    const base = original.current;
    document.title = pathname.startsWith("/hrms/ats") && n > 0 ? `(${n}) ${base}` : base;
  }, [n, pathname]);
  useEffect(() => () => { if (original.current !== null) document.title = original.current; }, []);
}

export { useConversationCounts };
