import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ResponsiveList } from "@/components/horilla/primitives/ResponsiveList";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { Inbox, Search, CalendarDays, Clock, RefreshCw, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { BankChangeApprovalPanel } from "@/components/hrms/BankChangeApprovalPanel";
import { LeaveApprovalPanel } from "@/components/hrms/LeaveApprovalPanel";
import { RegularizationApprovalPanel } from "@/components/hrms/RegularizationApprovalPanel";
import {
  REQUEST_SOURCES,
  STAGE_LABEL,
  fetchAllRequests,
  type RequestStage,
  type UnifiedRequest,
} from "@/lib/hrms/requestRegistry";

const STAGE_STYLE: Record<RequestStage, string> = {
  awaiting_manager: "bg-warning/10 text-warning border-warning/30",
  awaiting_hr: "bg-primary/10 text-primary border-primary/30",
  awaiting_payroll: "bg-warning/10 text-warning border-warning/30",
  approved: "bg-success/10 text-success border-success/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  other: "bg-muted text-muted-foreground border-border",
};

function StageBadge({ stage }: { stage: RequestStage }) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", STAGE_STYLE[stage])}>
      {STAGE_LABEL[stage]}
    </Badge>
  );
}

function TypeIcon({ type }: { type: string }) {
  const Icon = type === "leave" ? CalendarDays : type === "bank_change" ? Landmark : Clock;
  return <Icon className="h-4 w-4 text-muted-foreground shrink-0" />;
}

const RANGE_DAYS: Record<string, number | null> = { all: null, "7": 7, "30": 30, "90": 90 };

/**
 * Unified HRMS Requests inbox.
 * Reads every request source through the registry — the dedicated pages
 * (Leave Requests, Regularization Requests) stay the owners of approve/reject
 * actions and share the same underlying tables, so both views never diverge.
 */
