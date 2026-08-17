import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle, Banknote, Clock, FileWarning, Gavel, Landmark,
  RefreshCw, ShieldAlert, Timer, TrendingUp, Download,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { exportRowsToCsv } from "@/lib/complianceCsv";

interface CommandCentre {
  open_cases: number;
  amount_at_stake: number;
  cases_by_type: { case_type: string; count: number }[];
  cases_by_age: { bucket: string; count: number }[];
  breached_sla: number;
  lien_total: number;
  lien_accounts: number;
  frozen_accounts: number;
  avg_days_to_resolve_by_bank: { bank_name: string; avg_days: number | null; resolved_count: number }[];
  hearings_30d: { id: string; title: string; case_number: string | null; court_name: string | null; next_hearing_date: string }[];
  documents_expiring: { id: string; name: string; category: string | null; expiry_date: string }[];
  approvals_pending: number;
  approvals_pending_48h: number;
  regulatory_open: number;
  regulatory_due_7d: number;
  str_pending: number;
  obligations_due_30d: { id: string; obligation_type: string; period_label: string | null; due_date: string; status: string; firm_name: string | null }[];
  idle_cases: { id: string; case_number: string; title: string; status: string; last_activity_at: string }[];
}

const inr = (n: number) =>
  "\u20B9" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const safeDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(parseISO(d), "dd MMM yyyy"); } catch { return String(d).slice(0, 10); }
};

const daysSince = (d: string) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));

