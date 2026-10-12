import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { QueryError, RowsSkeleton } from "@/components/ats/AtsBits";
import { InterviewStatusBadge, PanelChips, ResponseChip, WhereLine } from "@/components/ats/InterviewBits";
import { InterviewActions } from "@/components/ats/InterviewActions";
import { useMyUserId } from "@/lib/ats/candidates";
import { useMailStatus } from "@/lib/ats/mail";
import {
  activePanel, istInputs, ivClock, ivDateText, ivDayLabel, ivState, listRowTarget, missingFeedback,
  useInterviewCounts, useInterviewList, type InterviewListRow, type IvView,
} from "@/lib/ats/interviews";

const VIEWS: { v: IvView; l: string }[] = [
  { v: "upcoming", l: "Upcoming" }, { v: "today", l: "Today" }, { v: "action", l: "Needs action" },
  { v: "past", l: "Past" }, { v: "cancelled", l: "Cancelled" },
];
const EMPTY: Record<IvView, string> = {
  upcoming: "No upcoming interviews. Open a candidate and choose Schedule.",
  today: "No interviews today.",
  action: "You're all caught up.",
  past: "No interviews in the last 90 days.",
  cancelled: "No cancelled interviews in the last 90 days.",
};

export default function AtsInterviewsPage() {
  const [sp, setSp] = useSearchParams();
  const rawView = sp.get("view") as IvView | null;
  const view: IvView = VIEWS.some((x) => x.v === rawView) ? rawView! : "upcoming";
  const who = sp.get("who") ?? "all";
  const job = sp.get("job") ?? "all";
  const q = sp.get("q") ?? "";
  const set = (k: string, v: string, def: string) => {
    const n = new URLSearchParams(sp);
    if (!v || v === def) n.delete(k); else n.set(k, v);
    setSp(n, { replace: true });
  };
  const list = useInterviewList(view);
  const counts = useInterviewCounts();
  const me = useMyUserId();
  const mail = useMailStatus();
  const mailOn = !!mail.data?.enabled;
  const isMobile = useIsMobile();
  const rows = list.data ?? [];

  const people = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) for (const p of activePanel(r)) if (p.employee_id) m.set(p.employee_id, p.name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const jobs = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) { const j = r.ats_applications?.ats_jobs; if (j) m.set(j.id, j.title); }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (who === "me" && !activePanel(r).some((p) => p.user_id && p.user_id === me.data)) return false;
    if (who !== "all" && who !== "me" && !activePanel(r).some((p) => p.employee_id === who)) return false;
    const jid = r.ats_applications?.ats_jobs?.id ?? null;
    if (job === "general" && jid) return false;
    if (job !== "all" && job !== "general" && jid !== job) return false;
    const s = q.trim().toLowerCase();
    if (s && !`${r.ats_candidates?.full_name ?? ""} ${r.ats_candidates?.ref_no ?? ""}`.toLowerCase().includes(s)) return false;
    return true;
  });

  const groups = useMemo(() => {
    const out: { day: string; label: string; rows: InterviewListRow[] }[] = [];
    for (const r of filtered) {
      const day = istInputs(r.starts_at).date;
      let g = out[out.length - 1];
      if (!g || g.day !== day) {
        const dl = ivDayLabel(r.starts_at);
        const label = dl === "Today" || dl === "Tomorrow" ? `${dl} · ${ivDateText(new Date(r.starts_at))}` : ivDateText(new Date(r.starts_at));
        g = { day, label, rows: [] }; out.push(g);
      }
      g.rows.push(r);
    }
    return out;
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Interviews</h2>
        <p className="text-sm text-muted-foreground">All times are IST.</p>
      </div>
      <Tabs value={view} onValueChange={(v) => set("view", v, "upcoming")}>
        <div className="max-w-full overflow-x-auto">
          <TabsList className="flex-nowrap">
            {VIEWS.map((x) => (
              <TabsTrigger key={x.v} value={x.v}>
                {x.l}
                {x.v === "action" && (counts.data?.action ?? 0) > 0 && <Badge className="ml-1.5 h-5 min-w-5 justify-center px-1.5 text-[10px]">{counts.data!.action}</Badge>}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      <div className="flex flex-wrap gap-2">
        <Select value={who} onValueChange={(v) => set("who", v, "all")}>
          <SelectTrigger className="h-9 w-[180px] text-foreground" aria-label="Interviewer"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            <SelectItem value="me">Me</SelectItem>
            {people.map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={job} onValueChange={(v) => set("job", v, "all")}>
          <SelectTrigger className="h-9 w-[200px] text-foreground" aria-label="Job"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All jobs</SelectItem>
            {jobs.map(([id, t]) => <SelectItem key={id} value={id}>{t}</SelectItem>)}
            <SelectItem value="general">General</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => set("q", e.target.value, "")} placeholder="Candidate name or ref" className="h-9 pl-8 text-foreground" />
        </div>
      </div>

      {list.isLoading ? <RowsSkeleton rows={6} /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> :
        !filtered.length ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {EMPTY[view]}
            {view === "upcoming" && <> <Link to="/hrms/ats/candidates" className="font-medium text-primary hover:underline">Candidates</Link></>}
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.day} className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">{g.label}</h3>
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                  {g.rows.map((r) => <Row key={r.id} r={r} view={view} mailOn={mailOn} mobile={isMobile} />)}
                </ul>
              </section>
            ))}
          </div>
        )}
    </div>
  );
}

function Row({ r, view, mailOn, mobile }: { r: InterviewListRow; view: IvView; mailOn: boolean; mobile: boolean }) {
  const target = listRowTarget(r);
  const canSchedule = r.ats_applications?.status === "active" || r.ats_applications?.status === "on_hold";
  const missing = missingFeedback(r);
  const st = ivState(r);
  const time = (
    <div className={mobile ? "flex items-baseline gap-2" : "w-20 shrink-0"}>
      <p className="text-sm font-medium tabular-nums text-foreground">{ivClock(new Date(r.starts_at))}</p>
      <p className="text-xs tabular-nums text-muted-foreground">{mobile ? "– " : ""}{ivClock(new Date(r.ends_at))}</p>
    </div>
  );
  const who = (
    <div className={mobile ? "min-w-0" : "w-56 min-w-0 shrink-0"}>
      <Link to={`/hrms/ats/candidates/${r.candidate_id}?app=${r.application_id}`} className="truncate font-medium text-foreground hover:text-primary hover:underline">
        {r.ats_candidates?.full_name ?? "Candidate"}
      </Link>
      <p className="truncate text-xs text-muted-foreground"><span className="t-mono">{r.ats_candidates?.ref_no}</span> · {target.jobTitle && r.ats_applications?.ats_jobs ? target.jobTitle : "General"}</p>
    </div>
  );
  return (
    <li className={mobile ? "space-y-1.5 p-3" : "flex gap-4 p-3"}>
      {time}
      {who}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{r.title}</span>
          <InterviewStatusBadge iv={r} />
        </div>
        <WhereLine iv={r} phone={target.phone} />
        <div className="flex flex-wrap items-center gap-1"><PanelChips iv={r} mailOn={mailOn} /><ResponseChip iv={r} /></div>
        {view === "action" && st === "completed" && missing.length > 0 && <p className="text-sm text-warning">Feedback missing from {missing.map((m) => m.name).join(", ")}</p>}
        <InterviewActions iv={r} target={target} mailOn={mailOn} canSchedule={canSchedule} primary={view === "action"} />
      </div>
    </li>
  );
}