export default function RequestsPage() {
  const [params, setParams] = useSearchParams();

  const [type, setType] = useState(params.get("type") || "all");
  const [stage, setStage] = useState<string>(params.get("stage") || "all");
  const [range, setRange] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UnifiedRequest | null>(null);

  const { data: requests = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["hrms_unified_requests"],
    queryFn: fetchAllRequests,
  });

  // Notification deep link: ?type=leave&id=<uuid> opens that request directly.
  const deepLinkId = params.get("id");
  useEffect(() => {
    if (!deepLinkId || requests.length === 0) return;
    const hit = requests.find((r) => r.id === deepLinkId);
    if (hit) {
      setSelected(hit);
      setStage("all");
    }
  }, [deepLinkId, requests]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const days = RANGE_DAYS[range];
    const cutoff = days ? Date.now() - days * 86_400_000 : null;

    return requests.filter((r) => {
      if (type !== "all" && r.type !== type) return false;
      if (stage !== "all" && r.stage !== stage) return false;
      if (cutoff && new Date(r.createdAt).getTime() < cutoff) return false;
      if (q) {
        const hay = `${r.employeeName} ${r.badgeId || ""} ${r.subject} ${r.detail || ""} ${r.typeLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [requests, type, stage, range, search]);

  const counts = useMemo(() => {
    const pending = requests.filter(
      (r) => r.stage === "awaiting_hr" || r.stage === "awaiting_manager" || r.stage === "awaiting_payroll",
    ).length;
    return { total: requests.length, pending };
  }, [requests]);

  const setTypeFilter = (v: string) => {
    setType(v);
    const next = new URLSearchParams(params);
    if (v === "all") next.delete("type");
    else next.set("type", v);
    setParams(next, { replace: true });
  };

  const openDetail = (r: UnifiedRequest) => setSelected(r);

  return (
    <div className="hrms-page space-y-4 p-3 md:p-6 page-mount">
      <PageHeader
        title="Requests"
        description="Every request that reaches HRMS — leave, attendance regularization and future request types — newest first."
        actions={
          <Button variant="outline" className="h-9" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} /> Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total requests</p>
            <p className="text-xl font-semibold tabular-nums">{counts.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Awaiting action</p>
            <p className="text-xl font-semibold tabular-nums text-primary">{counts.pending}</p>
          </CardContent>
        </Card>
      </div>

      <div className="hrms-toolbar">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search employee, subject, reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Select value={type} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All request types</SelectItem>
            {REQUEST_SOURCES.map((s) => (
              <SelectItem key={s.type} value={s.type}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="h-9 sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(STAGE_LABEL) as RequestStage[]).map((s) => (
              <SelectItem key={s} value={s}>{STAGE_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="h-9 sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ResponsiveList
        items={filtered}
        isLoading={isLoading}
        keyFor={(r: UnifiedRequest) => r.key}
        tableMinWidth="min-w-[900px]"
        columns={["Type", "Employee", "Subject", "Period", "Status", "Submitted", ""].map((h) => ({ key: h, label: h }))}
        emptyState={
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={Inbox}
                title="No requests found"
                description="Try widening the filters — new leave and regularization requests land here automatically."
              />
            </CardContent>
          </Card>
        }
        renderRow={(r: UnifiedRequest) => (
          <>
            <td className="px-4 py-3">
              <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm">
                <TypeIcon type={r.type} /> {r.typeLabel}
              </span>
            </td>
            <td className="px-4 py-3 whitespace-nowrap">
              <span className="font-medium">{r.employeeName}</span>
              {r.badgeId && <span className="ml-2 text-xs text-muted-foreground font-mono">{r.badgeId}</span>}
            </td>
            <td className="px-4 py-3 max-w-[280px] truncate">{r.subject}</td>
            <td className="px-4 py-3 tabular-nums whitespace-nowrap text-sm">
              {r.periodFrom === r.periodTo ? r.periodFrom || "—" : `${r.periodFrom} → ${r.periodTo}`}
            </td>
            <td className="px-4 py-3"><StageBadge stage={r.stage} /></td>
            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
              {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
            </td>
            <td className="px-4 py-3">
              <Button size="sm" variant="ghost" className="h-8" onClick={() => openDetail(r)}>Open</Button>
            </td>
          </>
        )}
        renderCard={(r: UnifiedRequest) => (
          <Card
            className={cn("cursor-pointer", deepLinkId === r.id && "ring-2 ring-primary")}
            onClick={() => openDetail(r)}
          >
            <CardContent className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <TypeIcon type={r.type} /> {r.typeLabel}
                </span>
                <StageBadge stage={r.stage} />
              </div>
              <div>
                <p className="font-medium text-sm">{r.employeeName}</p>
                <p className="text-xs text-muted-foreground">{r.subject}</p>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
              </p>
            </CardContent>
          </Card>
        )}
      />

      <ResponsiveDialog
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        title={selected ? `${selected.typeLabel} request` : ""}
        description={selected ? `${selected.employeeName}${selected.badgeId ? ` · ${selected.badgeId}` : ""}` : undefined}
        contentClassName="max-w-lg"
        footer={
          selected ? <Button variant="outline" onClick={() => setSelected(null)}>Close</Button> : null
        }

      >
        {selected && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <StageBadge stage={selected.stage} />
              <span className="text-xs text-muted-foreground font-mono">{selected.rawStatus}</span>
            </div>
            <Row label="Subject" value={selected.subject} />
            {selected.type !== "bank_change" && (
              <Row
                label="Period"
                value={selected.periodFrom === selected.periodTo ? selected.periodFrom || "—" : `${selected.periodFrom} → ${selected.periodTo}`}
              />
            )}
            <Row label="Reason" value={selected.detail || "—"} />
            <Row label="Submitted" value={format(new Date(selected.createdAt), "dd MMM yyyy, HH:mm")} />
            {selected.updatedAt && (
              <Row label="Last updated" value={format(new Date(selected.updatedAt), "dd MMM yyyy, HH:mm")} />
            )}
            {selected.raw?.manager_remarks && <Row label="Manager remarks" value={selected.raw.manager_remarks} />}
            {selected.raw?.approver_notes && <Row label="Approver notes" value={selected.raw.approver_notes} />}
            {selected.raw?.rejection_reason && <Row label="Rejection reason" value={selected.raw.rejection_reason} />}
            {selected.type === "bank_change" ? (
              <div className="pt-2 border-t border-border">
                <BankChangeApprovalPanel request={selected.raw} />
              </div>
            ) : selected.type === "leave" ? (
              <div className="pt-2 border-t border-border">
                <LeaveApprovalPanel request={selected.raw} onDone={() => setSelected(null)} />
              </div>
            ) : selected.type === "regularization" ? (
              <div className="pt-2 border-t border-border">
                <RegularizationApprovalPanel request={selected.raw} onDone={() => setSelected(null)} />
              </div>
            ) : null}
          </div>
        )}

      </ResponsiveDialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="col-span-2 break-words">{value}</span>
    </div>
  );
}
