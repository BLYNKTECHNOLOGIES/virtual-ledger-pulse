import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
import { UserPlus, Check, X, RefreshCw, Lock } from "lucide-react";
import { Panel } from "@/components/finance-ui/primitives";
import { fmtAgo, fmtDay, fmtTime } from "@/components/profile/format";
import { DetailList, Initials, PanelMessage, PanelSkeleton, SearchField, UM_TABLE } from "./umUi";
import { usePendingRegistrations, type PendingRegistration } from "./usePendingRegistrations";
import { retryRemoval, type RemovalRecord } from "./useUmLifecycle";
import { AlertTriangle } from "lucide-react";

interface Role {
  id: string;
  name: string;
  description: string | null;
}

export function PendingRegistrationsTab({ pendingCleanups = [], onCleanupChange }: {
  /** Rejected sign-ups whose account clean-up is still owed (shared removal record). */
  pendingCleanups?: RemovalRecord[];
  onCleanupChange?: () => void;
} = {}) {
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [approvalDialog, setApprovalDialog] = useState<PendingRegistration | null>(null);
  const [rejectionDialog, setRejectionDialog] = useState<PendingRegistration | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [rejectionReason, setRejectionReason] = useState("");
  const { toast } = useToast();
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();

  const isSuperAdmin = hasRole("super admin");


  // Fetch pending registrations (shared with the page header count)
  const { data: registrations = [], isLoading, refetch } = usePendingRegistrations();

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
      // Approval runs server-side: it verifies Super Admin, applies the role and lifts the login ban
      // that keeps pending accounts from obtaining a session. Department and designation are not
      // chosen here: they come from HRMS once the login is linked to an employee.
      const { data, error } = await supabase.functions.invoke("approve-erp-registration", {
        body: { registrationId, roleId },
      });

      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error?: string }).error);
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Registration Approved",
        description: "The user has been activated and can now log in.",
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
      const { data, error } = await supabase.functions.invoke("reject-erp-registration", {
        body: {
          registrationId,
          reason: reason || null,
        },
      });

      const payloadError = (data as { error?: unknown })?.error;
      if (error || payloadError) {
        let message = "Failed to reject registration";
        if (typeof payloadError === "string") message = payloadError;
        else if (error?.message) message = error.message;
        try {
          const ctx = (error as { context?: Response })?.context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            if (typeof body?.error === "string") message = body.error;
          }
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      return data;
    },
    onSuccess: (data: any) => {
      if (data?.cleanupPending) {
        toast({
          title: "Rejected, with clean-up pending",
          description: `Rejected, but the sign-up's account could not be removed: ${data.cleanupError || "unknown reason"}. It is retried automatically until the email and phone are free.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Registration Rejected",
          description: "The registration was rejected and its account removed, so the email and phone can be used again.",
        });
      }
      onCleanupChange?.();
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
      (reg.first_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (reg.last_name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleApprove = () => {
    if (!approvalDialog) return;
    if (!selectedRoleId) {
      toast({
        title: "Missing Information",
        description: "Please choose a role before approving",
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

  /** Close the approval dialog and forget the picks, so the next person starts clean. */
  const closeApproval = () => {
    setApprovalDialog(null);
    setSelectedRoleId("");
  };

  /** Close the rejection dialog and forget the typed reason. */
  const closeRejection = () => {
    setRejectionDialog(null);
    setRejectionReason("");
  };

  const fullName = (r: PendingRegistration) => [r.first_name, r.last_name].filter(Boolean).join(" ") || r.username;
  const requested = (r: PendingRegistration) => (
    <span title={`${fmtDay(r.submitted_at)}, ${fmtTime(r.submitted_at)} IST`}>{fmtAgo(r.submitted_at)}</span>
  );

  if (!isSuperAdmin) {
    return (
      <Panel bodyClassName="p-0 sm:p-0">
        <PanelMessage icon={Lock} title="Restricted">
          Only a Super Admin can review sign-ups.
        </PanelMessage>
      </Panel>
    );
  }

  return (
    <>
      {pendingCleanups.length > 0 && (
        <Panel
          title="Rejected sign-ups — clean-up pending"
          description="These sign-ups are rejected, but their account isn't fully removed yet, so the email and phone are still taken. The daily job retries automatically."
          className="mb-4"
        >
          <ul className="space-y-2">
            {pendingCleanups.map((r) => (
              <li key={r.user_id} className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-warning/40 bg-warning/5 p-3">
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-foreground">{r.target_name || r.target_username || "Sign-up"}{r.target_email ? ` · ${r.target_email}` : ""}</p>
                  <p className="flex items-start gap-1.5 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {r.last_error ? `Could not be removed: ${r.last_error}` : "Removal pending"} · {r.attempts} attempt{r.attempts === 1 ? "" : "s"}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="h-8 text-xs" disabled={retryingId === r.user_id}
                  onClick={async () => {
                    setRetryingId(r.user_id);
                    const res = await retryRemoval(r.user_id);
                    setRetryingId(null);
                    toast(res.success
                      ? { title: "Account removed", description: "The email and phone can be used again." }
                      : { title: "Still not removed", description: res.error || "Unknown reason", variant: "destructive" });
                    onCleanupChange?.();
                  }}>
                  {retryingId === r.user_id ? "Retrying…" : "Retry now"}
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel
        title="Sign-up approvals"
        description="People who registered on the sign-up page. Approving turns on their login with the role you choose; their department and designation come from HRMS."
        bodyClassName="p-0 sm:p-0"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8 gap-1.5" aria-label="Refresh sign-ups">
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        }
      >
        {registrations.length > 0 && (
          <div className="border-b border-border/70 px-3 py-3 sm:px-5">
            <SearchField
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search name, username or email"
              label="Search sign-ups"
              className="sm:max-w-sm"
            />
          </div>
        )}

        {isLoading ? (
          <PanelSkeleton rows={3} />
        ) : filteredRegistrations.length === 0 ? (
          <PanelMessage icon={UserPlus} title={registrations.length === 0 ? "No sign-ups waiting" : "No sign-up matches your search"}>
            {registrations.length === 0 && "New registrations appear here for a Super Admin to approve or reject."}
          </PanelMessage>
        ) : (
          <div className="responsive-list">
            <div className="responsive-list-table">
              <table className={UM_TABLE}>
                <thead>
                  <tr>
                    <th>Person</th>
                    <th className="hidden @[56rem]:table-cell">Contact</th>
                    <th className="hidden @[56rem]:table-cell">Badge</th>
                    <th>Requested</th>
                    <th className="w-[1%]"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRegistrations.map((registration) => (
                    <tr key={registration.id}>
                      <td>
                        <div className="flex min-w-[11rem] items-center gap-2.5">
                          <Initials name={fullName(registration)} />
                          <div className="min-w-0 [overflow-wrap:normal]">
                            <p className="font-medium text-foreground">{fullName(registration)}</p>
                            <p className="text-xs text-muted-foreground">@{registration.username}</p>
                            <p className="break-all text-xs text-muted-foreground @[56rem]:hidden">{registration.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden @[56rem]:table-cell">
                        <p className="break-all">{registration.email}</p>
                        {registration.phone && <p className="text-xs tabular-nums text-muted-foreground">{registration.phone}</p>}
                      </td>
                      <td className="hidden font-mono text-xs @[56rem]:table-cell">{registration.badge_id || <span className="text-muted-foreground">—</span>}</td>
                      <td className="whitespace-nowrap text-xs text-muted-foreground">{requested(registration)}</td>
                      <td>
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRejectionDialog(registration)}
                            className="h-8 gap-1.5 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                          <Button size="sm" onClick={() => setApprovalDialog(registration)} className="h-8 gap-1.5 px-3 text-xs">
                            <Check className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="responsive-list-cards divide-y divide-border">
              {filteredRegistrations.map((registration) => (
                <li key={registration.id} className="space-y-2.5 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <Initials name={fullName(registration)} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">{fullName(registration)}</p>
                      <p className="break-all text-xs text-muted-foreground">@{registration.username} · {registration.email}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {registration.phone && <span className="tabular-nums">{registration.phone} · </span>}
                        {registration.badge_id && <span className="font-mono">Badge {registration.badge_id} · </span>}
                        Requested {requested(registration)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 pl-11">
                    <Button size="sm" onClick={() => setApprovalDialog(registration)} className="h-8 gap-1.5 px-3 text-xs">
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRejectionDialog(registration)}
                      className="h-8 gap-1.5 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      {/* Approval Dialog */}
      <Dialog
        open={!!approvalDialog}
        onOpenChange={(o) => {
          if (!o) {
            setApprovalDialog(null);
            setSelectedRoleId("");
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto md:max-w-lg">
          <DialogHeader>
            <DialogTitle>Approve sign-up</DialogTitle>
            <DialogDescription>
              Choose the role this person starts with. Their login works as soon as you approve.
            </DialogDescription>
          </DialogHeader>

          {approvalDialog && (
            <div className="space-y-4">
              <DetailList
                items={[
                  { label: "Name", value: fullName(approvalDialog) },
                  { label: "Username", value: `@${approvalDialog.username}` },
                  { label: "Email", value: approvalDialog.email },
                  ...(approvalDialog.badge_id ? [{ label: "Badge", value: <span className="font-mono">{approvalDialog.badge_id}</span> }] : []),
                ]}
              />

              <div className="space-y-1.5">
                <Label htmlFor="approve-role">Role <span className="text-destructive">*</span></Label>
                <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                  <SelectTrigger id="approve-role">
                    <SelectValue placeholder="Choose a role" />
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

              <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                Department and designation aren't chosen here: they come from the person's HRMS record once this login is linked to it.
              </p>
            </div>
          )}


          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={closeApproval}
              disabled={approveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={approveMutation.isPending || !selectedRoleId}
            >
              {approveMutation.isPending ? "Approving..." : "Approve & activate"}
            </Button>

          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Dialog */}
      <Dialog open={!!rejectionDialog} onOpenChange={() => closeRejection()}>
        <DialogContent className="md:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reject sign-up</DialogTitle>
            <DialogDescription>
              Rejecting closes the request and removes the account that the sign-up created. You can add a reason for the record.
            </DialogDescription>
          </DialogHeader>

          {rejectionDialog && (
            <div className="space-y-4">
              <DetailList
                items={[
                  { label: "Name", value: fullName(rejectionDialog) },
                  { label: "Username", value: `@${rejectionDialog.username}` },
                  { label: "Email", value: rejectionDialog.email },
                ]}
              />

              <div className="space-y-1.5">
                <Label htmlFor="reason">Reason <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Textarea
                  id="reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Why is this sign-up being rejected?"
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={closeRejection}
              disabled={rejectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? "Rejecting..." : "Reject sign-up"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
