
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtDay } from "@/components/profile/format";
import { Initials, PanelMessage, PanelSkeleton, UserStatusChip, personName } from "./umUi";

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  user_count: number;
}

interface UserWithRole {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  status: string;
  created_at: string;
}

interface RoleUsersDialogProps {
  role: Role;
  onClose: () => void;
}

export function RoleUsersDialog({ role, onClose }: RoleUsersDialogProps) {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUsersWithRole = async () => {
      try {
        setIsLoading(true);

        const { data, error } = await supabase
          .from('user_roles')
          .select(`
            user_id,
            users!inner (
              id,
              username,
              email,
              first_name,
              last_name,
              status,
              created_at
            )
          `)
          .eq('role_id', role.id);

        if (error) {
          console.error('Error fetching users with role:', error);
          return;
        }

        const usersWithRole = data?.map(item => ({
          id: item.users.id,
          username: item.users.username,
          email: item.users.email,
          first_name: item.users.first_name,
          last_name: item.users.last_name,
          status: item.users.status,
          created_at: item.users.created_at
        })) || [];


        setUsers(usersWithRole);
      } catch (error) {
        console.error('Error fetching users with role:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsersWithRole();
  }, [role.id]);

  const sorted = [...users].sort((a, b) => personName(a).localeCompare(personName(b)));

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-h-[85vh] overflow-y-auto md:max-w-xl">
        <DialogHeader>
          <DialogTitle>People with the {role.name.trim()} role</DialogTitle>
          <DialogDescription>
            {isLoading ? "Loading…" : users.length === 0 ? "Nobody has this role yet." : `${users.length} ${users.length === 1 ? "person" : "people"}`}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <PanelSkeleton rows={3} />
        ) : sorted.length > 0 ? (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {sorted.map((user) => (
              <li key={user.id} className="flex items-center gap-3 px-3 py-2.5">
                <Initials name={personName(user)} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{personName(user)}</p>
                  <p className="break-all text-xs text-muted-foreground">@{user.username} · {user.email}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <UserStatusChip status={user.status} />
                  <span className="text-[11px] text-muted-foreground">Added {fmtDay(user.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <PanelMessage icon={Users} title="No one has this role">
            Give it to someone from Users → Edit.
          </PanelMessage>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
