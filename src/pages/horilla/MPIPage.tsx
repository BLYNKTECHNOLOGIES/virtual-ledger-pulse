import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Award, TrendingUp, AlertTriangle, ShieldAlert, Trophy, ClipboardList, Settings, Users, Activity, Target, MessageSquare } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { PageHeader } from "@/components/shared/PageHeader";

type Grade = "S" | "A+" | "A" | "B" | "C" | "D";
const GRADE_COLORS: Record<Grade, string> = {
  S: "#7c3aed", "A+": "#2563eb", A: "#16a34a", B: "#ca8a04", C: "#ea580c", D: "#dc2626",
};
const GRADE_BONUS: Record<Grade, string> = {
  S: "20-30%", "A+": "15-20%", A: "8-12%", B: "Standard", C: "Warning / PIP", D: "PIP / Review",
};

function gradeFromScore(s: number): Grade {
  if (s >= 95) return "S";
  if (s >= 90) return "A+";
  if (s >= 80) return "A";
  if (s >= 70) return "B";
  if (s >= 60) return "C";
  return "D";
}

function currentPeriodIST(): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" });
  const parts = f.formatToParts(new Date());
  const y = parts.find(p => p.type === "year")?.value;
  const m = parts.find(p => p.type === "month")?.value;
  return `${y}-${m}`;
}

