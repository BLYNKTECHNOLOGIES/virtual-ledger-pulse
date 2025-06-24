
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
            users (
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Users with {role.name} Role</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2">Loading users...</span>
            </div>
          ) : (
            <>
              {users.length > 0 ? (
                <div className="space-y-3">
                  {users.map((user) => (
                    <div key={user.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <h3 className="font-semibold">
                            {user.first_name && user.last_name 
                              ? `${user.first_name} ${user.last_name}`
                              : user.username
                            }
                          </h3>
                          <p className="text-sm text-gray-600">@{user.username}</p>
                          <p className="text-sm text-gray-600">{user.email}</p>
                          <p className="text-xs text-gray-500">
                            Created: {formatDate(user.created_at)}
                          </p>
                        </div>
                        <Badge variant={user.status === 'ACTIVE' ? 'default' : 'secondary'}>
                          {user.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <h3 className="text-lg font-medium">No Users Found</h3>
                  <p className="text-sm">No users have been assigned the {role.name} role yet.</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
