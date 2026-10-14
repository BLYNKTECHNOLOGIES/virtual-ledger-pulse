import { useEffect, useMemo, useState } from "react";
import { Download, Library, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { useLmsAssetsIndex, useLmsChecklistIndex, useLmsModuleKras, useLmsModules } from "@/hooks/lms/useLmsData";
import { useLmsNav } from "@/hooks/lms/useLmsNav";
import { LMS_DEPARTMENTS, MODULE_STATUS_LABEL, MODULE_TYPE_LABEL, PRODUCTION_STEPS, departmentName } from "@/lib/lms/constants";
import { downloadText, minutesLabel, toCsv, todayIso } from "@/lib/lms/format";
import type { LmsModuleStatus, LmsModuleType } from "@/lib/lms/types";
import { ErrorBlock, LoadingBlock, ModuleStatusBadge, ProgressLine } from "./LmsShared";

const PAGE = 50;

export function LmsLibrary() {
  const { go, params } = useLmsNav();
  const modulesQ = useLmsModules();
  const linksQ = useLmsModuleKras();
  const assetsQ = useLmsAssetsIndex();
  const checklistQ = useLmsChecklistIndex();
  const [q, setQ] = useState("");
  const [dept, setDept] = useState<string>(params.get("dept") ?? "all");
  const [type, setType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [q, dept, type, status]);

  const kraCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of linksQ.data ?? []) m.set(l.module_id, (m.get(l.module_id) ?? 0) + 1);
    return m;
  }, [linksQ.data]);
  const files = useMemo(() => {
    const m = new Map<string, { en: number; hi: number }>();
    for (const a of assetsQ.data ?? []) {
      const c = m.get(a.module_id) ?? { en: 0, hi: 0 };
      if (a.language === "en" || a.language === "both") c.en++;
      if (a.language === "hinglish" || a.language === "both") c.hi++;
      m.set(a.module_id, c);
    }
    return m;
  }, [assetsQ.data]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (modulesQ.data ?? []).filter((m) => {
      if (!m.is_active && status !== "inactive") return false;
      if (status === "inactive" && m.is_active) return false;
      if (dept === "company" && m.department_code) return false;
      if (dept !== "all" && dept !== "company" && m.department_code !== dept) return false;
      if (type !== "all" && m.module_type !== type) return false;
      if (status !== "all" && status !== "inactive" && m.status !== status) return false;
      if (!needle) return true;
      return `${m.code} ${m.title} ${m.owner_name ?? ""}`.toLowerCase().includes(needle);
    });
  }, [modulesQ.data, q, dept, type, status]);

  const stats = useMemo(() => {
    const active = (modulesQ.data ?? []).filter((m) => m.is_active);
    const by = (s: LmsModuleStatus) => active.filter((m) => m.status === s).length;
    return { total: active.length, approved: by("approved"), review: by("in_review"), drafting: by("drafting"), notStarted: by("not_started") };
  }, [modulesQ.data]);

  const exportCsv = () => {
    const out: (string | number | null)[][] = [[
      "Code", "Title", "Type", "Department", "Sub-department", "Platform", "KRAs", "Minutes", "Status", "Version", "Owner",
      "English files", "Hinglish files", "Has checklist", ...PRODUCTION_STEPS.map((s) => s.label), "Quiz tag",
    ]];
    for (const m of rows) {
      const f = files.get(m.id);
      out.push([
        m.code, m.title, MODULE_TYPE_LABEL[m.module_type], m.department_code ? departmentName(m.department_code) : "Company-wide",
        m.subdepartment_code ?? "", m.platform ?? "", kraCount.get(m.id) ?? 0, m.duration_minutes, MODULE_STATUS_LABEL[m.status],
        m.version, m.owner_name ?? "", f?.en ?? 0, f?.hi ?? 0, checklistQ.data?.has(m.id) ? "Yes" : "No",
        ...PRODUCTION_STEPS.map((s) => (m.production?.[s.key] ? "Yes" : "No")), m.quiz_tag ?? "",
      ]);
    }
    downloadText(`lms-module-library-${todayIso()}.csv`, toCsv(out));
  };

  if (modulesQ.error && !modulesQ.data) return <ErrorBlock error={modulesQ.error} onRetry={() => modulesQ.refetch()} />;
  if (modulesQ.isLoading) return <LoadingBlock rows={8} />;

  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">{stats.total} modules</Badge>
        <Badge variant="success">{stats.approved} approved</Badge>
        <Badge variant="warning">{stats.review} in review</Badge>
        <Badge variant="info">{stats.drafting} drafting</Badge>
        <Badge variant="muted">{stats.notStarted} not started</Badge>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_200px_190px_160px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, title or owner" className="pl-8" aria-label="Search modules" />
        </div>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger aria-label="Department"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            <SelectItem value="company">Company-wide</SelectItem>
            {LMS_DEPARTMENTS.map((d) => <SelectItem key={d.code} value={d.code}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger aria-label="Module type"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All module types</SelectItem>
            {(Object.keys(MODULE_TYPE_LABEL) as LmsModuleType[]).map((t) => <SelectItem key={t} value={t}>{MODULE_TYPE_LABEL[t]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {(Object.keys(MODULE_STATUS_LABEL) as LmsModuleStatus[]).map((s) => <SelectItem key={s} value={s}>{MODULE_STATUS_LABEL[s]}</SelectItem>)}
            <SelectItem value="inactive">Removed from catalogue</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCsv} disabled={!rows.length}><Download className="mr-1.5 h-4 w-4" /> CSV</Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Library}
            title={(modulesQ.data ?? []).length ? "No module matches these filters" : "The library is empty"}
            description={(modulesQ.data ?? []).length ? undefined : "Import the KRA catalogue in LMS Settings to create a library entry for every module."}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                <TableHead className="hidden lg:table-cell">Department</TableHead>
                <TableHead className="hidden md:table-cell">KRAs</TableHead>
                <TableHead className="hidden md:table-cell">Time</TableHead>
                <TableHead className="hidden sm:table-cell">Files</TableHead>
                <TableHead className="hidden xl:table-cell">Production</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((m) => {
                const f = files.get(m.id);
                const steps = PRODUCTION_STEPS.filter((s) => m.production?.[s.key]).length;
                return (
                  <TableRow key={m.id} className="cursor-pointer" onClick={() => go("library", { module: m.id })}>
                    <TableCell>
                      <p className="text-sm"><span className="t-mono mr-1.5 text-xs text-muted-foreground">{m.code}</span>{m.title}</p>
                      <p className="t-secondary">{MODULE_TYPE_LABEL[m.module_type]}{m.platform ? ` · ${m.platform}` : ""} · v{m.version}</p>
                    </TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">{m.department_code ? departmentName(m.department_code) : "Company-wide"}</TableCell>
                    <TableCell className="hidden text-sm md:table-cell">{kraCount.get(m.id) ?? 0}</TableCell>
                    <TableCell className="hidden whitespace-nowrap text-sm md:table-cell">{minutesLabel(m.duration_minutes)}</TableCell>
                    <TableCell className="hidden text-xs sm:table-cell">
                      {f ? <span>EN {f.en} · HI {f.hi}</span> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="hidden min-w-[120px] xl:table-cell"><ProgressLine done={steps} total={PRODUCTION_STEPS.length} /></TableCell>
                    <TableCell><ModuleStatusBadge status={m.status} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {pages > 1 ? (
            <div className="flex items-center justify-between border-t border-border px-4 py-2 text-sm">
              <span className="text-muted-foreground">{page * PAGE + 1}–{Math.min(rows.length, (page + 1) * PAGE)} of {rows.length}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
