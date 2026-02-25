import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Key, Check, X, Clock, RefreshCw } from "lucide-react";
import { ResetPasswordDialog } from "./ResetPasswordDialog";

interface PasswordResetRequest {
  id: string;
  user_id: string;
  reason: string | null;
  status: string;
  requested_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolver_note: string | null;
  username?: string;
  email?: string;
}

export function PasswordResetRequestsTab() {
  const [requests, setRequests] = useState<PasswordResetRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resetUser, setResetUser] = useState<{ id: string; name: string } | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("password_reset_requests")
        .select("*")
        .order("requested_at", { ascending: false });

      if (error) throw error;

      // Fetch user details for each request
      const userIds = [...new Set((data || []).map((r: any) => r.user_id))];
      const { data: usersData } = await supabase
        .from("users")
        .select("id, username, email")
        .in("id", userIds);

      const userMap = new Map(usersData?.map((u: any) => [u.id, u]) || []);

      setRequests(
        (data || []).map((r: any) => ({
          ...r,
          username: (userMap.get(r.user_id) as any)?.username || "Unknown",
          email: (userMap.get(r.user_id) as any)?.email || "",
        }))
      );
    } catch (error) {
      console.error("Error fetching password reset requests:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleReject = async (requestId: string) => {
    try {
      const { error } = await supabase
        .from("password_reset_requests")
        .update({
          status: "rejected",
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id,
          resolver_note: "Rejected by Super Admin",
        })
        .eq("id", requestId);

      if (error) throw error;

      toast({ title: "Request Rejected", description: "Password reset request has been rejected." });
      fetchRequests();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleApproveAndReset = (request: PasswordResetRequest) => {
    setResetUser({ id: request.user_id, name: request.username || "User" });
  };

  const handleResetComplete = async (userId: string) => {
    // Mark matching pending requests as approved
    try {
      await supabase
        .from("password_reset_requests")
        .update({
          status: "approved",
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id,
          resolver_note: "Password reset by Super Admin",
        })
        .eq("user_id", userId)
        .eq("status", "pending");
    } catch (e) {
      console.error("Failed to update request status:", e);
    }
    fetchRequests();
  };

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const resolvedRequests = requests.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              Password Reset Requests
              {pendingRequests.length > 0 && (
                <Badge variant="destructive">{pendingRequests.length} Pending</Badge>
              )}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={fetchRequests}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : pendingRequests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No pending password reset requests.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between p-4 border rounded-lg bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{req.username}</span>
                      <span className="text-sm text-muted-foreground">({req.email})</span>
                      <Badge variant="outline" className="text-amber-700 border-amber-300">
                        <Clock className="h-3 w-3 mr-1" /> Pending
                      </Badge>
                    </div>
                    {req.reason && (
                      <p className="text-sm text-muted-foreground">
                        <strong>Reason:</strong> {req.reason}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Requested: {new Date(req.requested_at).toLocaleString("en-GB")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApproveAndReset(req)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Check className="h-4 w-4 mr-1" /> Reset Password
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleReject(req.id)}>
                      <X className="h-4 w-4 mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resolved History */}
      {resolvedRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resolved Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {resolvedRequests.slice(0, 20).map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{req.username}</span>
                      <Badge
                        variant={req.status === "approved" ? "default" : "destructive"}
                        className="text-xs"
                      >
                        {req.status === "approved" ? "✅ Approved" : "❌ Rejected"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(req.requested_at).toLocaleString("en-GB")}
                      {req.resolved_at && ` → ${new Date(req.resolved_at).toLocaleString("en-GB")}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reset Password Dialog */}
      {resetUser && (
        <ResetPasswordDialog
          open={!!resetUser}
          onOpenChange={(open) => {
            if (!open) {
              handleResetComplete(resetUser.id);
              setResetUser(null);
            }
          }}
          userId={resetUser.id}
          userName={resetUser.name}
        />
      )}
    </div>
  );
}
