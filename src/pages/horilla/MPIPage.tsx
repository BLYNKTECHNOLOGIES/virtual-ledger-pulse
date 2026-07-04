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
import { Award, TrendingUp, AlertTriangle, ShieldAlert, Trophy, ClipboardList, Settings, Users, Activity } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

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
    <div className="space-y-6 page-mount">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">MPI — Performance Index</h1>
          <p className="text-sm text-muted-foreground">Enterprise KPI / KRA / behavioral scoring for the entire organisation</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Period</span>
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40 text-foreground" />
        </div>
      </div>

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
              <CardHeader><CardTitle className="text-sm">Grade Distribution</CardTitle></CardHeader>
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
                ) : <EmptyState label="No scored employees for this period yet" />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Score Distribution</CardTitle></CardHeader>
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
                ) : <EmptyState label="No data" />}
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
      <div><p className="text-2xl font-bold text-foreground">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
    </CardContent></Card>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="py-12 text-center text-sm text-muted-foreground">{label}</div>;
}

function GradeBadge({ grade }: { grade: Grade }) {
  return <Badge style={{ backgroundColor: GRADE_COLORS[grade], color: "white" }}>{grade}</Badge>;
}

function ScorecardsTab({ results, templates }: any) {
  if (!results.length) return <Card><CardContent className="p-6"><EmptyState label="Run a scoring cycle to see employee scorecards" /></CardContent></Card>;
  const tplName = (id: string) => templates.find((t: any) => t.id === id)?.name ?? "—";
  return (
    <Card><CardContent className="p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr><th className="px-4 py-2 text-left">Employee</th><th className="text-left">Template</th><th className="text-left">Score</th><th className="text-left">Grade</th><th className="text-left">Status</th></tr>
        </thead>
        <tbody>
          {results.map((r: any) => (
            <tr key={r.id} className="border-t">
              <td className="px-4 py-2 font-mono text-xs">{r.employee_id.slice(0, 8)}</td>
              <td>{tplName(r.template_id)}</td>
              <td className="w-48"><div className="flex items-center gap-2"><Progress value={Number(r.total_score)} className="h-2" /><span className="text-xs font-medium w-10">{Number(r.total_score).toFixed(1)}</span></div></td>
              <td><GradeBadge grade={r.grade} /></td>
              <td className="text-xs">{r.grade_capped ? <span className="text-destructive">Capped: {r.cap_reason}</span> : "Normal"}</td>
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
    <Card><CardHeader><CardTitle className="text-sm">Incentive Preview (Phase 1 — read-only)</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">No payroll writes occur in Phase 1. Use this for visibility only.</p>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2 text-left">Grade</th><th className="text-left">Bonus</th><th className="text-left">Employees</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.g} className="border-t"><td className="px-3 py-2"><GradeBadge grade={r.g} /></td><td>{r.bonus}</td><td>{r.count}</td></tr>)}</tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function WarningsTab({ results }: any) {
  const flagged = results.filter((r: any) => ["C", "D"].includes(r.grade) || r.grade_capped);
  if (!flagged.length) return <Card><CardContent className="p-6"><EmptyState label="No employees at risk this period" /></CardContent></Card>;
  return (
    <Card><CardContent className="p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2 text-left">Employee</th><th className="text-left">Score</th><th className="text-left">Grade</th><th className="text-left">Reason</th></tr></thead>
        <tbody>{flagged.map((r: any) => (
          <tr key={r.id} className="border-t"><td className="px-4 py-2 font-mono text-xs">{r.employee_id.slice(0, 8)}</td><td>{Number(r.total_score).toFixed(1)}</td><td><GradeBadge grade={r.grade} /></td><td className="text-xs">{r.grade_capped ? r.cap_reason : `Below threshold`}</td></tr>
        ))}</tbody>
      </table>
    </CardContent></Card>
  );
}

function PipTab({ pips }: any) {
  if (!pips.length) return <Card><CardContent className="p-6"><EmptyState label="No active PIPs" /></CardContent></Card>;
  return (
    <div className="space-y-2">{pips.map((p: any) => (
      <Card key={p.id}><CardContent className="p-4 flex items-center justify-between">
        <div><p className="font-medium text-sm font-mono">{p.employee_id.slice(0, 8)}</p><p className="text-xs text-muted-foreground">{p.start_date} → {p.end_date} · triggered at grade {p.triggering_grade ?? "—"}</p></div>
        <Badge variant="outline">{p.status}</Badge>
      </CardContent></Card>
    ))}</div>
  );
}

function PromotionTab() {
  return <Card><CardContent className="p-6"><EmptyState label="Promotion eligibility requires 3+ months of scoring history. Continue scoring to populate." /></CardContent></Card>;
}

function ViolationsTab({ violations }: any) {
  if (!violations.length) return <Card><CardContent className="p-6"><EmptyState label="No critical violations logged" /></CardContent></Card>;
  return (
    <Card><CardContent className="p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2 text-left">Date</th><th className="text-left">Employee</th><th className="text-left">Type</th><th className="text-left">Severity</th><th className="text-left">Description</th></tr></thead>
        <tbody>{violations.map((v: any) => (
          <tr key={v.id} className="border-t"><td className="px-4 py-2 text-xs">{new Date(v.reported_at).toLocaleDateString()}</td><td className="font-mono text-xs">{v.employee_id.slice(0, 8)}</td><td>{v.violation_type}</td><td><Badge variant={v.severity === "critical" ? "destructive" : "outline"}>{v.severity}</Badge></td><td className="text-xs">{v.description}</td></tr>
        ))}</tbody>
      </table>
    </CardContent></Card>
  );
}

function LeaderboardTab({ top }: any) {
  if (!top.length) return <Card><CardContent className="p-6"><EmptyState label="Leaderboard appears once scoring is run" /></CardContent></Card>;
  return (
    <Card><CardContent className="p-0">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2 text-left">Rank</th><th className="text-left">Employee</th><th className="text-left">Score</th><th className="text-left">Grade</th></tr></thead>
        <tbody>{top.map((r: any, i: number) => (
          <tr key={r.id} className="border-t"><td className="px-4 py-2 font-bold text-warning">#{i + 1}</td><td className="font-mono text-xs">{r.employee_id.slice(0, 8)}</td><td>{Number(r.total_score).toFixed(1)}</td><td><GradeBadge grade={r.grade} /></td></tr>
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
    <Card><CardHeader className="flex flex-row items-center justify-between">
      <CardTitle className="text-sm">Scorecard Templates</CardTitle>
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="w-72 text-foreground"><SelectValue placeholder="Select template" /></SelectTrigger>
        <SelectContent>{templates.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.department.toUpperCase()} — {t.name}</SelectItem>)}</SelectContent>
      </Select>
    </CardHeader>
      <CardContent>
        <div className="text-xs text-muted-foreground mb-2">Total weight: <span className={total === 100 ? "text-success" : "text-destructive"}>{total}%</span> (templates are weight-locked; only Super Admin can edit)</div>
        {tplKpis.length === 0 ? <EmptyState label="Select a template" /> : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-left">Category</th><th className="text-left">KPI</th><th className="text-left">Weight</th><th className="text-left">Source</th></tr></thead>
            <tbody>{tplKpis.map((k: any) => (
              <tr key={k.id} className="border-t"><td className="px-3 py-2 capitalize">{k.category}</td><td>{k.name}</td><td>{k.weight}%</td><td><Badge variant="outline">{k.data_source}</Badge></td></tr>
            ))}</tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
