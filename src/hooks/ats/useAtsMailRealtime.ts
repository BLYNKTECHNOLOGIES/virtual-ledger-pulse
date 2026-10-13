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
        bump(row.candidate_id);
        if (p.eventType === "INSERT" && row.direction === "inbound" && !row.is_automatic && row.intent !== "auto_reply" && row.candidate_id && !showingCandidate(row.candidate_id)) {
          const meta = intentMeta(row.intent);
          toast(`New reply from ${row.from_name || row.from_address || "a candidate"}`, {
            description: meta?.label,
            action: { label: "Open", onClick: () => navRef.current(`/hrms/ats/inbox?view=needs_reply&c=${row.candidate_id}`) },
          });
        }
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
