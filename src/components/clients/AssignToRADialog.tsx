import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, UserCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useRAUsers, useAssignClientsToRA, RAUser } from "@/hooks/useRA";

interface AssignToRADialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientIds: string[];
  alreadyAssignedCount: number;
  onAssigned: () => void;
}

export function AssignToRADialog({
  open,
  onOpenChange,
  clientIds,
  alreadyAssignedCount,
  onAssigned,
}: AssignToRADialogProps) {
  const { data: raUsers, isLoading } = useRAUsers();
  const assign = useAssignClientsToRA();
  const [selectedId, setSelectedId] = useState<string>("");

  const handleAssign = async () => {
    const raUser = raUsers?.find((u) => u.id === selectedId);
    if (!raUser) {
      toast.error("Please select a Relationship Associate.");
      return;
    }
    try {
      await assign.mutateAsync({ clientIds, raUser: raUser as RAUser });
      toast.success(`Assigned ${clientIds.length} client(s) to ${raUser.name}.`);
      setSelectedId("");
      onAssigned();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to assign clients.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Assign {clientIds.length} client(s) to RA
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {alreadyAssignedCount > 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {alreadyAssignedCount} of the selected client(s) already have an active RA.
                Continuing will reassign them to the new RA.
              </span>
            </div>
          )}

          <div className="space-y-1">
            <Label>Relationship Associate</Label>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading RAs...</p>
            ) : !raUsers || raUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No users have the RA Dashboard permission yet. Grant it in User Management first.
              </p>
            ) : (
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="text-foreground">
                  <SelectValue placeholder="Select an RA" />
                </SelectTrigger>
                <SelectContent>
                  {raUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={assign.isPending || !selectedId}>
            {assign.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
