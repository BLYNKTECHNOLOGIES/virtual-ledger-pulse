import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, Headset, ExternalLink, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { useActiveRAAssignments, useAllRARemarks, useRAUsers } from "@/hooks/useRA";
import { RARemarkDialog } from "./RARemarkDialog";

export function RAAssignmentsTab() {
  const navigate = useNavigate();
  const { data: raUsers } = useRAUsers();
  const { data: assignmentsMap } = useActiveRAAssignments();
  const { data: allRemarks } = useAllRARemarks();
  const [expandedRA, setExpandedRA] = useState<string | null>(null);
  const [viewRemark, setViewRemark] = useState<{ id: string; name: string } | null>(null);

  const assignments = useMemo(
    () => (assignmentsMap ? Array.from(assignmentsMap.values()) : []),
    [assignmentsMap]
  );

  const assignedClientIds = useMemo(() => assignments.map((a) => a.client_id), [assignments]);

  const { data: clientNames } = useQuery({
    queryKey: ["ra-assigned-client-names", assignedClientIds.length],
    enabled: assignedClientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, client_id")
        .in("id", assignedClientIds);
      if (error) throw error;
      const map = new Map<string, { name: string; client_id: string }>();
      (data || []).forEach((c: any) => map.set(c.id, { name: c.name, client_id: c.client_id }));
      return map;
    },
  });

  const clientLabel = (id: string) => clientNames?.get(id)?.name || id.slice(0, 8);


  const remarkClientIds = useMemo(() => {
    const s = new Set<string>();
    (allRemarks || []).forEach((r) => s.add(r.client_id));
    return s;
  }, [allRemarks]);

  const lastRemarkByClient = useMemo(() => {
    const map = new Map<string, any>();
    (allRemarks || []).forEach((r) => {
      if (!map.has(r.client_id)) map.set(r.client_id, r);
    });
    return map;
  }, [allRemarks]);

  // Build per-RA summary
  const raSummaries = useMemo(() => {
    const list = (raUsers || []).map((ra) => {
      const raAssignments = assignments.filter((a) => a.ra_user_id === ra.id);
      const contacted = raAssignments.filter((a) => remarkClientIds.has(a.client_id)).length;
      const lastActivity = (allRemarks || [])
        .filter((r) => r.ra_user_id === ra.id)
        .map((r) => r.created_at)
        .sort()
        .reverse()[0];
      return {
        ra,
        total: raAssignments.length,
        contacted,
        pending: raAssignments.length - contacted,
        lastActivity,
        assignments: raAssignments,
      };
    });
    return list.sort((a, b) => b.total - a.total);
  }, [raUsers, assignments, remarkClientIds, allRemarks]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Headset className="h-5 w-5" />
            RA Assignments Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {raSummaries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No users have the RA Dashboard permission yet.
            </p>
          )}
          {raSummaries.map((s) => (
            <div key={s.ra.id} className="border rounded-lg">
              <button
                className="w-full flex items-center justify-between gap-3 p-4 hover:bg-muted/40"
                onClick={() => setExpandedRA(expandedRA === s.ra.id ? null : s.ra.id)}
              >
                <div className="flex items-center gap-3">
                  <ChevronRight
                    className={`h-4 w-4 transition-transform ${expandedRA === s.ra.id ? "rotate-90" : ""}`}
                  />
                  <span className="font-medium">{s.ra.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{s.total} assigned</Badge>
                  <Badge className="bg-green-100 text-green-800">{s.contacted} contacted</Badge>
                  <Badge className="bg-yellow-100 text-yellow-800">{s.pending} pending</Badge>
                  {s.lastActivity && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      Last: {format(new Date(s.lastActivity), "dd MMM")}
                    </span>
                  )}
                </div>
              </button>

              {expandedRA === s.ra.id && (
                <div className="border-t p-3 overflow-x-auto">
                  {s.assignments.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No clients assigned.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Client</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Status</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Last Remark</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.assignments.map((a) => {
                          const lr = lastRemarkByClient.get(a.client_id);
                          return (
                            <tr key={a.id} className="border-b hover:bg-muted/30">
                              <td className="py-2 px-3">
                                <button
                                  className="text-primary hover:underline"
                                  onClick={() => navigate(`/clients/${a.client_id}`)}
                                >
                                  {/* client name not joined here; show via remark or id */}
                                  {clientLabel(a.client_id)}
                                </button>
                              </td>
                              <td className="py-2 px-3">
                                {lr ? (
                                  <Badge className="bg-green-100 text-green-800">Contacted</Badge>
                                ) : (
                                  <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>
                                )}
                              </td>
                              <td className="py-2 px-3 max-w-[240px] truncate text-muted-foreground">
                                {lr ? lr.remark : "—"}
                              </td>
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setViewRemark({ id: a.client_id, name: clientLabel(a.client_id) })}
                                  >
                                    <MessageSquare className="h-4 w-4 mr-1" />
                                    Log
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => navigate(`/clients/${a.client_id}`)}>
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {viewRemark && (
        <RARemarkDialog
          open={!!viewRemark}
          onOpenChange={(o) => !o && setViewRemark(null)}
          clientId={viewRemark.id}
          clientName={viewRemark.name}
          readOnly
        />
      )}
    </div>
  );
}
