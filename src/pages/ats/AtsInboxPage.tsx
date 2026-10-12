import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Mail, Paperclip, RefreshCw, RotateCcw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { fmtDateTime, fmtRelative } from "@/lib/ats/format";
import {
  MailError, canRetry, mailErrorMessage, mailKeys, retryCandidateEmail, useMailStatus,
} from "@/lib/ats/mail";
import { QueryError, RowsSkeleton } from "@/components/ats/AtsBits";
import { useCheckNow } from "@/components/ats/EmailSettingsSection";

type View = "unread" | "all" | "undelivered" | "queued";
const PAGE = 50;
const SELECT =
  "id,candidate_id,application_id,direction,status,error,subject,snippet,from_name,from_address,to_addresses,received_at,sent_at,created_at,read_at,is_automatic,attachments,ats_candidates(full_name,ref_no),ats_applications(position_text,ats_jobs(title))";

interface InboxRow {
  id: string; candidate_id: string; application_id: string | null; direction: string; status: string; error: string | null;
  subject: string | null; snippet: string | null; from_name: string | null; from_address: string | null; to_addresses: string[];
  received_at: string | null; sent_at: string | null; created_at: string; read_at: string | null; is_automatic: boolean;
  attachments: unknown;
  ats_candidates: { full_name: string; ref_no: string } | null;
  ats_applications: { position_text: string | null; ats_jobs: { title: string } | null } | null;
}

async function fetchInbox(view: View, page: number): Promise<InboxRow[]> {
  let q = supabase.from("ats_messages").select(SELECT);
  if (view === "unread") q = q.eq("direction", "inbound").is("read_at", null);
  else if (view === "all") q = q.eq("direction", "inbound");
  else if (view === "undelivered") q = q.eq("direction", "outbound").in("status", ["failed", "bounced"])
    .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
  else q = q.eq("status", "queued");
  const order = view === "unread" || view === "all" ? "received_at" : "created_at";
  const { data, error } = await q.order(order, { ascending: false, nullsFirst: false }).range(page * PAGE, page * PAGE + PAGE - 1);
  if (error) throw error;
  return (data ?? []) as unknown as InboxRow[];
}

export default function AtsInboxPage() {
  const st = useMailStatus();
  const check = useCheckNow();
  const unread = Number(st.data?.unread ?? 0);
  const [view, setView] = useState<View | null>(null);
  useEffect(() => { if (!view && st.data) setView(unread > 0 ? "unread" : "all"); }, [st.data, unread, view]);
  const v = view ?? "unread";
  const [search, setSearch] = useState("");

  const q = useInfiniteQuery({
    queryKey: [...mailKeys.inbox, v],
    enabled: !!st.data?.enabled && !!view,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchInbox(v, pageParam as number),
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length : undefined),
    refetchInterval: 60_000,
  });
  const rows = useMemo(() => {
    const all = (q.data?.pages ?? []).flat();
    const s = search.trim().toLowerCase();
    return s ? all.filter((r) => (r.subject ?? "").toLowerCase().includes(s) || (r.ats_candidates?.full_name ?? "").toLowerCase().includes(s)) : all;
  }, [q.data, search]);

  if (st.isLoading) return <RowsSkeleton rows={6} />;
  if (st.isError) return <QueryError error={st.error} onRetry={() => st.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">Candidate emails</h2>
          {st.data?.enabled && <p className="text-xs text-muted-foreground" title={fmtDateTime(st.data.sync?.last_ok_at)}>Last checked {st.data.sync?.last_ok_at ? fmtRelative(st.data.sync.last_ok_at) : "never"}</p>}
        </div>
        {st.data?.enabled && (
          <Button size="sm" variant="outline" className="gap-1.5" disabled={check.disabled} onClick={check.run}>
            {check.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check now
          </Button>
        )}
      </div>

      {!st.data?.enabled ? (
        <EmptyState icon={Mail} title="Candidate email is off"
          description="Turn it on in ATS → Settings → Email to send emails and see replies here."
          action={<Button asChild size="sm" variant="outline"><Link to="/hrms/ats/settings?tab=email">Open email settings</Link></Button>} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="max-w-full overflow-x-auto">
              <Tabs value={v} onValueChange={(x) => setView(x as View)}>
                <TabsList className="flex-nowrap">
                  <TabsTrigger value="unread">Unread{unread ? ` (${unread})` : ""}</TabsTrigger>
                  <TabsTrigger value="all">All replies</TabsTrigger>
                  <TabsTrigger value="undelivered">Not delivered</TabsTrigger>
                  <TabsTrigger value="queued">Waiting to send</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="relative ml-auto w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or subject" className="pl-8 text-foreground" />
            </div>
          </div>
          {q.isLoading ? <RowsSkeleton rows={6} /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> :
            !rows.length ? <p className="py-10 text-center text-sm text-muted-foreground">Nothing here.</p> : (
            <ul className={cn(v === "queued" && "opacity-90", "divide-y divide-border rounded-xl border border-border bg-card")}>
              {rows.map((r) => <InboxItem key={r.id} r={r} view={v} />)}
            </ul>
          )}
          {q.hasNextPage && (
            <div className="flex justify-center"><Button variant="outline" size="sm" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Load more</Button></div>
          )}
        </>
      )}
    </div>
  );
}

