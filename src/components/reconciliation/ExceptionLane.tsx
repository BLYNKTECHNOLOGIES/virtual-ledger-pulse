import { useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, Info, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Lane, ExceptionItem, ExceptionStateRow } from "@/hooks/useReconciliationCockpit";

interface ExceptionLaneProps {
 lane: Lane;
 stateByRef: Record<string, ExceptionStateRow>;
 showResolved: boolean;
 canManage: boolean;
 onAcknowledge: (item: ExceptionItem) => void;
 onResolve: (item: ExceptionItem) => void;
 onReopen: (item: ExceptionItem) => void;
}

const severityStyles: Record<string, string> = {
 critical: "bg-destructive/10 text-destructive ",
 warning: "bg-warning/10 text-warning ",
 info: "bg-info/10 text-info ",
};

const SeverityIcon = ({ severity }: { severity: string }) => {
 if (severity === "critical") return <AlertTriangle className="h-4 w-4 text-destructive" />;
 if (severity === "warning") return <AlertTriangle className="h-4 w-4 text-warning" />;
 return <Info className="h-4 w-4 text-info" />;
};

export function ExceptionLane({
 lane,
 stateByRef,
 showResolved,
 canManage,
 onAcknowledge,
 onResolve,
 onReopen,
}: ExceptionLaneProps) {
 const [open, setOpen] = useState(true);

 const visible = lane.items.filter((i) => showResolved || !stateByRef[i.ref]?.resolved_at);
 const openCount = lane.items.filter((i) => !stateByRef[i.ref]?.resolved_at).length;

 return (
 <div className="rounded-xl border bg-card shadow-sm">
 <button
 type="button"
 onClick={() => setOpen((v) => !v)}
 className="flex w-full items-center justify-between gap-3 rounded-t-xl px-4 py-3 text-left transition-colors hover:bg-muted/50"
 >
 <div className="flex items-center gap-3">
 {open ? (
 <ChevronDown className="h-4 w-4 text-muted-foreground" />
 ) : (
 <ChevronRight className="h-4 w-4 text-muted-foreground" />
 )}
 <div>
 <div className="font-semibold">{lane.title}</div>
 <div className="text-xs text-muted-foreground">{lane.description}</div>
 </div>
 </div>
 <Badge
 variant={openCount > 0 ? "destructive" : "secondary"}
 className={cn(openCount === 0 && "bg-success/10 text-success ")}
 >
 {openCount} open
 </Badge>
 </button>

 {open && (
 <div className="divide-y border-t">
 {visible.length === 0 && (
 <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
 <CheckCircle2 className="h-4 w-4 text-success" />
 No {showResolved ? "" : "open "}exceptions in this lane.
 </div>
 )}
 {visible.map((item) => {
 const state = stateByRef[item.ref];
 const resolved = !!state?.resolved_at;
 const acknowledged = !!state?.acknowledged_at || !!item.raw?.acknowledged_at;
 return (
 <div
 key={item.ref}
 className={cn(
 "flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
 resolved && "opacity-60"
 )}
 >
 <div className="flex items-start gap-3">
 <SeverityIcon severity={item.severity} />
 <div className="min-w-0">
 <div className="flex items-center gap-2">
 <span className="font-medium">{item.title}</span>
 <Badge className={cn("text-[10px] uppercase", severityStyles[item.severity])}>
 {item.severity}
 </Badge>
 {resolved && (
 <Badge className="bg-success/10 text-success ">
 Resolved
 </Badge>
 )}
 {!resolved && acknowledged && (
 <Badge variant="secondary">Acknowledged</Badge>
 )}
 </div>
 <div className="text-sm text-muted-foreground">{item.subtitle}</div>
 <div className="text-xs text-muted-foreground tabular-nums">{item.detail}</div>
 {resolved && (state?.resolved_by_name || state?.resolution_reason) && (
 <div className="mt-0.5 text-xs text-success ">
 by {state?.resolved_by_name || "—"}
 {state?.resolution_reason ? ` · ${state.resolution_reason}` : ""}
 </div>
 )}
 </div>
 </div>

 {canManage && (
 <div className="flex shrink-0 items-center gap-2">
 {!resolved ? (
 <>
 {!acknowledged && (
 <Button size="sm" variant="outline" onClick={() => onAcknowledge(item)}>
 Acknowledge
 </Button>
 )}
 <Button size="sm" onClick={() => onResolve(item)}>
 Resolve
 </Button>
 </>
 ) : (
 <Button size="sm" variant="ghost" onClick={() => onReopen(item)}>
 <RotateCcw className="mr-1 h-3.5 w-3.5" />
 Reopen
 </Button>
 )}
 </div>
 )}
 </div>
 );
 })}
 </div>
 )}
 </div>
 );
}