function Kpi({
  icon: Icon, label, value, sub, tone = "neutral",
}: {
  icon: typeof AlertTriangle; label: string; value: string; sub?: string;
  tone?: "neutral" | "warning" | "critical" | "positive";
}) {
  const toneCls =
    tone === "critical" ? "text-destructive bg-destructive/10"
    : tone === "warning" ? "text-amber-600 bg-amber-500/10 dark:text-amber-400"
    : tone === "positive" ? "text-emerald-600 bg-emerald-500/10 dark:text-emerald-400"
    : "text-primary bg-primary/10";

  return (
    <Card className="border-border/70">
      <CardContent className="p-4 flex items-start gap-3">
        <span className={`h-9 w-9 shrink-0 rounded-md flex items-center justify-center ${toneCls}`}>
          <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold text-foreground leading-tight mt-0.5 truncate">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function ComplianceCommandCentre() {
  const { data, isLoading, refetch, isFetching, error } = useQuery({
    queryKey: ["compliance_command_centre"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("compliance_command_centre");
      if (error) throw error;
      return data as unknown as CommandCentre;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card><CardContent className="p-6 text-sm text-muted-foreground">
        Unable to load the command centre. {(error as Error)?.message}
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Command Centre</h2>
          <p className="text-sm text-muted-foreground">Live exposure, ageing and obligations across the compliance estate</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={AlertTriangle} label="Open cases" value={String(data.open_cases)}
             sub={`${data.breached_sla} past SLA`} tone={data.breached_sla > 0 ? "critical" : "neutral"} />
        <Kpi icon={Banknote} label="Amount at stake" value={inr(data.amount_at_stake)}
             sub="Across open bank cases" tone={data.amount_at_stake > 0 ? "warning" : "neutral"} />
        <Kpi icon={ShieldAlert} label="Funds under lien" value={inr(data.lien_total)}
             sub={`${data.lien_accounts} account(s) affected`} tone={data.lien_total > 0 ? "critical" : "positive"} />
        <Kpi icon={Landmark} label="Accounts impacted" value={String(data.frozen_accounts)}
             sub="Open case or active lien" tone={data.frozen_accounts > 0 ? "warning" : "positive"} />
        <Kpi icon={Clock} label="Approvals waiting" value={String(data.approvals_pending)}
             sub={`${data.approvals_pending_48h} over 48h`} tone={data.approvals_pending_48h > 0 ? "critical" : "neutral"} />
        <Kpi icon={FileWarning} label="Docs expiring (60d)" value={String(data.documents_expiring.length)}
             sub="Includes already expired" tone={data.documents_expiring.length > 0 ? "warning" : "positive"} />
        <Kpi icon={Gavel} label="Regulatory open" value={String(data.regulatory_open)}
             sub={`${data.regulatory_due_7d} due within 7 days`} tone={data.regulatory_due_7d > 0 ? "critical" : "neutral"} />
        <Kpi icon={Timer} label="STR decisions pending" value={String(data.str_pending)}
             sub="Awaiting checker" tone={data.str_pending > 0 ? "warning" : "positive"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Open cases by type</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.cases_by_type.length === 0 && <p className="text-sm text-muted-foreground">No open cases.</p>}
            {data.cases_by_type.map((r) => (
              <div key={r.case_type} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{r.case_type.replace(/_/g, " ")}</span>
                <Badge variant="secondary">{r.count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Ageing of open cases</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.cases_by_age.length === 0 && <p className="text-sm text-muted-foreground">No open cases.</p>}
            {data.cases_by_age.map((r) => (
              <div key={r.bucket} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{r.bucket}</span>
                <Badge variant={r.bucket === "90d+" ? "destructive" : r.bucket === "31-90d" ? "secondary" : "outline"}>
                  {r.count}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Average days to resolve, by bank</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.avg_days_to_resolve_by_bank.length === 0 && <p className="text-sm text-muted-foreground">No resolved cases yet.</p>}
            {data.avg_days_to_resolve_by_bank.map((r) => (
              <div key={r.bank_name} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{r.bank_name}</span>
                <span className="text-muted-foreground">{r.avg_days ?? "—"} days · {r.resolved_count} resolved</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Cases with no update (7 days+)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.idle_cases.length === 0 && <p className="text-sm text-muted-foreground">Every open case has recent activity.</p>}
            {data.idle_cases.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm gap-3">
                <span className="text-foreground truncate">{c.case_number} · {c.title}</span>
                <Badge variant="destructive" className="shrink-0">{daysSince(c.last_activity_at)}d idle</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Hearings in the next 30 days</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.hearings_30d.length === 0 && <p className="text-sm text-muted-foreground">No hearings scheduled.</p>}
            {data.hearings_30d.map((h) => (
              <div key={h.id} className="flex items-center justify-between text-sm gap-3">
                <span className="text-foreground truncate">{h.title}{h.case_number ? ` (${h.case_number})` : ""}</span>
                <span className="text-muted-foreground shrink-0">{safeDate(h.next_hearing_date)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Statutory filings due (30 days)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.obligations_due_30d.length === 0 && <p className="text-sm text-muted-foreground">Nothing due.</p>}
            {data.obligations_due_30d.map((o) => (
              <div key={o.id} className="flex items-center justify-between text-sm gap-3">
                <span className="text-foreground truncate">
                  {o.obligation_type.replace(/_/g, " ")}{o.period_label ? ` · ${o.period_label}` : ""}
                  {o.firm_name ? ` — ${o.firm_name}` : ""}
                </span>
                <span className="text-muted-foreground shrink-0">{safeDate(o.due_date)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Documents expiring or expired</CardTitle>
          <Button
            variant="outline" size="sm"
            onClick={() => exportRowsToCsv("compliance-documents-expiring", data.documents_expiring, [
              { key: "name", label: "Document" },
              { key: "category", label: "Category" },
              { key: "expiry_date", label: "Expiry date" },
            ])}
            disabled={data.documents_expiring.length === 0}
          >
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.documents_expiring.length === 0 && <p className="text-sm text-muted-foreground">No documents expiring within 60 days.</p>}
          {data.documents_expiring.map((d) => {
            const overdue = new Date(d.expiry_date) < new Date();
            return (
              <div key={d.id} className="flex items-center justify-between text-sm gap-3">
                <span className="text-foreground truncate">{d.name}{d.category ? ` · ${d.category}` : ""}</span>
                <Badge variant={overdue ? "destructive" : "secondary"} className="shrink-0">
                  {overdue ? "Expired" : "Expires"} {safeDate(d.expiry_date)}
                </Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
