import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Headset, Search, MessageSquarePlus, ExternalLink, Phone } from "lucide-react";
import { format } from "date-fns";
import { useMyRAAssignments, useAllRARemarks } from "@/hooks/useRA";
import { useClientTypeFromOrders } from "@/hooks/useClientTypeFromOrders";
import { RARemarkDialog } from "@/components/clients/RARemarkDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

const riskColors: Record<string, string> = {
  PREMIUM: "bg-success/10 text-success",
  ESTABLISHED: "bg-info/10 text-info",
  STANDARD: "bg-warning/10 text-warning",
  CAUTIOUS: "bg-warning/10 text-warning",
  HIGH_RISK: "bg-destructive/10 text-destructive",
};

const formatVolume = (v: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(v || 0);

export default function RADashboard() {
  const navigate = useNavigate();
  const { hasPermission, isLoading: permsLoading } = usePermissions();
  const { data: assignments, isLoading: aLoading } = useMyRAAssignments();
  const { data: allRemarks } = useAllRARemarks();
  const [search, setSearch] = useState("");
  const [remarkClient, setRemarkClient] = useState<{ id: string; name: string; assignmentId: string } | null>(null);

  const clientIds = useMemo(() => (assignments || []).map((a) => a.client_id), [assignments]);

  const { data: clients } = useQuery({
    queryKey: ["ra-clients", clientIds],
    enabled: clientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .in("id", clientIds);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: orderCounts } = useClientTypeFromOrders(clients);

  const lastRemarkByClient = useMemo(() => {
    const map = new Map<string, any>();
    (allRemarks || []).forEach((r) => {
      if (!map.has(r.client_id)) map.set(r.client_id, r);
    });
    return map;
  }, [allRemarks]);

  const rows = useMemo(() => {
    if (!clients) return [];
    const term = search.trim().toLowerCase();
    return clients
      .filter((c) => !term || (c.name || "").toLowerCase().includes(term) || (c.client_id || "").toLowerCase().includes(term))
      .map((c) => {
        const info = orderCounts?.get(c.id);
        const totalOrders = (info?.salesOrderCount || 0) + (info?.purchaseOrderCount || 0);
        const totalVolume = (info?.totalSalesValue || 0) + (info?.totalPurchaseValue || 0);
        const dates = [info?.lastSalesOrderDate, info?.lastPurchaseOrderDate].filter(Boolean) as string[];
        const lastOrderDate = dates.sort().reverse()[0] || null;
        const assignment = (assignments || []).find((a) => a.client_id === c.id);
        return { client: c, totalOrders, totalVolume, lastOrderDate, assignmentId: assignment?.id || "", lastRemark: lastRemarkByClient.get(c.id) };
      });
  }, [clients, orderCounts, search, assignments, lastRemarkByClient]);

  if (!permsLoading && !hasPermission("ra_dashboard_view")) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        You do not have access to the RA Dashboard.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-2">
        <Headset className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">My Assigned Clients</h1>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Relationship Associate Dashboard</CardTitle>
            <Badge variant="outline">{rows.length} clients</Badge>
          </div>
          <div className="flex items-center gap-2 max-w-sm pt-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name or ID..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Client</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Phone</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Risk Level</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Total Orders</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Total Volume (₹)</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Last Order</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Last Remark</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ client, totalOrders, totalVolume, lastOrderDate, assignmentId, lastRemark }) => (
                  <tr key={client.id} className="border-b hover:bg-muted/40">
                    <td className="py-3 px-4">
                      <div className="font-medium">{client.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{client.client_id}</div>
                    </td>
                    <td className="py-3 px-4">
                      {client.phone ? (
                        <a href={`tel:${client.phone}`} className="flex items-center gap-1 text-primary hover:underline">
                          <Phone className="h-3 w-3" />
                          {client.phone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <Badge className={riskColors[client.risk_appetite] || "bg-muted text-foreground"}>
                        {client.risk_appetite || "—"}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">{totalOrders}</td>
                    <td className="py-3 px-4">{formatVolume(totalVolume)}</td>
                    <td className="py-3 px-4">
                      {lastOrderDate ? format(new Date(lastOrderDate), "dd MMM yyyy") : "-"}
                    </td>
                    <td className="py-3 px-4 max-w-[200px]">
                      {lastRemark ? (
                        <div>
                          <Badge variant="secondary" className="text-xs">{lastRemark.contact_outcome || "Logged"}</Badge>
                          <div className="text-xs text-muted-foreground truncate">{lastRemark.remark}</div>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-xs">Not contacted</Badge>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setRemarkClient({ id: client.id, name: client.name, assignmentId })}>
                          <MessageSquarePlus className="h-4 w-4 mr-1" />
                          Remark
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/clients/${client.id}`)}>
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Open
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!aLoading && rows.length === 0 && (
              <EmptyState icon={Headset} title="No clients assigned to you yet." description="Clients assigned to you will appear here." />
            )}
          </div>
        </CardContent>
      </Card>

      {remarkClient && (
        <RARemarkDialog
          open={!!remarkClient}
          onOpenChange={(o) => !o && setRemarkClient(null)}
          clientId={remarkClient.id}
          clientName={remarkClient.name}
          assignmentId={remarkClient.assignmentId}
        />
      )}
    </div>
  );
}
