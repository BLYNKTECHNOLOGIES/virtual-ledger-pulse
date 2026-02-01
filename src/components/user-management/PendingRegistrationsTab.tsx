import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  UserPlus,
  Check,
  X,
  Clock,
  Mail,
  Phone,
  User,
  Search,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface PendingRegistration {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  phone: string | null;
  status: string;
  submitted_at: string;
}

interface Role {
  id: string;
  name: string;
  description: string | null;
}

export function PendingRegistrationsTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [approvalDialog, setApprovalDialog] = useState<PendingRegistration | null>(null);
  const [rejectionDialog, setRejectionDialog] = useState<PendingRegistration | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [rejectionReason, setRejectionReason] = useState("");
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch pending registrations
  const { data: registrations = [], isLoading, refetch } = useQuery({
    queryKey: ["pending-registrations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_registrations")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as PendingRegistration[];
    },
  });

  // Fetch roles
  const { data: roles = [] } = useQuery({
    queryKey: ["roles-for-approval"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles")
        .select("id, name, description")
        .order("name");

      if (error) throw error;
      return data as Role[];
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async ({
      registrationId,
      roleId,
    }: {
      registrationId: string;
      roleId: string;
    }) => {
      const { data, error } = await supabase.rpc("approve_registration", {
        p_registration_id: registrationId,
        p_role_id: roleId,
        p_approved_by: user?.id || null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Registration Approved",
        description: "The user has been created and can now log in.",
      });
      queryClient.invalidateQueries({ queryKey: ["pending-registrations"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setApprovalDialog(null);
      setSelectedRoleId("");
    },
    onError: (error: any) => {
      toast({
        title: "Approval Failed",
        description: error.message || "Failed to approve registration",
        variant: "destructive",
      });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({
      registrationId,
      reason,
    }: {
      registrationId: string;
      reason: string;
    }) => {
      const { data, error } = await supabase.rpc("reject_registration", {
        p_registration_id: registrationId,
        p_rejected_by: user?.id || null,
        p_reason: reason || null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Registration Rejected",
        description: "The registration request has been rejected.",
      });
      queryClient.invalidateQueries({ queryKey: ["pending-registrations"] });
      setRejectionDialog(null);
      setRejectionReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Rejection Failed",
        description: error.message || "Failed to reject registration",
        variant: "destructive",
      });
    },
  });

  const filteredRegistrations = registrations.filter(
    (reg) =>
      reg.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      reg.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      reg.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      reg.last_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleApprove = () => {
    if (!approvalDialog || !selectedRoleId) {
      toast({
        title: "Role Required",
        description: "Please select a role before approving",
        variant: "destructive",
      });
      return;
    }

    approveMutation.mutate({
      registrationId: approvalDialog.id,
      roleId: selectedRoleId,
    });
  };

  const handleReject = () => {
    if (!rejectionDialog) return;

    rejectMutation.mutate({
      registrationId: rejectionDialog.id,
      reason: rejectionReason,
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Pending Registrations ({registrations.length})
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 mb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search registrations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-2">Loading registrations...</span>
        </div>
      ) : filteredRegistrations.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <UserPlus className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No pending registrations</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRegistrations.map((registration) => (
            <Card key={registration.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <h3 className="font-semibold text-foreground">
                      {registration.first_name} {registration.last_name}
                    </h3>
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Pending
                    </Badge>
                  </div>

                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p className="flex items-center gap-2">
                      <User className="h-3 w-3" />
                      <strong>Username:</strong> {registration.username}
                    </p>
                    <p className="flex items-center gap-2">
                      <Mail className="h-3 w-3" />
                      <strong>Email:</strong> {registration.email}
                    </p>
                    {registration.phone && (
                      <p className="flex items-center gap-2">
                        <Phone className="h-3 w-3" />
                        <strong>Phone:</strong> {registration.phone}
                      </p>
                    )}
                    <p className="text-xs">
                      Requested{" "}
                      {formatDistanceToNow(new Date(registration.submitted_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>

                  <div className="flex justify-between pt-2 border-t gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRejectionDialog(registration)}
                      className="flex items-center gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <X className="h-3 w-3" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setApprovalDialog(registration)}
                      className="flex items-center gap-1"
                    >
                      <Check className="h-3 w-3" />
                      Approve
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Approval Dialog */}
      <Dialog open={!!approvalDialog} onOpenChange={() => setApprovalDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Registration</DialogTitle>
            <DialogDescription>
              Assign a role and approve this user's registration request.
            </DialogDescription>
          </DialogHeader>

          {approvalDialog && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <p>
                  <strong>Name:</strong> {approvalDialog.first_name}{" "}
                  {approvalDialog.last_name}
                </p>
                <p>
                  <strong>Username:</strong> {approvalDialog.username}
                </p>
                <p>
                  <strong>Email:</strong> {approvalDialog.email}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Assign Role *</Label>
                <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                        {role.description && (
                          <span className="text-muted-foreground ml-2">
                            - {role.description}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApprovalDialog(null)}
              disabled={approveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={approveMutation.isPending || !selectedRoleId}
            >
              {approveMutation.isPending ? "Approving..." : "Approve & Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Dialog */}
      <Dialog open={!!rejectionDialog} onOpenChange={() => setRejectionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Registration</DialogTitle>
            <DialogDescription>
              Reject this registration request. Optionally provide a reason.
            </DialogDescription>
          </DialogHeader>

          {rejectionDialog && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <p>
                  <strong>Name:</strong> {rejectionDialog.first_name}{" "}
                  {rejectionDialog.last_name}
                </p>
                <p>
                  <strong>Username:</strong> {rejectionDialog.username}
                </p>
                <p>
                  <strong>Email:</strong> {rejectionDialog.email}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Rejection Reason (Optional)</Label>
                <Textarea
                  id="reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectionDialog(null)}
              disabled={rejectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? "Rejecting..." : "Reject Registration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
