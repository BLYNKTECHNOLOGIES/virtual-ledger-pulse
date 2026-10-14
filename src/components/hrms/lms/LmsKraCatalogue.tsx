import { useEffect, useMemo, useState } from "react";
import { BookOpen, ExternalLink, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  indexBy, useLmsCertifications, useLmsEmployees, useLmsKras, useLmsModuleKras, useLmsModules, useLmsSettings,
} from "@/hooks/lms/useLmsData";
import { useLmsNav } from "@/hooks/lms/useLmsNav";
import { LMS_DEPARTMENTS } from "@/lib/lms/constants";
import { fmtDate, isHttpUrl } from "@/lib/lms/format";
import type { LmsCertification, LmsKra } from "@/lib/lms/types";
import { CertStatusBadge, ErrorBlock, LoadingBlock, ModuleStatusBadge } from "./LmsShared";
import { employeeLabel, kraStatusLabel } from "./LmsPickers";

const PAGE = 60;

export function LmsKraCatalogue() {
  const { go } = useLmsNav();
  const krasQ = useLmsKras();
  const modulesQ = useLmsModules();
  const linksQ = useLmsModuleKras();
  const certsQ = useLmsCertifications();
  const peopleQ = useLmsEmployees();
  const settingsQ = useLmsSettings();
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("all");
  const [sub, setSub] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<LmsKra | null>(null);

  useEffect(() => setPage(0), [q, dept, sub, status]);
  useEffect(() => setSub("all"), [dept]);

  const modules = useMemo(() => indexBy(modulesQ.data, "id"), [modulesQ.data]);
  const people = useMemo(() => indexBy(peopleQ.data, "id"), [peopleQ.data]);
  const skillModule = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of linksQ.data ?? []) if (!m.has(l.kra_code)) m.set(l.kra_code, l.module_id);
    return m;
  }, [linksQ.data]);
  const certsByKra = useMemo(() => {
    const m = new Map<string, LmsCertification[]>();
    for (const c of certsQ.data ?? []) m.set(c.kra_code, [...(m.get(c.kra_code) ?? []), c]);
    return m;
  }, [certsQ.data]);

  const subs = useMemo(() => {
    const out = new Map<string, string>();
    for (const k of krasQ.data ?? []) if (dept === "all" || k.department_code === dept) out.set(k.subdepartment_code, k.subdepartment_name);
    return Array.from(out.entries());
  }, [krasQ.data, dept]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (krasQ.data ?? []).filter((k) => {
      if (status === "inactive" ? k.is_active : !k.is_active) return false;
      if (dept !== "all" && k.department_code !== dept) return false;
      if (sub !== "all" && k.subdepartment_code !== sub) return false;
      if (status !== "all" && status !== "inactive" && k.catalogue_status !== status) return false;
      if (!needle) return true;
      return `${k.code} ${k.name} ${k.layer_name} ${k.description ?? ""}`.toLowerCase().includes(needle);
    });
  }, [krasQ.data, q, dept, sub, status]);

  if (krasQ.error && !krasQ.data) return <ErrorBlock error={krasQ.error} onRetry={() => krasQ.refetch()} />;
  if (krasQ.isLoading) return <LoadingBlock rows={8} />;
  if (!(krasQ.data ?? []).length) {
    return (
      <Card>
        <EmptyState icon={BookOpen} title="The KRA catalogue isn't imported yet" description="Import the catalogue file in LMS Settings." action={<Button size="sm" onClick={() => go("settings")}>LMS Settings</Button>} />
      </Card>
    );
  }

  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const openModule = open ? modules.get(skillModule.get(open.code) ?? "") : null;
  const openCerts = open ? certsByKra.get(open.code) ?? [] : [];

  return (
    <div className="space-y-4">
      <p className="t-secondary">
        Catalogue {settingsQ.data?.catalogue_version ?? "—"}{settingsQ.data?.catalogue_imported_at ? `, imported ${fmtDate(settingsQ.data.catalogue_imported_at)}` : ""} · {(krasQ.data ?? []).filter((k) => k.is_active).length} KRAs
      </p>
      <div className="grid gap-2 md:grid-cols-[1fr_200px_220px_170px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, name or description" className="pl-8" aria-label="Search KRAs" />
        </div>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger aria-label="Department"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {LMS_DEPARTMENTS.map((d) => <SelectItem key={d.code} value={d.code}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sub} onValueChange={setSub}>
          <SelectTrigger aria-label="Sub-department"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sub-departments</SelectItem>
            {subs.map(([code, name]) => <SelectItem key={code} value={code}>{code} · {name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Catalogue status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {(["live", "partial", "notlive", "planned", "future"] as const).map((s) => <SelectItem key={s} value={s}>{kraStatusLabel(s)}</SelectItem>)}
            <SelectItem value="inactive">Removed from catalogue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <Card><EmptyState icon={Search} title="No KRA matches these filters" /></Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>KRA</TableHead>
                <TableHead className="hidden lg:table-cell">Layer</TableHead>
                <TableHead className="hidden md:table-cell">Module</TableHead>
                <TableHead className="hidden sm:table-cell">Certified</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((k) => {
                const mod = modules.get(skillModule.get(k.code) ?? "");
                const certs = (certsByKra.get(k.code) ?? []).filter((c) => c.status !== "revoked");
                return (
                  <TableRow key={k.code} className="cursor-pointer" onClick={() => setOpen(k)}>
                    <TableCell>
                      <p className="text-sm"><span className="t-mono mr-1.5 text-xs text-muted-foreground">{k.code}</span>{k.name}</p>
                      {k.platform ? <Badge variant="outline" className="mt-0.5 text-[10px]">{k.platform}</Badge> : null}
                    </TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">{k.layer_name}</TableCell>
                    <TableCell className="hidden text-sm md:table-cell">{mod ? <span className="t-mono text-xs">{mod.code}</span> : "—"}</TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">{certs.length || "—"}</TableCell>
                    <TableCell>{k.catalogue_status === "live" ? <Badge variant="success">Live</Badge> : <Badge variant="muted">{kraStatusLabel(k.catalogue_status)}</Badge>}</TableCell>
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

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {open ? (
            <>
              <SheetHeader>
                <SheetTitle>{open.name}</SheetTitle>
                <SheetDescription><span className="t-mono">{open.code}</span> · {open.subdepartment_name} · {open.layer_name}</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div className="flex flex-wrap gap-1.5">
                  {open.platform ? <Badge variant="outline">{open.platform}</Badge> : null}
                  <Badge variant={open.catalogue_status === "live" ? "success" : "muted"}>{kraStatusLabel(open.catalogue_status)}</Badge>
                </div>
                {open.description ? <p className="leading-relaxed">{open.description}</p> : <p className="text-muted-foreground">No description.</p>}
                {open.description_url && isHttpUrl(open.description_url) ? (
                  <Button size="sm" variant="outline" onClick={() => window.open(open.description_url as string, "_blank", "noopener,noreferrer")}>
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Full description
                  </Button>
                ) : null}
                <div>
                  <p className="t-label mb-1">Training module</p>
                  {openModule ? (
                    <button type="button" className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left hover:bg-muted/40" onClick={() => go("library", { module: openModule.id })}>
                      <span className="min-w-0"><span className="t-mono mr-1.5 text-xs text-muted-foreground">{openModule.code}</span>{openModule.title}</span>
                      <ModuleStatusBadge status={openModule.status} />
                    </button>
                  ) : <p className="text-muted-foreground">No module linked.</p>}
                </div>
                <div>
                  <p className="t-label mb-1">Certified people ({openCerts.length})</p>
                  {openCerts.length === 0 ? <p className="text-muted-foreground">Nobody yet.</p> : (
                    <ul className="divide-y divide-border rounded-md border border-border">
                      {openCerts.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                          <span className="min-w-0 truncate">{employeeLabel(people.get(c.employee_id))}</span>
                          <span className="flex shrink-0 items-center gap-2"><span className="text-xs text-muted-foreground">{fmtDate(c.certified_at)}</span><CertStatusBadge status={c.status} /></span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
