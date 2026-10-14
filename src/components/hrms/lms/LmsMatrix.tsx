import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle, Download, Grid3x3, RefreshCw, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  indexBy, useLmsAccess, useLmsCertifications, useLmsEmployees, useLmsInvalidate, useLmsKras, useLmsModuleKras, useLmsModules,
  useLmsPlanKrasAll, useLmsPlans, useLmsSeats,
} from "@/hooks/lms/useLmsData";
import { useLmsNav } from "@/hooks/lms/useLmsNav";
import { renewCertification, setCertificationStatus } from "@/lib/lms/actions";
import { currentVersionsForKra, linkedModulesByKra } from "@/lib/lms/versions";
import { CERT_STATUS_LABEL, LMS_DEPARTMENTS } from "@/lib/lms/constants";
import { downloadText, fmtDate, toCsv, todayIso } from "@/lib/lms/format";
import type { LmsCertification } from "@/lib/lms/types";
import { cn } from "@/lib/utils";
import { ErrorBlock, LoadingBlock, errorText } from "./LmsShared";

type CellState = "certified" | "refresher_due" | "revoked" | "in_training" | "not_cleared";
type Cell = { state: CellState; cert?: LmsCertification };

const CELL_LABEL: Record<CellState, string> = {
  certified: "Certified", refresher_due: "Refresher due", revoked: "Revoked", in_training: "In training", not_cleared: "Not cleared",
};

function CellIcon({ state }: { state: CellState }) {
  const label = CELL_LABEL[state];
  if (state === "certified") return <CheckCircle2 className="h-4 w-4 text-success" aria-label={label} />;
  if (state === "refresher_due") return <RefreshCw className="h-4 w-4 text-warning" aria-label={label} />;
  if (state === "in_training") return <Circle className="h-4 w-4 text-info" aria-label={label} />;
  if (state === "not_cleared") return <XCircle className="h-4 w-4 text-destructive" aria-label={label} />;
  return <XCircle className="h-4 w-4 text-muted-foreground" aria-label={label} />;
}

