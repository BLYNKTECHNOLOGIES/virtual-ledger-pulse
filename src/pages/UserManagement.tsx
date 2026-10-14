import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Edit, Key, RefreshCw, Settings2, Shield, ShieldAlert, Terminal, Trash2, UserPlus, Users } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useUsers } from "@/hooks/useUsers";
import { AddUserDialog } from "@/components/user-management/AddUserDialog";
import { AddRoleDialog } from "@/components/user-management/AddRoleDialog";
import { EditUserDialog } from "@/components/user-management/EditUserDialog";
import { EditRoleDialog } from "@/components/user-management/EditRoleDialog";
import { RoleUsersDialog } from "@/components/user-management/RoleUsersDialog";
import { PendingRegistrationsTab } from "@/components/user-management/PendingRegistrationsTab";
import { ResetPasswordDialog } from "@/components/user-management/ResetPasswordDialog";
import { FunctionsTab } from "@/components/user-management/FunctionsTab";
import { PermissionChangeLog } from "@/components/user-management/PermissionChangeLog";
import { TerminalAccessTab } from "@/components/user-management/TerminalAccessTab";
import { usePendingRegistrations } from "@/components/user-management/usePendingRegistrations";
import {
  Chip,
  Initials,
  PanelMessage,
  PanelSkeleton,
  RoleChip,
  SUBNAV_LIST,
  SUBNAV_TRIGGER,
  SearchField,
  Segmented,
  TabCount,
  TierChips,
  UM_TABLE,
  UserStatusChip,
  isSystemRole,
  personName,
} from "@/components/user-management/umUi";
import { KpiTile, Panel, TablePager, usePaged } from "@/components/finance-ui/primitives";
import { fmtAgo, fmtDay, fmtTime } from "@/components/profile/format";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { DatabaseUser } from "@/types/auth";
import { normalizePermissions } from "@/lib/permissions/catalog";
import { supabase } from "@/integrations/supabase/client";
import { PermissionGate } from "@/components/PermissionGate";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatGridSkeleton } from "@/components/shared/skeletons";
import { cn } from "@/lib/utils";

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  user_count: number;
}

interface OnlineUser {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  last_seen: string;
  status: string;
}

// Legacy permission normalization lives in the single-source catalog.
// IMPORTANT: do NOT filter unknown/legacy permissions — this project historically
// stored multiple formats in app_permission, and filtering would DELETE them on save.