function InboxItem({ r, view }: { r: InboxRow; view: View }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [busy, setBusy] = useState(false);
  const when = r.received_at ?? r.sent_at ?? r.created_at;
  const job = r.ats_applications?.ats_jobs?.title ?? (r.application_id ? r.ats_applications?.position_text : null) ?? "General";
  const attCount = Array.isArray(r.attachments) ? r.attachments.length : 0;
  const href = `/hrms/ats/candidates/${r.candidate_id}?${r.application_id ? `app=${r.application_id}&` : ""}tab=messages`;
  const retry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      const res = await retryCandidateEmail(r.id);
      res.status === "sent" ? toast.success("Email sent") : toast.error(mailErrorMessage(res.error));
    } catch (err) {
      toast.error(err instanceof MailError ? mailErrorMessage(err.code, err.field) : mailErrorMessage(null));
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["ats", "mail"] });
    }
  };
  return (
    <li>
      <div role="link" tabIndex={0} onClick={() => nav(href)} onKeyDown={(e) => { if (e.key === "Enter") nav(href); }}
        className={cn("flex cursor-pointer gap-3 px-3 py-2.5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", isMobile && "flex-col gap-1")}>
        <div className={cn("min-w-0", isMobile ? "w-full" : "w-56 shrink-0")}>
          <div className="flex items-center gap-1.5">
            {r.direction === "inbound" && !r.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
            <span className="truncate text-sm font-medium text-foreground">{r.ats_candidates?.full_name ?? "Candidate"}</span>
          </div>
          <p className="truncate text-xs text-muted-foreground"><span className="t-mono">{r.ats_candidates?.ref_no}</span> · {job}</p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm text-foreground">{r.subject || "(no subject)"}</span>
            {r.is_automatic && <Badge variant="outline" className="shrink-0 font-normal">Automatic reply</Badge>}
            {attCount > 0 && <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground"><Paperclip className="h-3 w-3" />{attCount}</span>}
          </div>
          <p className="truncate text-xs text-muted-foreground">{r.snippet}</p>
          {view === "undelivered" && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-destructive">
              <span>{r.status === "bounced" ? "Bounced: check the address" : mailErrorMessage(r.error)}</span>
              {r.status === "failed" && canRetry(r.error) && (
                <Button size="sm" variant="outline" className="h-7 gap-1" disabled={busy} onClick={retry}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Retry
                </Button>
              )}
            </div>
          )}
        </div>
        <TooltipProvider><Tooltip><TooltipTrigger asChild>
          <span className="shrink-0 text-xs text-muted-foreground">{fmtRelative(when)}</span>
        </TooltipTrigger><TooltipContent>{fmtDateTime(when)}</TooltipContent></Tooltip></TooltipProvider>
      </div>
    </li>
  );
}
