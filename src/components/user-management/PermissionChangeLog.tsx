import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { History, Plus, Minus } from "lucide-react";
import { Panel } from "@/components/finance-ui/primitives";
import { fmtAgo, fmtDay, fmtTime } from "@/components/profile/format";
import { cn } from "@/lib/utils";
import { PanelMessage, PanelSkeleton, Segmented, permissionLabel } from "./umUi";

import { usersDirectory } from "@/lib/usersDirectory";
interface ChangeLogEntry {
  id: string;
  role_name: string;
  change_type: string;
  permission: string | null;
  function_key: string | null;
  changed_by: string | null;
  changed_at: string;
}

type LogFilter = "all" | "granted" | "revoked";

export function PermissionChangeLog() {
  const [logs, setLogs] = useState<ChangeLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [changerNames, setChangerNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<LogFilter>("all");

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('permission_change_log')
        .select('*')
        .order('changed_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setLogs(data || []);

      // Fetch usernames for changed_by
      const userIds = [...new Set((data || []).map(l => l.changed_by).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: users } = await usersDirectory()
          .select('id, username, first_name, last_name')
          .in('id', userIds);

        const names: Record<string, string> = {};
        (users || []).forEach((u: any) => {
          names[u.id] = u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : u.username;
        });
        setChangerNames(names);
      }
    } catch (error) {
      console.error('Error fetching permission change logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const isGrant = (type: string) => type.includes('granted');

  const grantedCount = logs.filter((l) => isGrant(l.change_type)).length;
  const shown = logs.filter((l) => filter === "all" || (filter === "granted" ? isGrant(l.change_type) : !isGrant(l.change_type)));

  // Group by IST calendar day, newest first (the query is already newest first).
  const groups: Array<{ day: string; items: ChangeLogEntry[] }> = [];
  shown.forEach((log) => {
    const day = fmtDay(log.changed_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(log);
    else groups.push({ day, items: [log] });
  });

  return (
    <Panel
      title="Permission change history"
      description="The latest 50 changes to what roles can do, newest first."
      bodyClassName="p-0 sm:p-0"
      actions={
        logs.length > 0 ? (
          <Segmented
            label="Show changes"
            value={filter}
            onChange={(v) => setFilter(v as LogFilter)}
            options={[
              { value: "all", label: "All", count: logs.length },
              { value: "granted", label: "Granted", count: grantedCount },
              { value: "revoked", label: "Removed", count: logs.length - grantedCount },
            ]}
          />
        ) : undefined
      }
    >
      {isLoading ? (
        <PanelSkeleton rows={4} />
      ) : logs.length === 0 ? (
        <PanelMessage icon={History} title="No permission changes recorded yet" />
      ) : shown.length === 0 ? (
        <PanelMessage icon={History} title="Nothing in this view" />
      ) : (
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
    </Panel>
  );
}
