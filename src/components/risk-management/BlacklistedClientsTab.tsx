import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { XCircle, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface BlacklistedFlag {
  id: string;
  user_id: string;
  flag_type: string;
  flag_reason: string;
  risk_score: number;
  flagged_on: string;
  resolved_on: string;
  admin_notes?: string;
  users: {
    username: string;
    email: string;
  };
  resolved_by_user?: {
    username: string;
  };
}

export function BlacklistedClientsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFlag, setSelectedFlag] = useState<BlacklistedFlag | null>(null);
  const [isUnblacklistDialogOpen, setIsUnblacklistDialogOpen] = useState(false);
  const [unblacklistNotes, setUnblacklistNotes] = useState("");

  const { data: blacklistedClients, isLoading } = useQuery({
    queryKey: ["blacklisted-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("risk_flags")
        .select(`
          *,
          users!inner(username, email),
          resolved_by_user:users!risk_flags_resolved_by_fkey(username)
        `)
        .eq("status", "BLACKLISTED")
        .order("resolved_on", { ascending: false });

      if (error) throw error;
      return data as any;
    },
  });

  const unblacklistMutation = useMutation({
    mutationFn: async ({ flagId, notes }: { flagId: string; notes: string }) => {
      const { error } = await supabase.rpc("update_risk_flag_status", {
        flag_id: flagId,
        new_status: "FLAGGED",
        notes: notes
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blacklisted-clients"] });
      queryClient.invalidateQueries({ queryKey: ["flagged-clients"] });
      queryClient.invalidateQueries({ queryKey: ["risk-stats"] });
      toast({
        title: "Success",
        description: "Client has been removed from blacklist and returned to flagged status",
      });
      setIsUnblacklistDialogOpen(false);
      setUnblacklistNotes("");
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

  const handleUnblacklist = (flag: BlacklistedFlag) => {
    setSelectedFlag(flag);
    setIsUnblacklistDialogOpen(true);
  };

  const executeUnblacklist = () => {
    if (!selectedFlag) return;

    unblacklistMutation.mutate({
      flagId: selectedFlag.id,
      notes: unblacklistNotes
    });
  };

  if (isLoading) {
    return <div>Loading blacklisted clients...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <XCircle className="h-5 w-5 text-red-500" />
          Blacklisted Clients
        </CardTitle>
        <CardDescription>
          Clients who have been blacklisted due to high risk factors
        </CardDescription>
      </CardHeader>
      <CardContent>
        {blacklistedClients && blacklistedClients.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Blacklist Reason</TableHead>
                <TableHead>Blacklisted On</TableHead>
                <TableHead>Blacklisted By</TableHead>
                <TableHead>Original Risk Score</TableHead>
                <TableHead>Admin Notes</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {blacklistedClients.map((flag) => (
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
                      <Badge variant="outline" className="mt-1">
                        {flag.flag_type}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    {flag.resolved_on ? format(new Date(flag.resolved_on), "MMM dd, yyyy HH:mm") : "N/A"}
                  </TableCell>
                  <TableCell>
                    {flag.resolved_by_user?.username || "System"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="destructive">
                      {flag.risk_score}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-xs">
                      <p className="text-sm">{flag.admin_notes || "No notes"}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUnblacklist(flag)}
                      className="flex items-center gap-1"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Remove from Blacklist
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <XCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p>No blacklisted clients found</p>
          </div>
        )}

        <Dialog open={isUnblacklistDialogOpen} onOpenChange={setIsUnblacklistDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove from Blacklist</DialogTitle>
              <DialogDescription>
                This will remove the client from the blacklist and return them to flagged status for further review.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="unblacklist-notes">Reason for Removal *</Label>
                <Textarea
                  id="unblacklist-notes"
                  placeholder="Provide detailed reasoning for removing this client from blacklist..."
                  value={unblacklistNotes}
                  onChange={(e) => setUnblacklistNotes(e.target.value)}
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsUnblacklistDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={executeUnblacklist}
                  disabled={!unblacklistNotes.trim() || unblacklistMutation.isPending}
                >
                  {unblacklistMutation.isPending ? "Processing..." : "Remove from Blacklist"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}