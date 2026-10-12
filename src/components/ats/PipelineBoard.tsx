import { UnreadMailMark } from "./UnreadMailMark";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { MoreHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { atsKeys, useAtsSettings, useAtsStages, type AtsStage } from "@/lib/ats/api";
import { atsErrorMessage } from "@/lib/ats/errors";
import { fmtDate } from "@/lib/ats/format";
import { candKeys, candidateHref, saveNavCtx, useBoardRows, type AtsAppRow } from "@/lib/ats/candidates";
import { QueryError, RowsSkeleton } from "./AtsBits";
import { ResumeIcon, Stars, UnreviewedDot, isUnreviewed } from "./CandidateBits";

type Pending = { row: AtsAppRow; stage: AtsStage } | null;

export function PipelineBoard({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [showHired, setShowHired] = useState(false);
  const board = useBoardRows(jobId, showHired);
  const stagesQ = useAtsStages();
  const settings = useAtsSettings();
  const idleDays = settings.data?.idle_alert_days ?? 7;
  const [override, setOverride] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<Pending>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [mobileStage, setMobileStage] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }),
  );

  const stages = useMemo(() => (stagesQ.data ?? []).filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order), [stagesQ.data]);
  const rows = board.data?.rows ?? [];
  const columns = useMemo(() => {
    const map = new Map<string, AtsAppRow[]>(stages.map((s) => [s.id, []]));
    for (const r of rows) {
      const sid = override[r.application_id!] ?? r.stage_id!;
      map.get(sid)?.push(r);
    }
    return map;
  }, [rows, stages, override]);
  const ordered = useMemo(() => stages.flatMap((s) => columns.get(s.id) ?? []), [stages, columns]);

  const open = (r: AtsAppRow) => {
    saveNavCtx({ items: ordered.map((x) => ({ candidateId: x.candidate_id!, appId: x.application_id! })), from: `${window.location.pathname}${window.location.search}` });
    navigate(candidateHref(r), { state: { fromList: true } });
  };

  const doMove = async (r: AtsAppRow, stage: AtsStage) => {
    const id = r.application_id!;
    if (busy.has(id)) return;
    setOverride((o) => ({ ...o, [id]: stage.id }));
    setBusy((b) => new Set(b).add(id));
    const { error } = await supabase.rpc("ats_move_stage", { p_application_id: id, p_stage_id: stage.id, p_note: null });
    setBusy((b) => { const n = new Set(b); n.delete(id); return n; });
    if (error) {
      setOverride((o) => { const n = { ...o }; delete n[id]; return n; });
      toast.error(atsErrorMessage(error));
      return;
    }
    toast.success(`${r.full_name} moved to ${stage.name}`);
    await qc.invalidateQueries({ queryKey: candKeys.all });
    qc.invalidateQueries({ queryKey: atsKeys.jobSummary });
    qc.invalidateQueries({ queryKey: atsKeys.overview });
    setOverride((o) => { const n = { ...o }; delete n[id]; return n; });
  };

  const requestMove = (r: AtsAppRow, stageId: string) => {
    const cur = override[r.application_id!] ?? r.stage_id;
    if (cur === stageId) return;
    const stage = stages.find((s) => s.id === stageId);
    if (!stage) return;
    if (stage.kind === "hired" || stage.code === "hired") setConfirm({ row: r, stage });
    else doMove(r, stage);
  };

  const onDragStart = (e: DragStartEvent) => setDragId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setDragId(null);
    if (!e.over) return;
    const r = rows.find((x) => x.application_id === e.active.id);
    if (r) requestMove(r, String(e.over.id));
  };

  if (board.isLoading || stagesQ.isLoading) return <RowsSkeleton rows={6} />;
  if (board.isError) return <QueryError error={board.error} onRetry={() => board.refetch()} />;

  const total = board.data?.total ?? 0;
  const rejectedN = board.data?.rejected ?? 0;
  const withdrawnN = board.data?.withdrawn ?? 0;
  const dragRow = dragId ? rows.find((r) => r.application_id === dragId) : null;
  const visibleStages = isMobile ? stages.filter((s) => s.id === (mobileStage ?? stages[0]?.id)) : stages;

  const card = (r: AtsAppRow) => (
    <BoardCard key={r.application_id} row={r} idleDays={idleDays} stages={stages} busy={busy.has(r.application_id!)}
      currentStage={override[r.application_id!] ?? r.stage_id!} onOpen={() => open(r)} onMove={(sid) => requestMove(r, sid)} />
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Switch checked={showHired} onCheckedChange={setShowHired} /> <Label className="font-normal">Show hired</Label>
        </label>
        {total > 500 && <p className="text-xs text-warning">Showing 500 of {total}. Use the table for the rest.</p>}
      </div>
      {isMobile && (
        <Tabs value={mobileStage ?? stages[0]?.id} onValueChange={setMobileStage}>
          <TabsList className="w-full justify-start overflow-x-auto">
            {stages.map((s) => <TabsTrigger key={s.id} value={s.id} className="shrink-0">{s.name} ({columns.get(s.id)?.length ?? 0})</TabsTrigger>)}
          </TabsList>
        </Tabs>
      )}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
        <div className={cn(isMobile ? "" : "flex gap-3 overflow-x-auto pb-2")}>
          {visibleStages.map((s) => (
            <Column key={s.id} stage={s} count={columns.get(s.id)?.length ?? 0} wide={isMobile}>
              {(columns.get(s.id) ?? []).map(card)}
            </Column>
          ))}
        </div>
        <DragOverlay>{dragRow ? <div className="w-64 rotate-1 opacity-90"><CardBody row={dragRow} idleDays={idleDays} /></div> : null}</DragOverlay>
      </DndContext>
      {(rejectedN > 0 || withdrawnN > 0) && (
        <p className="text-xs text-muted-foreground">
          {rejectedN > 0 && <Link className="text-primary hover:underline" to={`/hrms/ats/candidates?job=${jobId}&status=rejected`}>Rejected ({rejectedN})</Link>}
          {rejectedN > 0 && withdrawnN > 0 && " "}
          {withdrawnN > 0 && <Link className="text-primary hover:underline" to={`/hrms/ats/candidates?job=${jobId}&status=withdrawn`}>Withdrawn ({withdrawnN})</Link>}
          {" · not shown on the board."}
        </p>
      )}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {confirm?.row.full_name} as hired?</AlertDialogTitle>
            <AlertDialogDescription>The application moves to {confirm?.stage.name} and is marked hired.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const c = confirm!; setConfirm(null); doMove(c.row, c.stage); }}>Mark as hired</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Column({ stage, count, wide, children }: { stage: AtsStage; count: number; wide: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <section ref={setNodeRef} aria-label={`${stage.name}, ${count}`}
      className={cn("flex flex-col rounded-xl border border-border bg-muted/30 p-2", wide ? "w-full" : "w-64 shrink-0", isOver && "border-primary bg-primary/5")}>
      <header className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-sm font-medium text-foreground">{stage.name}</h3>
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      </header>
      <div className="flex min-h-[4rem] flex-col gap-2">{children}</div>
    </section>
  );
}