/** Role filter value for "people without a role". */
const NO_ROLE = "__none__";
type StatusFilter = "all" | "ACTIVE" | "INACTIVE" | "SUSPENDED";
/** Old tab names that still open the right tab. */
const TAB_ALIASES: Record<string, string> = { settings: "online" };
const USERS_PAGE_SIZE = 50;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function UserManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [roles, setRoles] = useState<Role[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);
  const [isLoadingOnlineUsers, setIsLoadingOnlineUsers] = useState(true);
  const [editingUser, setEditingUser] = useState<DatabaseUser | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [viewingRoleUsers, setViewingRoleUsers] = useState<Role | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<DatabaseUser | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const { users, isLoading, fetchUsers, createUser, deleteUser, updateUser } = useUsers();
  const { permissions, isLoading: isLoadingPermissions, hasPermission } = usePermissions();
  const { hasRole, isAdmin } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = hasRole("super admin");
  const [searchParams, setSearchParams] = useSearchParams();
  // Same query (and cache entry) as the Approvals tab — only Super Admins review sign-ups.
  const { data: pendingRegistrations = [], isLoading: isLoadingPending } = usePendingRegistrations(isSuperAdmin);

  // Scroll to top when component mounts or tab changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Compute unique roles from loaded users for the filter dropdown
  const userRoleOptions = useMemo(() => {
    const roleSet = new Set<string>();
    users.forEach((u) => {
      if (u.role?.name) roleSet.add(u.role.name);
    });
    return Array.from(roleSet).sort((a, b) => a.localeCompare(b));
  }, [users]);

  // Filter users by search term, selected role and status (display only)
  const search = searchTerm.trim().toLowerCase();
  // If the chosen role filter no longer exists in the list (e.g. its last person moved), show everyone.
  const roleFilter =
    selectedRole === "all" ||
    (selectedRole === NO_ROLE ? users.some((u) => !u.role?.name) : users.some((u) => u.role?.name === selectedRole))
      ? selectedRole
      : "all";
  const matchesSearchAndRole = (user: DatabaseUser) => {
    const matchesSearch =
      !search ||
      [user.username, user.email, user.first_name, user.last_name, user.phone, user.badge_id, personName(user)]
        .some((v) => !!v && String(v).toLowerCase().includes(search));
    const matchesRole =
      roleFilter === "all" ||
      (roleFilter === NO_ROLE ? !user.role?.name : user.role?.name === roleFilter);
    return matchesSearch && matchesRole;
  };
  const usersForStatus = users.filter(matchesSearchAndRole);
  const filteredUsers = usersForStatus.filter((user: DatabaseUser) => statusFilter === "all" || user.status === statusFilter);
  const statusCount = (s: Exclude<StatusFilter, "all">) => usersForStatus.filter((u) => u.status === s).length;
  const pagedUsers = usePaged(filteredUsers, USERS_PAGE_SIZE, `${search}|${roleFilter}|${statusFilter}`);

  const roleCounts = useMemo(() => {
    const m = new Map<string, number>();
    users.forEach((u) => {
      const k = u.role?.name || NO_ROLE;
      m.set(k, (m.get(k) || 0) + 1);
    });
    return m;
  }, [users]);
  const usersWithoutRole = roleCounts.get(NO_ROLE) || 0;

  const fetchRoles = async () => {
    try {
      setIsLoadingRoles(true);

      // Fetch roles with their permissions and user counts in one efficient query
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select(`
          id,
          name,
          description,
          role_permissions(permission)
        `);

      if (rolesError) {
        console.error('Error fetching roles:', rolesError);
        return;
      }

      // Get user counts for all roles in a single query
      const { data: userCounts, error: countError } = await supabase
        .from('user_roles')
        .select('role_id, user_id');

      if (countError) {
        console.error('Error fetching user counts:', countError);
      }

      // Create a map of role_id to user count
      const userCountMap = new Map<string, number>();
      userCounts?.forEach(userRole => {
        const currentCount = userCountMap.get(userRole.role_id) || 0;
        userCountMap.set(userRole.role_id, currentCount + 1);
      });

      // Format roles with correct user counts and normalized permissions
      const rolesWithCount = (rolesData || []).map((role) => {
        // Extract permissions from the nested structure and normalize them
        const rawPermissions = role.role_permissions?.map((rp: any) => rp.permission) || [];
        const permissions = normalizePermissions(rawPermissions);

        return {
          id: role.id,
          name: role.name,
          description: role.description || '',
          permissions,
          user_count: userCountMap.get(role.id) || 0
        };
      });

      setRoles(rolesWithCount);
    } catch (error) {
      console.error('Error fetching roles:', error);
    } finally {
      setIsLoadingRoles(false);
    }
  };

  const fetchOnlineUsers = async () => {
    try {
      setIsLoadingOnlineUsers(true);

      // Consider users online if they've been active in the last 5 minutes
      const recentThreshold = new Date();
      recentThreshold.setMinutes(recentThreshold.getMinutes() - 5);

      const { data: activeUsers, error } = await supabase
        .from('users')
        .select('id, username, email, first_name, last_name, last_activity, status')
        .eq('status', 'ACTIVE')
        .not('last_activity', 'is', null)
        .gte('last_activity', recentThreshold.toISOString())
        .order('last_activity', { ascending: false });

      if (error) {
        console.error('Error fetching online users:', error);
        return;
      }

      const onlineUsersData = activeUsers?.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        last_seen: user.last_activity || new Date().toISOString(),
        status: 'Online'
      })) || [];

      setOnlineUsers(onlineUsersData);
    } catch (error) {
      console.error('Error fetching online users:', error);
    } finally {
      setIsLoadingOnlineUsers(false);
    }
  };

  const createRole = async (roleData: { name: string; description: string; permissions: string[] }) => {
    try {

      const { data, error } = await supabase.rpc('create_role_with_permissions', {
        role_name: roleData.name,
        role_description: roleData.description,
        permissions: roleData.permissions
      });

      if (error) {
        console.error('Error creating role:', error);
        return { success: false, error };
      }

      await fetchRoles();
      return { success: true, data };
    } catch (error) {
      console.error('Error creating role:', error);
      return { success: false, error };
    }
  };

  const updateRole = async (roleId: string, roleData: { name: string; description: string; permissions: string[] }) => {
    try {

      const { data, error } = await supabase.rpc('update_role_permissions', {
        p_role_id: roleId,
        p_role_name: roleData.name,
        p_role_description: roleData.description,
        p_permissions: roleData.permissions
      });

      if (error) {
        console.error('Error updating role:', error);
        return { success: false, error };
      }

      await fetchRoles();
      return { success: true };
    } catch (error) {
      console.error('Error updating role:', error);
      return { success: false, error };
    }
  };

  const [roleToDelete, setRoleToDelete] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  const deleteRole = async (roleId: string) => {
    try {
      const { error } = await supabase
        .from('roles')
        .delete()
        .eq('id', roleId);

      if (error) {
        console.error('Error deleting role:', error);
        return;
      }

      await fetchRoles();
    } catch (error) {
      console.error('Error deleting role:', error);
    } finally {
      setRoleToDelete(null);
    }
  };

  // Check user management permissions
  const hasHrManage = hasPermission('user_management_hr_manage');
  const hasManagePermission = hasPermission('user_management_manage');
  const hasViewPermission = hasPermission('user_management_view') || hasManagePermission || hasHrManage;
  // HR-restricted: can edit user details & delete non-admins, but NOT roles/terminal/approvals
  const isHrRestricted = hasHrManage && !hasManagePermission && !isSuperAdmin;
  const canEditUsers = hasManagePermission || hasHrManage || isSuperAdmin;
  // Same test PermissionGate(['user_management_manage']) applies; computed once so table rows
  // and phone cards don't each mount their own gate (each gate re-fetches permissions).
  const canManageRoles = isAdmin || hasManagePermission;

  const isProtectedRole = (roleName?: string) => {
    const r = roleName?.toLowerCase();
    return r === 'admin' || r === 'super admin';
  };

  useEffect(() => {
    fetchRoles();
    fetchOnlineUsers();

    // Set up interval to refresh online users every 30 seconds
    const interval = setInterval(fetchOnlineUsers, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleDeleteUser = async (user: DatabaseUser) => {

    if (!canEditUsers) {
      console.error('User does not have permission to delete users');
      toast({
        title: "Permission denied",
        description: "You do not have permission to delete users",
        variant: "destructive",
      });
      return;
    }

    // HR-restricted staff cannot delete Admin or Super Admin accounts
    if (isHrRestricted && isProtectedRole(user.role?.name)) {
      toast({
        title: "Protected user",
        description: "You cannot delete Admin or Super Admin accounts",
        variant: "destructive",
      });
      return;
    }

    setUserToDelete(user.id);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete || isDeletingUser) return;
    setIsDeletingUser(true);
    try {
      const result = await deleteUser(userToDelete);
      if (result?.success) {
        setUserToDelete(null);
      } else {
        console.error('Delete failed:', result?.error);
      }
    } catch (error) {
      console.error('Exception during delete:', error);
    } finally {
      setIsDeletingUser(false);
    }
  };

  /* ── Tabs (kept in the URL so a refresh or shared link opens the same tab) ── */
  const allowedTabs = useMemo(() => {
    const t = ["users"];
    if (isSuperAdmin) t.push("pending");
    if (!isHrRestricted) t.push("roles", "terminal", "online", "functions");
    return t;
  }, [isSuperAdmin, isHrRestricted]);
  const requestedTab = searchParams.get("tab") || "users";
  const resolvedTab = TAB_ALIASES[requestedTab] ?? requestedTab;
  const activeTab = allowedTabs.includes(resolvedTab) ? resolvedTab : "users";
  const changeTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "users") next.delete("tab");
    else next.set("tab", value);
    setSearchParams(next, { replace: true });
  };
  const showUsers = (role: string) => {
    setSelectedRole(role);
    setStatusFilter("all");
    changeTab("users");
  };

  /* ── Display helpers ── */
  const sortedRoles = useMemo(
    () =>
      [...roles].sort((a, b) => {
        const rank = (r: Role) => (r.name.trim().toLowerCase() === "super admin" ? 0 : r.name.trim().toLowerCase() === "admin" ? 1 : 2);
        return rank(a) - rank(b) || a.name.trim().localeCompare(b.name.trim());
      }),
    [roles],
  );
  const unusedRoles = roles.filter((r) => r.user_count === 0).length;
  const activeCount = users.filter((u) => u.status === "ACTIVE").length;
  const notActiveParts = [
    ["inactive", users.filter((u) => u.status === "INACTIVE").length],
    ["suspended", users.filter((u) => u.status === "SUSPENDED").length],
  ].filter(([, n]) => (n as number) > 0).map(([label, n]) => `${n} ${label}`);
  const roleBeingDeleted = roles.find((r) => r.id === roleToDelete) || null;
  const userBeingDeleted = users.find((u) => u.id === userToDelete) || null;
  const pendingCount = pendingRegistrations.length;
  const tileCount = 2 + (!isHrRestricted ? 1 : 0) + (isSuperAdmin ? 1 : 0);

  // If user has no permissions, show access denied
  if (!hasViewPermission && !isLoadingPermissions) {
    return (
      <PermissionGate permissions={['user_management_view', 'user_management_manage', 'user_management_hr_manage']}>
        <div />
      </PermissionGate>
    );
  }

  if (isLoadingPermissions) {
    return (
      <div className="mx-auto w-full max-w-[1440px] space-y-4 p-3 sm:space-y-5 sm:p-6 page-mount">
        <PageHeader title="User Management" description="Loading permissions..." />

        <StatGridSkeleton count={3} />
      </div>
    );
  }

  const userActions = (user: DatabaseUser, compact = false) => (
    <div className={cn("flex items-center gap-1", compact ? "flex-wrap" : "justify-end")}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setEditingUser(user)}
        className="h-8 gap-1.5 px-2.5 text-xs"
        aria-label={`Edit ${personName(user)}`}
      >
        <Edit className="h-3.5 w-3.5" />
        Edit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setResetPasswordUser(user)}
        className={cn("h-8 gap-1.5 text-xs", compact ? "px-2.5" : "w-8 p-0")}
        aria-label={`Reset password for ${personName(user)}`}
        title="Reset password"
      >
        <Key className="h-3.5 w-3.5" />
        {compact && "Reset password"}
      </Button>
      {!(isHrRestricted && isProtectedRole(user.role?.name)) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleDeleteUser(user)}
          className={cn("h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive", compact ? "px-2.5" : "w-8 p-0")}
          aria-label={`Delete ${personName(user)}`}
          title="Delete user"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {compact && "Delete"}
        </Button>
      )}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-4 p-3 sm:space-y-5 sm:p-6">
      <PageHeader
        title="User Management"
        description="Who can sign in to the ERP and the Terminal, and what each role lets them do."
      />

      {/* At a glance */}
      <section
        aria-label="At a glance"
        className={cn("grid grid-cols-2 gap-3", tileCount >= 4 ? "lg:grid-cols-4" : tileCount === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4")}
      >
        <KpiTile
          label="Users"
          value={String(users.length)}
          icon={Users}
          loading={isLoading}
          sub={[`${activeCount} active`, ...notActiveParts].join(" · ")}
          onClick={() => showUsers("all")}
          cta="See everyone"
        />
        <KpiTile
          label="Without a role"
          value={String(usersWithoutRole)}
          icon={ShieldAlert}
          tone={usersWithoutRole > 0 ? "warning" : "default"}
          loading={isLoading}
          sub={usersWithoutRole > 0 ? "Permissions come from a role" : "Everyone has a role"}
          onClick={usersWithoutRole > 0 ? () => showUsers(NO_ROLE) : undefined}
          cta={usersWithoutRole > 0 ? "Show them" : undefined}
        />
        {!isHrRestricted && (
          <KpiTile
            label="Roles"
            value={String(roles.length)}
            icon={Shield}
            loading={isLoadingRoles}
            sub={unusedRoles > 0 ? `${unusedRoles} not given to anyone` : "All in use"}
            onClick={() => changeTab("roles")}
            cta="Open roles"
          />
        )}
        {isSuperAdmin && (
          <KpiTile
            label="Waiting for approval"
            value={String(pendingCount)}
            icon={UserPlus}
            tone={pendingCount > 0 ? "warning" : "default"}
            loading={isLoadingPending}
            sub={pendingCount > 0 ? "Sign-ups to review" : "No sign-ups waiting"}
            onClick={() => changeTab("pending")}
            cta="Review sign-ups"
          />
        )}
      </section>

      <Tabs value={activeTab} onValueChange={changeTab} className="w-full">
        {/* With a single tab (HR-restricted view) there is nothing to switch between, so no tab bar. */}
        {allowedTabs.length > 1 && (
        <TabsList className={SUBNAV_LIST}>
          <TabsTrigger value="users" className={SUBNAV_TRIGGER}>
            <Users className="h-3.5 w-3.5" />
            Users
            {!isLoading && <TabCount value={users.length} />}
          </TabsTrigger>
          {!isHrRestricted && (
            <TabsTrigger value="roles" className={SUBNAV_TRIGGER}>
              <Shield className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">Roles &amp; permissions</span>
              <span className="xl:hidden">Roles</span>
              {!isLoadingRoles && <TabCount value={roles.length} />}
            </TabsTrigger>
          )}
          {!isHrRestricted && (
            <TabsTrigger value="terminal" className={SUBNAV_TRIGGER}>
              <Terminal className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">Terminal access</span>
              <span className="xl:hidden">Terminal</span>
            </TabsTrigger>
          )}
          {isSuperAdmin && (
            <TabsTrigger value="pending" className={SUBNAV_TRIGGER}>
              <UserPlus className="h-3.5 w-3.5" />
              Approvals
              {pendingCount > 0 && <TabCount value={pendingCount} attention />}
            </TabsTrigger>
          )}
          {!isHrRestricted && (
            <TabsTrigger value="online" className={SUBNAV_TRIGGER}>
              <Activity className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">Online now</span>
              <span className="xl:hidden">Online</span>
              {onlineUsers.length > 0 && <TabCount value={onlineUsers.length} />}
            </TabsTrigger>
          )}
          {!isHrRestricted && (
            <TabsTrigger value="functions" className={SUBNAV_TRIGGER}>
              <Settings2 className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">Functions &amp; history</span>
              <span className="xl:hidden">History</span>
            </TabsTrigger>
          )}
        </TabsList>
        )}

        {/* Pending Registrations Tab — Super Admin only */}
        {isSuperAdmin && (
          <TabsContent value="pending" className="mt-0">
            <PendingRegistrationsTab />
          </TabsContent>
        )}

        {/* All Users Tab */}
        <TabsContent value="users" className="mt-0">
          <PermissionGate permissions={['user_management_view', 'user_management_manage', 'user_management_hr_manage']}>
            <Panel
              title="Users"
              description={
                !canEditUsers
                  ? "Everyone with an ERP login."
                  : isHrRestricted
                    ? "Everyone with an ERP login. Use Edit to update a person's details."
                    : "Everyone with an ERP login. Use Edit to change a person's details, role or Terminal access."
              }
              bodyClassName="p-0 sm:p-0"
              actions={
                <>
                  <Button variant="outline" size="sm" onClick={fetchUsers} className="h-8 gap-1.5" aria-label="Refresh users">
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Refresh</span>
                  </Button>
                  <PermissionGate permissions={['user_management_manage']} showFallback={false}>
                    <AddUserDialog onAddUser={createUser} />
                  </PermissionGate>
                </>
              }
            >
              <div className="flex flex-col gap-2 border-b border-border/70 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-5">
                <SearchField
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="Name, username, email, phone or badge"
                  label="Search users"
                  className="sm:min-w-[240px] sm:flex-1"
                />
                <Select value={roleFilter} onValueChange={setSelectedRole}>
                  <SelectTrigger className="h-9 w-full sm:w-[220px]" aria-label="Filter by role">
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    {usersWithoutRole > 0 && (
                      <SelectItem value={NO_ROLE}>No role ({usersWithoutRole})</SelectItem>
                    )}
                    {userRoleOptions.map((roleName) => (
                      <SelectItem key={roleName} value={roleName}>
                        {roleName.trim()} ({roleCounts.get(roleName) || 0})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Segmented<StatusFilter>
                  label="Filter by status"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: "all", label: "All", count: usersForStatus.length },
                    { value: "ACTIVE", label: "Active", count: statusCount("ACTIVE") },
                    { value: "INACTIVE", label: "Inactive", count: statusCount("INACTIVE") },
                    { value: "SUSPENDED", label: "Suspended", count: statusCount("SUSPENDED") },
                  ]}
                />
              </div>

              {isLoading ? (
                <PanelSkeleton rows={6} />
              ) : filteredUsers.length === 0 ? (
                <PanelMessage icon={Users} title={users.length === 0 ? "No users yet" : "No one matches these filters"}>
                  {users.length > 0 && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => { setSearchTerm(""); setSelectedRole("all"); setStatusFilter("all"); }}
                    >
                      Clear filters
                    </Button>
                  )}
                </PanelMessage>
              ) : (
                <div className="responsive-list">
                  <div className="responsive-list-table">
                    <table className={UM_TABLE}>
                      <thead>
                        <tr>
                          <th>Person</th>
                          <th>Role</th>
                          <th>Status</th>
                          <th className="hidden @[60rem]:table-cell">Contact</th>
                          <th className="hidden @[60rem]:table-cell">Badge</th>
                          <th className="hidden @[68rem]:table-cell">Added</th>
                          {canEditUsers && <th className="w-[1%]"><span className="sr-only">Actions</span></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {pagedUsers.slice.map((user: DatabaseUser) => (
                          <tr key={user.id}>
                            <td>
                              <div className="flex min-w-[11rem] items-center gap-2.5">
                                <Initials name={personName(user)} />
                                <div className="min-w-0 [overflow-wrap:normal]">
                                  <p className="font-medium text-foreground">{personName(user)}</p>
                                  <p className="text-xs text-muted-foreground">@{user.username}</p>
                                  {/* Narrow panel: contact moves under the name */}
                                  <p className="break-all text-xs text-muted-foreground @[60rem]:hidden">{user.email}</p>
                                </div>
                              </div>
                            </td>
                            <td><RoleChip name={user.role?.name} /></td>
                            <td><UserStatusChip status={user.status} /></td>
                            <td className="hidden @[60rem]:table-cell">
                              <p className="break-all text-foreground">{user.email}</p>
                              {user.phone && <p className="text-xs tabular-nums text-muted-foreground">{user.phone}</p>}
                            </td>
                            <td className="hidden font-mono text-xs @[60rem]:table-cell">{user.badge_id || <span className="text-muted-foreground">—</span>}</td>
                            <td className="hidden whitespace-nowrap text-xs text-muted-foreground @[68rem]:table-cell">{fmtDay(user.created_at)}</td>
                            {canEditUsers && <td>{userActions(user)}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <ul className="responsive-list-cards divide-y divide-border">
                    {pagedUsers.slice.map((user: DatabaseUser) => (
                      <li key={user.id} className="space-y-2.5 px-4 py-3">
                        <div className="flex items-start gap-3">
                          <Initials name={personName(user)} className="mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <p className="font-medium text-foreground">{personName(user)}</p>
                              <UserStatusChip status={user.status} />
                            </div>
                            <p className="break-all text-xs text-muted-foreground">@{user.username} · {user.email}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                              <RoleChip name={user.role?.name} />
                              {user.badge_id && <span className="font-mono text-[11px] text-muted-foreground">Badge {user.badge_id}</span>}
                              {user.phone && <span className="text-[11px] tabular-nums text-muted-foreground">{user.phone}</span>}
                            </div>
                          </div>
                        </div>
                        {canEditUsers && <div className="pl-11">{userActions(user, true)}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!isLoading && filteredUsers.length > 0 && (
                <div className="px-3 pb-3 sm:px-5">
                  <TablePager
                    page={pagedUsers.page}
                    pages={pagedUsers.pages}
                    total={pagedUsers.total}
                    pageSize={pagedUsers.pageSize}
                    setPage={pagedUsers.setPage}
                    noun={pagedUsers.total === 1 ? "person" : "people"}
                  />
                </div>
              )}
            </Panel>
          </PermissionGate>
        </TabsContent>

        {/* Roles & Permissions Tab */}
        <TabsContent value="roles" className="mt-0">
          <PermissionGate permissions={['user_management_view', 'user_management_manage']}>
            <Panel
              title="Roles & permissions"
              description="A role is a set of permissions. Everyone given the role gets all of them."
              bodyClassName="p-0 sm:p-0"
              actions={
                <>
                  <Button variant="outline" size="sm" onClick={fetchRoles} className="h-8 gap-1.5" aria-label="Refresh roles">
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Refresh</span>
                  </Button>
                  <PermissionGate permissions={['user_management_manage']} showFallback={false}>
                    <AddRoleDialog onAddRole={createRole} />
                  </PermissionGate>
                </>
              }
            >
              {isLoadingRoles ? (
                <PanelSkeleton rows={6} />
              ) : sortedRoles.length === 0 ? (
                <PanelMessage icon={Shield} title="No roles yet" />
              ) : (
                <div className="responsive-list">
                  <div className="responsive-list-table">
                    <table className={UM_TABLE}>
                      <thead>
                        <tr>
                          <th className="w-[30%]">Role</th>
                          <th>People</th>
                          <th>What it allows</th>
                          <th className="w-[1%]"><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRoles.map((role) => (
                          <tr key={role.id}>
                            <td>
                              <div className="flex min-w-[9rem] flex-wrap items-center gap-1.5 [overflow-wrap:normal]">
                                <span className="font-medium text-foreground">{role.name.trim()}</span>
                                {isSystemRole(role.name) && <Chip tone="info">System</Chip>}
                              </div>
                              {role.description && <p className="mt-0.5 text-xs text-muted-foreground">{role.description}</p>}
                            </td>
                            <td className="whitespace-nowrap">
                              <Button
                                variant="link"
                                size="sm"
                                onClick={() => setViewingRoleUsers(role)}
                                className={cn("h-auto p-0 text-[13px]", role.user_count === 0 && "text-muted-foreground")}
                                aria-label={`${plural(role.user_count, "person", "people")} with the ${role.name.trim()} role`}
                              >
                                {plural(role.user_count, "person", "people")}
                              </Button>
                            </td>
                            <td><TierChips permissions={role.permissions} /></td>
                            <td>
                              {canManageRoles && (
                                <div className="flex justify-end gap-1">
                                  <Button variant="outline" size="sm" onClick={() => setEditingRole(role)} className="h-8 gap-1.5 px-2.5 text-xs">
                                    <Edit className="h-3.5 w-3.5" /> Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setRoleToDelete(role.id)}
                                    className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    aria-label={`Delete the ${role.name.trim()} role`}
                                    title="Delete role"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <ul className="responsive-list-cards divide-y divide-border">
                    {sortedRoles.map((role) => (
                      <li key={role.id} className="space-y-2 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-foreground">{role.name.trim()}</span>
                          {isSystemRole(role.name) && <Chip tone="info">System</Chip>}
                        </div>
                        {role.description && <p className="text-xs text-muted-foreground">{role.description}</p>}
                        <TierChips permissions={role.permissions} />
                        <div className="flex flex-wrap items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => setViewingRoleUsers(role)} className="h-8 gap-1.5 px-2.5 text-xs">
                            <Users className="h-3.5 w-3.5" /> {plural(role.user_count, "person", "people")}
                          </Button>
                          {canManageRoles && (<>
                            <Button variant="outline" size="sm" onClick={() => setEditingRole(role)} className="h-8 gap-1.5 px-2.5 text-xs">
                              <Edit className="h-3.5 w-3.5" /> Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRoleToDelete(role.id)}
                              className="h-8 gap-1.5 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </Button>
                          </>)}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          </PermissionGate>
        </TabsContent>

        {/* Online now (was "User Settings") */}
        <TabsContent value="online" className="mt-0">
          <PermissionGate permissions={['user_management_view', 'user_management_manage']}>
            <Panel
              title="Online now"
              description="ERP accounts with activity in the last 5 minutes. Refreshes every 30 seconds."
              bodyClassName="p-0 sm:p-0"
            >
              {isLoadingOnlineUsers ? (
                <PanelSkeleton rows={3} />
              ) : onlineUsers.length === 0 ? (
                <PanelMessage icon={Activity} title="No one active in the last 5 minutes">
                  This list checks again every 30 seconds.
                </PanelMessage>
              ) : (
                <ul className="divide-y divide-border">
                  {onlineUsers.map((user) => (
                    <li key={user.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
                      <span className="relative">
                        <Initials name={personName(user)} />
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-success" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">{personName(user)}</p>
                        <p className="break-all text-xs text-muted-foreground">@{user.username} · {user.email}</p>
                      </div>
                      <p className="text-xs text-muted-foreground" title={`${fmtDay(user.last_seen)}, ${fmtTime(user.last_seen)} IST`}>
                        Active {fmtAgo(user.last_seen)}
                      </p>
                      {isSuperAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 px-2.5 text-xs"
                          onClick={() => {
                            setResetPasswordUser(user as any);
                          }}
                        >
                          <Key className="h-3.5 w-3.5" />
                          Reset password
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </PermissionGate>
        </TabsContent>

        {/* Functions Tab */}
        <TabsContent value="functions" className="mt-0">
          <PermissionGate permissions={['user_management_view', 'user_management_manage']}>
            <div className="space-y-4">
              <FunctionsTab />
              <PermissionChangeLog />
            </div>
          </PermissionGate>
        </TabsContent>

        {/* Terminal Access Tab */}
        <TabsContent value="terminal" className="mt-0">
          <PermissionGate permissions={['user_management_view', 'user_management_manage']}>
            <TerminalAccessTab />
          </PermissionGate>
        </TabsContent>
      </Tabs>


      {/* Dialogs */}
      {editingUser && (
        <EditUserDialog
          key={editingUser.id}
          user={editingUser}
          onSave={updateUser}
          onClose={() => setEditingUser(null)}
          restrictSensitive={isHrRestricted}
        />
      )}

      {editingRole && (
        <EditRoleDialog
          role={editingRole}
          onSave={updateRole}
          onClose={() => setEditingRole(null)}
        />
      )}

      {viewingRoleUsers && (
        <RoleUsersDialog
          role={viewingRoleUsers}
          onClose={() => setViewingRoleUsers(null)}
        />
      )}

      {resetPasswordUser && (
        <ResetPasswordDialog
          open={!!resetPasswordUser}
          onOpenChange={(open) => !open && setResetPasswordUser(null)}
          userId={resetPasswordUser.id}
          userName={resetPasswordUser.first_name && resetPasswordUser.last_name
            ? `${resetPasswordUser.first_name} ${resetPasswordUser.last_name}`
            : resetPasswordUser.username}
        />
      )}

      <AlertDialog open={!!roleToDelete} onOpenChange={(open) => !open && setRoleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {roleBeingDeleted ? `Delete the “${roleBeingDeleted.name.trim()}” role?` : "Delete this role?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {roleBeingDeleted && roleBeingDeleted.user_count > 0 ? (
                  <p className="font-medium text-warning">
                    {roleBeingDeleted.user_count === 1 ? "1 person has" : `${roleBeingDeleted.user_count} people have`} this role today. Move them to another role first.
                  </p>
                ) : (
                  <p>Nobody has this role at the moment.</p>
                )}
                <p>This can't be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => roleToDelete && deleteRole(roleToDelete)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && !isDeletingUser && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {userBeingDeleted ? `Delete ${personName(userBeingDeleted)}?` : "Delete this user?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {isDeletingUser ? (
                  <p>Deleting the account and cleaning up linked ERP access. Please wait…</p>
                ) : (
                  <>
                    <p>This permanently deletes the login and cleans up linked ERP access. Past orders and ledgers are kept, with the user reference removed.</p>
                    <p>To stop someone signing in without deleting them, set their status to Inactive instead.</p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingUser}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingUser}
              onClick={(event) => {
                event.preventDefault();
                confirmDeleteUser();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingUser ? "Deleting..." : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
