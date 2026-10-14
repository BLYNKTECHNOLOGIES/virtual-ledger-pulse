import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { History, Plus, Minus, RefreshCw } from "lucide-react";
import { Panel, TablePager } from "@/components/finance-ui/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtAgo, fmtDay, fmtTime } from "@/components/profile/format";
import { cn } from "@/lib/utils";
import { historyIstBounds } from "@/lib/umPresence";
import { PanelMessage, PanelSkeleton, Segmented, permissionLabel } from "./umUi";

interface ChangeLogEntry {
  id: string;
  role_name: string;
  change_type: string;
  permission: string | null;
  function_key: string | null;
  changed_by: string | null;
  changed_at: string;
}
interface FilterOption { id: string; name: string }
type LogFilter = "all" | "granted" | "revoked";
const PAGE_SIZE = 50;

export function PermissionChangeLog() {
  const [filter, setFilter] = useState<LogFilter>("all");
  const [role, setRole] = useState("all");
  const [actor, setActor] = useState("all");
  const [from, setFrom] = useState("");
  const [through, setThrough] = useState("");
  const [page, setPage] = useState(0);
  const invalidDates = !!from && !!through && from > through;
  const options = useQuery({
    queryKey: ["um-history-options"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("um_history_options");
      if (error) throw error;
      return data as { roles: FilterOption[]; actors: FilterOption[] };
    },
  });
  const q = useQuery({
    queryKey: ["um-history", filter, role, actor, from, through, page],
    enabled: !invalidDates,
    queryFn: async () => {
      let query = supabase.from("permission_change_log").select("*", { count: "exact" });
      if (role !== "all") query = query.eq("role_id", role);
      if (actor === "system") query = query.is("changed_by", null);
      else if (actor !== "all") query = query.eq("changed_by", actor);
      if (filter !== "all") query = query.in("change_type", filter === "granted" ? ["permission_granted", "function_granted"] : ["permission_revoked", "function_revoked"]);
      const { start, end } = historyIstBounds(from, through);
      if (start) query = query.gte("changed_at", start);
      if (end) query = query.lt("changed_at", end);
      const { data, error, count } = await query.order("changed_at", { ascending: false }).order("id", { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return { logs: (data || []) as ChangeLogEntry[], total: count || 0 };
    },
  });
  const changerNames = Object.fromEntries((options.data?.actors || []).map(a => [a.id, a.name]));
  const logs = q.data?.logs || [];
  const total = q.data?.total || 0;
  const groups: Array<{ day: string; items: ChangeLogEntry[] }> = [];
  logs.forEach(log => {
    const day = fmtDay(log.changed_at);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(log);
    else groups.push({ day, items: [log] });
  });
  const change = (set: (v: string) => void, value: string) => { set(value); setPage(0); };
  const optionSelect = (label: string, value: string, set: (v: string) => void, rows: FilterOption[], system = false) => (
    <Select value={value} onValueChange={v => change(set, v)}>
      <SelectTrigger className="h-9 w-full sm:w-48" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="all">{label === "Filter by role" ? "All roles" : "Everyone"}</SelectItem>{system && <SelectItem value="system">System</SelectItem>}{rows.map(row => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent>
    </Select>
  );
  return (
    <Panel title="Permission change history" bodyClassName="p-0 sm:p-0">
      <div className="flex flex-wrap items-end gap-2 border-b border-border px-4 py-3 sm:px-5">
        {optionSelect("Filter by role", role, setRole, options.data?.roles || [])}
        {optionSelect("Changed by", actor, setActor, options.data?.actors || [], true)}
        <Segmented label="Show changes" value={filter} onChange={v => { setFilter(v as LogFilter); setPage(0); }} options={[{ value: "all", label: "All" }, { value: "granted", label: "Granted" }, { value: "revoked", label: "Removed" }]} />
        <div className="space-y-1"><Label htmlFor="history-from" className="text-xs">From (IST)</Label><Input id="history-from" type="date" className="h-9 w-40" value={from} onChange={e => change(setFrom, e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="history-through" className="text-xs">Through (IST)</Label><Input id="history-through" type="date" className="h-9 w-40" value={through} onChange={e => change(setThrough, e.target.value)} /></div>
        <Button size="sm" variant="outline" className="h-9 w-9 p-0" aria-label="Refresh history" onClick={() => { void q.refetch(); void options.refetch(); }}><RefreshCw className="h-4 w-4" /></Button>
      </div>
      {invalidDates ? <PanelMessage icon={History} title="From must be on or before Through" /> : q.isError || options.isError ? <PanelMessage icon={History} title="History could not be loaded"><Button variant="link" onClick={() => { void q.refetch(); void options.refetch(); }}>Try again</Button></PanelMessage> : q.isLoading ? <PanelSkeleton rows={4} /> : logs.length === 0 ? <PanelMessage icon={History} title="No changes match these filters" /> : (
        <div className="max-h-[32rem] overflow-y-auto">
          {groups.map((g) => (
            <section key={g.day} aria-label={g.day}>
              <h3 className="sticky top-0 z-[1] border-b border-border/70 bg-muted/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur sm:px-5">
                {g.day}
              </h3>
              <ul className="divide-y divide-border/70">
                {g.items.map((log) => {
                  const granted = isGrant(log.change_type);
                  const what = log.permission ? permissionLabel(log.permission) : log.function_key ? `Function · ${log.function_key}` : 'unknown';
                  return (
                    <li key={log.id} className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
                      <span
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                          granted ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
                        )}
                        aria-label={granted ? "Granted" : "Removed"}
                      >
                        {granted ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                      </span>
                      <div className="min-w-0 flex-1 text-[13px]">
                        <p className="text-foreground">
                          <span className="font-medium">{(log.role_name || '').trim() || 'A role'}</span>
                          <span className={granted ? "text-success" : "text-destructive"}>{granted ? " gained " : " lost "}</span>
                          <span className="font-medium">{what}</span>
                        </p>
                        {log.permission && permissionLabel(log.permission) !== log.permission.replace(/_/g, ' ') && (
                          <p className="font-mono text-[11px] text-muted-foreground">{log.permission}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        <p>{changerNames[log.changed_by || ''] || 'System'}</p>
                        <p title={`${fmtDay(log.changed_at)}, ${fmtTime(log.changed_at)} IST`}>{fmtAgo(log.changed_at)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      {!invalidDates && !q.isError && total > 0 && <div className="px-4 pb-3 sm:px-5"><TablePager page={page} pages={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} pageSize={PAGE_SIZE} setPage={setPage} noun="changes" /></div>}
    </Panel>
  );
}