export default function MPIPage() {
  const [period, setPeriod] = useState<string>(currentPeriodIST());

  const { data: templates = [] } = useQuery({
    queryKey: ["mpi_templates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("mpi_scorecard_templates").select("*").order("department");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: kpis = [] } = useQuery({
    queryKey: ["mpi_kpis"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("mpi_kpi_definitions").select("*").order("category");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: results = [] } = useQuery({
    queryKey: ["mpi_results", period],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("mpi_monthly_results").select("*").eq("period_key", period);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: violations = [] } = useQuery({
    queryKey: ["mpi_violations"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("mpi_critical_violations").select("*").order("reported_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: pips = [] } = useQuery({
    queryKey: ["mpi_pips"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("mpi_pip_records").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const gradeDistribution = useMemo(() => {
    const counts: Record<Grade, number> = { S: 0, "A+": 0, A: 0, B: 0, C: 0, D: 0 };
    results.forEach(r => { counts[r.grade as Grade] = (counts[r.grade as Grade] || 0) + 1; });
    return (Object.keys(counts) as Grade[]).map(g => ({ name: g, value: counts[g] }));
  }, [results]);

  const avgScore = results.length ? +(results.reduce((s, r) => s + Number(r.total_score), 0) / results.length).toFixed(1) : 0;
  const flagged = results.filter(r => r.grade === "C" || r.grade === "D" || r.grade_capped).length;
  const topPerformers = [...results].sort((a, b) => Number(b.total_score) - Number(a.total_score)).slice(0, 10);

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="MPI — Performance Index"
        description="Enterprise KPI / KRA / behavioral scoring for the entire organisation"
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Period</span>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40 h-9 text-foreground" />
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Scored Employees" value={results.length} tone="bg-primary/10 text-primary" />
        <StatCard icon={TrendingUp} label="Avg Score" value={avgScore || "—"} tone="bg-success/10 text-success" />
        <StatCard icon={AlertTriangle} label="At Risk (C/D/Capped)" value={flagged} tone="bg-warning/10 text-warning" />
        <StatCard icon={ShieldAlert} label="Critical Violations" value={violations.length} tone="bg-destructive/10 text-destructive" />
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="dashboard"><Activity className="h-3.5 w-3.5 mr-1" />KPI Dashboard</TabsTrigger>
          <TabsTrigger value="scorecards"><ClipboardList className="h-3.5 w-3.5 mr-1" />Scorecards</TabsTrigger>
          <TabsTrigger value="incentives"><Award className="h-3.5 w-3.5 mr-1" />Incentives</TabsTrigger>
          <TabsTrigger value="warnings"><AlertTriangle className="h-3.5 w-3.5 mr-1" />Warnings</TabsTrigger>
          <TabsTrigger value="pip">PIP Tracker</TabsTrigger>
          <TabsTrigger value="promotion">Promotion</TabsTrigger>
          <TabsTrigger value="violations"><ShieldAlert className="h-3.5 w-3.5 mr-1" />Violations</TabsTrigger>
          <TabsTrigger value="leaderboard"><Trophy className="h-3.5 w-3.5 mr-1" />Leaderboard</TabsTrigger>
          <TabsTrigger value="templates"><Settings className="h-3.5 w-3.5 mr-1" />Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm font-semibold">Grade Distribution</CardTitle></CardHeader>
              <CardContent>
                {results.length ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={gradeDistribution.filter(d => d.value > 0)} dataKey="value" nameKey="name" outerRadius={90} label={({ name, value }: any) => `${name} (${value})`}>
                        {gradeDistribution.map((d) => <Cell key={d.name} fill={GRADE_COLORS[d.name as Grade]} />)}
                      </Pie>
                      <Tooltip /><Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <MpiEmptyState label="No scored employees for this period yet" />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm font-semibold">Score Distribution</CardTitle></CardHeader>
              <CardContent>
                {results.length ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={gradeDistribution}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {gradeDistribution.map((d) => <Cell key={d.name} fill={GRADE_COLORS[d.name as Grade]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <MpiEmptyState label="No data" />}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="scorecards" className="mt-4">
          <ScorecardsTab results={results} templates={templates} />
        </TabsContent>

        <TabsContent value="incentives" className="mt-4">
          <IncentivesTab results={results} />
        </TabsContent>

        <TabsContent value="warnings" className="mt-4">
          <WarningsTab results={results} />
        </TabsContent>

        <TabsContent value="pip" className="mt-4">
          <PipTab pips={pips} />
        </TabsContent>

        <TabsContent value="promotion" className="mt-4">
          <PromotionTab />
        </TabsContent>

        <TabsContent value="violations" className="mt-4">
          <ViolationsTab violations={violations} />
        </TabsContent>

        <TabsContent value="leaderboard" className="mt-4">
          <LeaderboardTab top={topPerformers} />
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <TemplatesTab templates={templates} kpis={kpis} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: any) {
  return (
    <Card><CardContent className="p-4 flex items-center gap-3">
      <div className={`p-2.5 rounded-xl ${tone}`}><Icon className="h-5 w-5" /></div>
      <div><p className="text-2xl font-bold text-foreground tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
    </CardContent></Card>
  );
}

function MpiEmptyState({ label }: { label: string }) {
  return <div className="py-12 text-center text-sm text-muted-foreground">{label}</div>;
}

function GradeBadge({ grade }: { grade: Grade }) {
  return <Badge style={{ backgroundColor: GRADE_COLORS[grade], color: "white" }}>{grade}</Badge>;
}

const TH = "px-4 py-2.5 text-left text-[11px] uppercase tracking-wide text-muted-foreground font-medium";
const TD = "px-4 py-2.5 text-sm";

function ScorecardsTab({ results, templates }: any) {
  if (!results.length) return <Card><CardContent className="p-6"><MpiEmptyState label="Run a scoring cycle to see employee scorecards" /></CardContent></Card>;
  const tplName = (id: string) => templates.find((t: any) => t.id === id)?.name ?? "—";
  return (
    <Card><CardContent className="p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className={TH}>Employee</th>
            <th className={TH}>Template</th>
            <th className={TH}>Score</th>
            <th className={TH}>Grade</th>
            <th className={TH}>Status</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r: any) => (
            <tr key={r.id} className="border-t hover:bg-muted/30 transition-colors">
              <td className={`${TD} font-mono text-xs`}>{r.employee_id.slice(0, 8)}</td>
              <td className={TD}>{tplName(r.template_id)}</td>
              <td className={`${TD} w-48`}><div className="flex items-center gap-2"><Progress value={Number(r.total_score)} className="h-2" /><span className="text-xs font-medium tabular-nums w-10">{Number(r.total_score).toFixed(1)}</span></div></td>
              <td className={TD}><GradeBadge grade={r.grade} /></td>
              <td className={`${TD} text-xs`}>{r.grade_capped ? <span className="text-destructive">Capped: {r.cap_reason}</span> : "Normal"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardContent></Card>
  );
}

function IncentivesTab({ results }: any) {
  const rows = (Object.keys(GRADE_BONUS) as Grade[]).map(g => ({
    g, bonus: GRADE_BONUS[g], count: results.filter((r: any) => r.grade === g).length,
  }));
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm font-semibold">Incentive Preview (Phase 1 — read-only)</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">No payroll writes occur in Phase 1. Use this for visibility only.</p>
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr><th className={TH}>Grade</th><th className={TH}>Bonus</th><th className={TH}>Employees</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.g} className="border-t hover:bg-muted/30 transition-colors"><td className={TD}><GradeBadge grade={r.g} /></td><td className={TD}>{r.bonus}</td><td className={`${TD} tabular-nums`}>{r.count}</td></tr>)}</tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function WarningsTab({ results }: any) {
  const flagged = results.filter((r: any) => ["C", "D"].includes(r.grade) || r.grade_capped);
  if (!flagged.length) return <Card><CardContent className="p-6"><MpiEmptyState label="No employees at risk this period" /></CardContent></Card>;
  return (
    <Card><CardContent className="p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50"><tr><th className={TH}>Employee</th><th className={TH}>Score</th><th className={TH}>Grade</th><th className={TH}>Reason</th></tr></thead>
        <tbody>{flagged.map((r: any) => (
          <tr key={r.id} className="border-t hover:bg-muted/30 transition-colors">
            <td className={`${TD} font-mono text-xs`}>{r.employee_id.slice(0, 8)}</td>
            <td className={`${TD} tabular-nums`}>{Number(r.total_score).toFixed(1)}</td>
            <td className={TD}><GradeBadge grade={r.grade} /></td>
            <td className={`${TD} text-xs`}>{r.grade_capped ? r.cap_reason : `Below threshold`}</td>
          </tr>
        ))}</tbody>
      </table>
    </CardContent></Card>
  );
}

function PipTab({ pips }: any) {
  if (!pips.length) return <Card><CardContent className="p-6"><MpiEmptyState label="No active PIPs" /></CardContent></Card>;
  return (
    <div className="space-y-2">{pips.map((p: any) => (
      <Card key={p.id}><CardContent className="p-4 flex items-center justify-between">
        <div><p className="font-medium text-sm font-mono">{p.employee_id.slice(0, 8)}</p><p className="text-xs text-muted-foreground tabular-nums">{p.start_date} → {p.end_date} · triggered at grade {p.triggering_grade ?? "—"}</p></div>
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-muted-foreground/20">{p.status}</span>
      </CardContent></Card>
    ))}</div>
  );
}

function PromotionTab() {
  return <Card><CardContent className="p-6"><MpiEmptyState label="Promotion eligibility requires 3+ months of scoring history. Continue scoring to populate." /></CardContent></Card>;
}

function ViolationsTab({ violations }: any) {
  if (!violations.length) return <Card><CardContent className="p-6"><MpiEmptyState label="No critical violations logged" /></CardContent></Card>;
  return (
    <Card><CardContent className="p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50"><tr><th className={TH}>Date</th><th className={TH}>Employee</th><th className={TH}>Type</th><th className={TH}>Severity</th><th className={TH}>Description</th></tr></thead>
        <tbody>{violations.map((v: any) => (
          <tr key={v.id} className="border-t hover:bg-muted/30 transition-colors">
            <td className={`${TD} tabular-nums text-xs`}>{new Date(v.reported_at).toLocaleDateString()}</td>
            <td className={`${TD} font-mono text-xs`}>{v.employee_id.slice(0, 8)}</td>
            <td className={TD}>{v.violation_type}</td>
            <td className={TD}><Badge variant={v.severity === "critical" ? "destructive" : "outline"}>{v.severity}</Badge></td>
            <td className={`${TD} text-xs`}>{v.description}</td>
          </tr>
        ))}</tbody>
      </table>
    </CardContent></Card>
  );
}

function LeaderboardTab({ top }: any) {
  if (!top.length) return <Card><CardContent className="p-6"><MpiEmptyState label="Leaderboard appears once scoring is run" /></CardContent></Card>;
  return (
    <Card><CardContent className="p-0">
      <table className="w-full text-sm">
        <thead className="bg-muted/50"><tr><th className={TH}>Rank</th><th className={TH}>Employee</th><th className={TH}>Score</th><th className={TH}>Grade</th></tr></thead>
        <tbody>{top.map((r: any, i: number) => (
          <tr key={r.id} className="border-t hover:bg-muted/30 transition-colors">
            <td className={`${TD} font-bold text-warning tabular-nums`}>#{i + 1}</td>
            <td className={`${TD} font-mono text-xs`}>{r.employee_id.slice(0, 8)}</td>
            <td className={`${TD} tabular-nums`}>{Number(r.total_score).toFixed(1)}</td>
            <td className={TD}><GradeBadge grade={r.grade} /></td>
          </tr>
        ))}</tbody>
      </table>
    </CardContent></Card>
  );
}

function TemplatesTab({ templates, kpis }: any) {
  const [selected, setSelected] = useState<string>(templates[0]?.id ?? "");
  const tplKpis = useMemo(() => kpis.filter((k: any) => k.template_id === selected), [kpis, selected]);
  const total = tplKpis.reduce((s: number, k: any) => s + Number(k.weight), 0);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">Scorecard Templates</CardTitle>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-72 h-9 text-foreground"><SelectValue placeholder="Select template" /></SelectTrigger>
          <SelectContent>{templates.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.department.toUpperCase()} — {t.name}</SelectItem>)}</SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <div className="text-xs text-muted-foreground mb-3">Total weight: <span className={total === 100 ? "text-success" : "text-destructive"}>{total}%</span> (templates are weight-locked; only Super Admin can edit)</div>
        {tplKpis.length === 0 ? <MpiEmptyState label="Select a template" /> : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr><th className={TH}>Category</th><th className={TH}>KPI</th><th className={TH}>Weight</th><th className={TH}>Source</th></tr></thead>
            <tbody>{tplKpis.map((k: any) => (
              <tr key={k.id} className="border-t hover:bg-muted/30 transition-colors">
                <td className={`${TD} capitalize`}>{k.category}</td>
                <td className={TD}>{k.name}</td>
                <td className={`${TD} tabular-nums`}>{k.weight}%</td>
                <td className={TD}><Badge variant="outline">{k.data_source}</Badge></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
