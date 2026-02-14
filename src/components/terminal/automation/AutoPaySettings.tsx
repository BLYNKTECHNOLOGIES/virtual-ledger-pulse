import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Timer, CheckCircle, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { logAdAction, AdActionTypes } from "@/hooks/useAdActionLog";

export function AutoPaySettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["auto-pay-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("p2p_auto_pay_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["auto-pay-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("p2p_auto_pay_log")
        .select("*")
        .order("executed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: { is_active?: boolean; minutes_before_expiry?: number }) => {
      if (!settings?.id) {
        // Insert if no row
        const { error } = await supabase.from("p2p_auto_pay_settings").insert({
          is_active: updates.is_active ?? false,
          minutes_before_expiry: updates.minutes_before_expiry ?? 3,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("p2p_auto_pay_settings")
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("id", settings.id);
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["auto-pay-settings"] });
      toast.success("Auto-pay settings updated");
      if ('is_active' in variables) {
        logAdAction({ actionType: AdActionTypes.AUTO_PAY_TOGGLED, adDetails: { is_active: variables.is_active } });
      }
      if ('minutes_before_expiry' in variables) {
        logAdAction({ actionType: AdActionTypes.AUTO_PAY_MINUTES_CHANGED, adDetails: { minutes_before_expiry: variables.minutes_before_expiry } });
      }
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });

  const [localMinutes, setLocalMinutes] = useState<string>("");

  const currentMinutes = localMinutes || String(settings?.minutes_before_expiry || 3);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Settings Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Timer className="h-4 w-4 text-primary" />
            Auto-Pay Before Expiry
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Enable Auto-Pay</p>
              <p className="text-xs text-muted-foreground">
                Automatically mark BUY orders as paid when they reach the final minutes before expiry
              </p>
            </div>
            <Switch
              checked={settings?.is_active ?? false}
              onCheckedChange={(v) => updateSettings.mutate({ is_active: v })}
            />
          </div>

          {settings?.is_active && (
            <div className="flex items-center gap-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              <div className="flex-1 space-y-2">
                <p className="text-xs text-amber-300">
                  Orders will be marked as paid when less than <strong>{currentMinutes} minutes</strong> remain before expiry.
                  This runs every 60 seconds via the automation engine.
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Minutes before expiry:</span>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={currentMinutes}
                    onChange={(e) => setLocalMinutes(e.target.value)}
                    onBlur={() => {
                      const val = Math.max(1, Math.min(30, parseInt(currentMinutes) || 3));
                      setLocalMinutes(String(val));
                      updateSettings.mutate({ minutes_before_expiry: val });
                    }}
                    className="w-20 h-7 text-xs"
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Execution Log */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Auto-Pay Log</CardTitle>
            <span className="text-xs text-muted-foreground">{logs.length} entries</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {logsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Timer className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No auto-pay executions yet</p>
              <p className="text-xs mt-1">Logs will appear when auto-pay triggers on active BUY orders</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Min Remaining</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        {log.status === "success" && <CheckCircle className="h-4 w-4 text-trade-buy" />}
                        {log.status === "failed" && <XCircle className="h-4 w-4 text-trade-sell" />}
                        {log.status === "pending" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                      </TableCell>
                      <TableCell className="font-mono text-xs">…{log.order_number?.slice(-8)}</TableCell>
                      <TableCell>
                        {log.minutes_remaining != null ? (
                          <Badge variant="outline" className="text-xs">
                            {parseFloat(log.minutes_remaining).toFixed(1)} min
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        {log.error_message ? (
                          <p className="text-xs text-destructive truncate">{log.error_message}</p>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.executed_at), "dd MMM HH:mm:ss")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
