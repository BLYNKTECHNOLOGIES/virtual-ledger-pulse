import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Shield, Ban, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface RiskFlag {
  id: string;
  user_id: string;
  flag_type: string;
  flag_reason: string;
  risk_score: number;
  flagged_on: string;
  status: string;
  users: {
    username: string;
    email: string;
  };
}

export function FlaggedClientsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFlag, setSelectedFlag] = useState<RiskFlag | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"rekyc" | "clear" | "blacklist" | null>(null);

  const { data: flaggedClients, isLoading } = useQuery({
    queryKey: ["flagged-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("risk_flags")
        .select(`
          *,
          users!inner(username, email)
        `)
        .eq("status", "FLAGGED")
        .order("flagged_on", { ascending: false });

      if (error) throw error;
      return data as any;
    },
  });

  const updateFlagMutation = useMutation({
    mutationFn: async ({ flagId, newStatus, notes }: { flagId: string; newStatus: string; notes?: string }) => {
      const { error } = await supabase.rpc("update_risk_flag_status", {
        flag_id: flagId,
        new_status: newStatus,
        notes: notes
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flagged-clients"] });
      queryClient.invalidateQueries({ queryKey: ["risk-stats"] });
      toast({
        title: "Success",
        description: "Client status updated successfully",
      });
      setIsActionDialogOpen(false);
      setActionNotes("");
      setPendingAction(null);
      setSelectedFlag(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const initiateReKYCMutation = useMutation({
    mutationFn: async ({ flagId, userId }: { flagId: string; userId: string }) => {
      // Update flag status to UNDER_REKYC
      await supabase.rpc("update_risk_flag_status", {
        flag_id: flagId,
        new_status: "UNDER_REKYC",
        notes: actionNotes
      });

      // Create ReKYC request
      const { error } = await supabase
        .from("rekyc_requests")
        .insert({
          risk_flag_id: flagId,
          user_id: userId,
          status: "PENDING"
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flagged-clients"] });
      queryClient.invalidateQueries({ queryKey: ["risk-stats"] });
      toast({
        title: "Success",
        description: "ReKYC process initiated successfully",
      });
      setIsActionDialogOpen(false);
      setActionNotes("");
      setPendingAction(null);
      setSelectedFlag(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAction = (action: "rekyc" | "clear" | "blacklist", flag: RiskFlag) => {
    setSelectedFlag(flag);
    setPendingAction(action);
    setIsActionDialogOpen(true);
  };

  const executeAction = () => {
    if (!selectedFlag || !pendingAction) return;

    if (pendingAction === "rekyc") {
      initiateReKYCMutation.mutate({
        flagId: selectedFlag.id,
        userId: selectedFlag.user_id
      });
    } else {
      const newStatus = pendingAction === "clear" ? "CLEARED" : "BLACKLISTED";
      updateFlagMutation.mutate({
        flagId: selectedFlag.id,
        newStatus,
        notes: actionNotes
      });
    }
  };

  const getRiskBadgeColor = (score: number) => {
    if (score >= 70) return "destructive";
    if (score >= 50) return "secondary";
    return "outline";
  };

  const getActionTitle = () => {
    switch (pendingAction) {
      case "rekyc": return "Initiate ReKYC Process";
      case "clear": return "Clear Risk Flag";
      case "blacklist": return "Blacklist Client";
      default: return "";
    }
  };

  if (isLoading) {
    return <div>Loading flagged clients...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          Flagged Clients
        </CardTitle>
        <CardDescription>
          Clients flagged by automated risk detection requiring manual review
        </CardDescription>
      </CardHeader>
      <CardContent>
        {flaggedClients && flaggedClients.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Risk Reason</TableHead>
                <TableHead>Date Flagged</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Flag Type</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flaggedClients.map((flag) => (
                <TableRow key={flag.id}>
                  <TableCell className="font-medium">
                    <div>
                      <div>{flag.users.username}</div>
                      <div className="text-sm text-muted-foreground">{flag.users.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-xs">
                      <p className="text-sm">{flag.flag_reason}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {format(new Date(flag.flagged_on), "MMM dd, yyyy HH:mm")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getRiskBadgeColor(flag.risk_score)}>
                      {flag.risk_score}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{flag.flag_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction("rekyc", flag)}
                        className="flex items-center gap-1"
                      >
                        <Shield className="h-3 w-3" />
                        ReKYC
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction("clear", flag)}
                        className="flex items-center gap-1"
                      >
                        <CheckCircle className="h-3 w-3" />
                        Clear
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleAction("blacklist", flag)}
                        className="flex items-center gap-1"
                      >
                        <Ban className="h-3 w-3" />
                        Blacklist
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p>No flagged clients found</p>
          </div>
        )}

        <Dialog open={isActionDialogOpen} onOpenChange={setIsActionDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{getActionTitle()}</DialogTitle>
              <DialogDescription>
                {pendingAction === "rekyc" && "This will move the client to ReKYC process and require them to resubmit their verification documents."}
                {pendingAction === "clear" && "This will clear the risk flag and mark the client as safe."}
                {pendingAction === "blacklist" && "This will blacklist the client and restrict their access."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Add any additional notes or reasoning..."
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsActionDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={executeAction}
                  variant={pendingAction === "blacklist" ? "destructive" : "default"}
                  disabled={updateFlagMutation.isPending || initiateReKYCMutation.isPending}
                >
                  {updateFlagMutation.isPending || initiateReKYCMutation.isPending ? "Processing..." : "Confirm"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}