function CardBody({ row: r, idleDays }: { row: AtsAppRow; idleDays: number }) {
  const idle = r.status === "active" && (r.days_in_stage ?? 0) >= idleDays;
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 text-left shadow-sm">
      <div className="flex items-center gap-1.5 pr-6">
        <UnreviewedDot show={isUnreviewed(r)} />
        <span className="truncate text-sm font-medium text-foreground">{r.full_name}</span>
        <UnreadMailMark candidateId={r.candidate_id} />
        <ResumeIcon show={r.has_resume} />
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="t-mono">{r.ref_no}</span>
        {r.status === "on_hold" && <Badge variant="outline" className="h-4 px-1 text-[10px] text-warning">On hold</Badge>}
        {r.status === "hired" && <Badge variant="outline" className="h-4 px-1 text-[10px] text-success">Hired</Badge>}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <span>{fmtDate(r.applied_at)}</span>
        <span className={cn(idle && "font-medium text-warning")}>{r.days_in_stage ?? 0} d</span>
        {r.source_name && <span className="truncate">{r.source_name}</span>}
      </div>
      {!!r.rating_count && <div className="mt-1"><Stars value={r.rating_avg} count={r.rating_count} /></div>}
    </div>
  );
}

function BoardCard({ row, idleDays, stages, currentStage, busy, onOpen, onMove }: {
  row: AtsAppRow; idleDays: number; stages: AtsStage[]; currentStage: string; busy: boolean; onOpen: () => void; onMove: (stageId: string) => void;
}) {
  const disabled = busy || row.status === "hired";
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: row.application_id!, disabled });
  return (
    <div className={cn("relative", isDragging && "opacity-40", busy && "opacity-60")}>
      <div ref={setNodeRef} {...listeners} {...attributes}
        aria-label={`${row.full_name}. Press Space to pick up, arrows to move, Enter to open`}
        onClick={onOpen}
        onKeyDown={(e) => { listeners?.onKeyDown?.(e as any); if (e.key === "Enter" && !e.defaultPrevented) onOpen(); }}
        className="cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <CardBody row={row} idleDays={idleDays} />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="absolute right-1 top-1 h-6 w-6" aria-label={`Move ${row.full_name} to…`} disabled={disabled}>
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Move to…</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {stages.filter((s) => s.id !== currentStage).map((s) => <DropdownMenuItem key={s.id} onSelect={() => onMove(s.id)}>{s.name}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