export function LmsMatrix() {
  const { params } = useLmsNav();
  const { canManage } = useLmsAccess();
  const invalidate = useLmsInvalidate();
  const certsQ = useLmsCertifications();
  const planKrasQ = useLmsPlanKrasAll();
  const plansQ = useLmsPlans();
  const krasQ = useLmsKras();
  const peopleQ = useLmsEmployees();
  const seatsQ = useLmsSeats();
  const modulesQ = useLmsModules();
  const linksQ = useLmsModuleKras();
  const [dept, setDept] = useState("all");
  const [seatId, setSeatId] = useState("all");
  const [status, setStatus] = useState<string>(params.get("status") ?? "all");
  const [q, setQ] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);

  const kraMap = useMemo(() => new Map((krasQ.data ?? []).map((k) => [k.code, k])), [krasQ.data]);
  const people = useMemo(() => indexBy(peopleQ.data, "id"), [peopleQ.data]);

  /** employee → KRA → state; certificates win over plan status, open plans over closed ones. */
  const cells = useMemo(() => {
    const out = new Map<string, Map<string, Cell>>();
    const put = (emp: string, kra: string, cell: Cell) => {
      if (!out.has(emp)) out.set(emp, new Map());
      out.get(emp)!.set(kra, cell);
    };
    const planById = indexBy(plansQ.data, "id");
    for (const pk of planKrasQ.data ?? []) {
      const plan = planById.get(pk.plan_id);
      if (!plan || plan.status === "cancelled" || pk.status === "certified") continue;
      const prev = out.get(plan.employee_id)?.get(pk.kra_code);
      const state: CellState = pk.status === "not_cleared" ? "not_cleared" : plan.status === "active" || plan.status === "draft" ? "in_training" : "not_cleared";
      if (!prev || (prev.state === "not_cleared" && state === "in_training")) put(plan.employee_id, pk.kra_code, { state });
    }
    for (const c of certsQ.data ?? []) put(c.employee_id, c.kra_code, { state: c.status as CellState, cert: c });
    return out;
  }, [certsQ.data, planKrasQ.data, plansQ.data]);

  const columns = useMemo(() => {
    let codes: string[];
    if (seatId !== "all") codes = (seatsQ.data ?? []).find((s) => s.id === seatId)?.kra_codes ?? [];
    else {
      const set = new Set<string>();
      cells.forEach((m) => m.forEach((_, k) => set.add(k)));
      codes = Array.from(set);
    }
    return codes
      .filter((c) => dept === "all" || kraMap.get(c)?.department_code === dept)
      .sort((a, b) => (kraMap.get(a)?.sort_order ?? 0) - (kraMap.get(b)?.sort_order ?? 0) || a.localeCompare(b));
  }, [cells, seatId, seatsQ.data, dept, kraMap]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return Array.from(cells.keys())
      .map((id) => ({ id, person: people.get(id) }))
      .filter(({ person }) => includeInactive || person?.is_active !== false)
      .filter(({ person }) => !needle || `${person?.full_name ?? ""} ${person?.badge_id ?? ""} ${person?.position_title ?? ""}`.toLowerCase().includes(needle))
      .filter(({ id }) => status === "all" || columns.some((c) => cells.get(id)?.get(c)?.state === status))
      .filter(({ id }) => columns.some((c) => cells.get(id)?.has(c)))
      .sort((a, b) => (a.person?.full_name ?? "").localeCompare(b.person?.full_name ?? ""));
  }, [cells, people, q, status, columns, includeInactive]);

  const exportCsv = () => {
    const out: (string | number | null)[][] = [["Employee", "Badge", "Position", "KRA", "KRA name", "Department", "Status", "Certified on", "Module versions", "Remarks"]];
    for (const r of rows) {
      for (const c of columns) {
        const cell = cells.get(r.id)?.get(c);
        if (!cell) continue;
        const k = kraMap.get(c);
        out.push([
          r.person?.full_name ?? "", r.person?.badge_id ?? "", r.person?.position_title ?? "", c, k?.name ?? "", k?.department_name ?? "",
          CELL_LABEL[cell.state], cell.cert ? fmtDate(cell.cert.certified_at, "yyyy-MM-dd") : "",
          cell.cert ? Object.entries(cell.cert.module_versions ?? {}).map(([m, v]) => `${m} v${v}`).join("; ") : "", cell.cert?.remarks ?? "",
        ]);
      }
    }
    downloadText(`lms-training-matrix-${todayIso()}.csv`, toCsv(out));
  };

  const linked = useMemo(() => linkedModulesByKra(linksQ.data), [linksQ.data]);
  const setCert = async (cert: LmsCertification, s: "certified" | "refresher_due" | "revoked") => {
    try {
      await setCertificationStatus(cert.id, s);
      toast.success(`Marked ${CERT_STATUS_LABEL[s].toLowerCase()}`);
      await invalidate();
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  /** Refresher done: renew the certificate today against the modules' current versions. */
  const renew = async (cert: LmsCertification) => {
    if (!modulesQ.data || !linksQ.data) return;
    try {
      await renewCertification(cert, currentVersionsForKra(kraMap.get(cert.kra_code), linked.get(cert.kra_code), modulesQ.data));
      toast.success("Certification renewed");
      await invalidate();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const err = certsQ.error || planKrasQ.error || plansQ.error;
  if (err && !certsQ.data) return <ErrorBlock error={err} onRetry={() => { certsQ.refetch(); planKrasQ.refetch(); plansQ.refetch(); }} />;
  if (certsQ.isLoading || planKrasQ.isLoading || plansQ.isLoading || krasQ.isLoading) return <LoadingBlock rows={6} />;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-[1fr_190px_200px_170px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="pl-8" aria-label="Search people" />
        </div>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger aria-label="Department"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {LMS_DEPARTMENTS.map((d) => <SelectItem key={d.code} value={d.code}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={seatId} onValueChange={setSeatId}>
          <SelectTrigger aria-label="Seat"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">KRAs with any record</SelectItem>
            {(seatsQ.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>Seat: {s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {(Object.keys(CELL_LABEL) as CellState[]).map((s) => <SelectItem key={s} value={s}>{CELL_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCsv} disabled={!rows.length}><Download className="mr-1.5 h-4 w-4" /> CSV</Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {(Object.keys(CELL_LABEL) as CellState[]).map((s) => <span key={s} className="flex items-center gap-1.5"><CellIcon state={s} /> {CELL_LABEL[s]}</span>)}
        <label className="ml-auto flex items-center gap-2"><Checkbox checked={includeInactive} onCheckedChange={(v) => setIncludeInactive(v === true)} /> Include people who left</label>
      </div>

      {rows.length === 0 || columns.length === 0 ? (
        <Card><EmptyState icon={Grid3x3} title="Nothing to show yet" description="People appear here once they have a training plan or a certification." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-20 min-w-[200px] border-b border-r border-border bg-muted px-3 py-2 text-left font-medium">Person</th>
                  {columns.map((c) => (
                    <th key={c} className="sticky top-0 z-10 border-b border-border bg-muted px-1 py-2 align-bottom font-normal" title={`${c} — ${kraMap.get(c)?.name ?? ""}`}>
                      <span className="t-mono mx-auto block max-h-40 whitespace-nowrap text-[11px] text-muted-foreground [transform:rotate(180deg)] [writing-mode:vertical-rl]">{c}</span>
                    </th>
                  ))}
                  <th className="sticky top-0 z-10 border-b border-l border-border bg-muted px-3 py-2 text-right font-medium">Certified</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ id, person }) => {
                  const row = cells.get(id);
                  const count = columns.filter((c) => row?.get(c)?.state === "certified").length;
                  return (
                    <tr key={id} className="hover:bg-muted/30">
                      <td className="sticky left-0 z-10 border-b border-r border-border bg-background px-3 py-1.5">
                        <p className="truncate">{person?.full_name ?? "Unknown"}{person && !person.is_active ? <span className="ml-1 text-xs text-muted-foreground">(left)</span> : null}</p>
                        <p className="t-secondary truncate">{person?.position_title ?? "—"}</p>
                      </td>
                      {columns.map((c) => {
                        const cell = row?.get(c);
                        const dim = status !== "all" && cell?.state !== status;
                        const icon = cell ? <CellIcon state={cell.state} /> : <span className="block h-1 w-1 rounded-full bg-muted-foreground/30" aria-hidden />;
                        return (
                          <td key={c} className={cn("border-b border-border px-1 py-1.5 text-center", dim && "opacity-30")}>
                            {cell?.cert && canManage ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button type="button" className="mx-auto flex h-7 w-7 items-center justify-center rounded hover:bg-muted" aria-label={`${c}: ${CELL_LABEL[cell.state]}`}>{icon}</button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  <DropdownMenuLabel className="text-xs font-normal">
                                    <span className="t-mono">{c}</span> · {CELL_LABEL[cell.state]} {fmtDate(cell.cert.certified_at)}
                                  </DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  {cell.state === "refresher_due" ? (
                                    <DropdownMenuItem disabled={!modulesQ.data || !linksQ.data} onClick={() => renew(cell.cert!)}>Refresher done: renew today</DropdownMenuItem>
                                  ) : null}
                                  {cell.state === "revoked" ? <DropdownMenuItem onClick={() => setCert(cell.cert!, "certified")}>Restore the certification</DropdownMenuItem> : null}
                                  {cell.state !== "refresher_due" ? <DropdownMenuItem onClick={() => setCert(cell.cert!, "refresher_due")}>Mark refresher due</DropdownMenuItem> : null}
                                  {cell.state !== "revoked" ? <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setCert(cell.cert!, "revoked")}>Revoke</DropdownMenuItem> : null}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <span className="mx-auto flex h-7 w-7 items-center justify-center" title={cell ? `${c}: ${CELL_LABEL[cell.state]}` : c}>{icon}</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="t-mono border-b border-l border-border px-3 py-1.5 text-right">{count}/{columns.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
