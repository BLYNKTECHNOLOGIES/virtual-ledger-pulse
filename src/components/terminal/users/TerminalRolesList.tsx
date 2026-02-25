import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Shield, Pencil, Plus, RefreshCw, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTerminalAuth, TerminalPermission } from "@/hooks/useTerminalAuth";

interface Role {
  id: string;
  name: string;
  description: string;
  is_default: boolean;
  hierarchy_level: number | null;
  permissions: string[];
}

const PERMISSION_GROUPS: Record<string, { label: string; permissions: { key: TerminalPermission; label: string }[] }> = {
  dashboard: {
    label: "Dashboard",
    permissions: [{ key: "terminal_dashboard_view", label: "View Dashboard" }],
  },
  ads: {
    label: "Ads",
    permissions: [
      { key: "terminal_ads_view", label: "View Ads" },
      { key: "terminal_ads_manage", label: "Manage Ads" },
    ],
  },
  orders: {
    label: "Orders",
    permissions: [
      { key: "terminal_orders_view", label: "View Orders" },
      { key: "terminal_orders_manage", label: "Manage Orders" },
      { key: "terminal_orders_actions", label: "Order Actions (Pay/Release/Cancel)" },
    ],
  },
  automation: {
    label: "Automation",
    permissions: [
      { key: "terminal_automation_view", label: "View Automation" },
      { key: "terminal_automation_manage", label: "Manage Automation" },
    ],
  },
  assets: {
    label: "Assets",
    permissions: [{ key: "terminal_assets_view", label: "View Assets & Balances" }],
  },
  analytics: {
    label: "Analytics",
    permissions: [{ key: "terminal_analytics_view", label: "View Analytics" }],
  },
  mpi: {
    label: "MPI (Management Performance)",
    permissions: [{ key: "terminal_mpi_view", label: "View MPI Dashboard" }],
  },
  audit_logs: {
    label: "Audit Logs",
    permissions: [{ key: "terminal_audit_logs_view", label: "View Audit Logs" }],
  },
  kyc: {
    label: "KYC Team",
    permissions: [
      { key: "terminal_kyc_view", label: "View KYC Module" },
      { key: "terminal_kyc_manage", label: "Manage KYC Approvals" },
    ],
  },
  logs: {
    label: "Logs",
    permissions: [{ key: "terminal_logs_view", label: "View System Logs" }],
  },
  settings: {
    label: "Settings",
    permissions: [
      { key: "terminal_settings_view", label: "View Settings" },
      { key: "terminal_settings_manage", label: "Manage Settings" },
    ],
  },
  users: {
    label: "Users & Roles",
    permissions: [
      { key: "terminal_users_view", label: "View Users" },
      { key: "terminal_users_manage", label: "Manage Users" },
    ],
  },
  payer: {
    label: "Payer",
    permissions: [
      { key: "terminal_payer_view", label: "View Payer Module" },
      { key: "terminal_payer_manage", label: "Manage Payer Assignments" },
    ],
  },
};

export function TerminalRolesList() {
  const { hasPermission, userId, isTerminalAdmin } = useTerminalAuth();
  const canManage = hasPermission("terminal_users_manage");

  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPerms, setEditPerms] = useState<Set<string>>(new Set());
  const [editHierarchy, setEditHierarchy] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [myHierarchyLevel, setMyHierarchyLevel] = useState<number>(999);

  const fetchRoles = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase.rpc("list_terminal_roles");
    if (error) { toast.error("Failed to load roles"); setIsLoading(false); return; }
    setRoles((data || []).map((r: any) => ({
      id: r.id, name: r.name, description: r.description || "", is_default: r.is_default,
      hierarchy_level: r.hierarchy_level ?? null, permissions: r.permissions || [],
    })));
    setIsLoading(false);
  }, []);

  const fetchMyLevel = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.rpc("get_user_min_hierarchy_level", { p_user_id: userId });
    if (typeof data === "number") setMyHierarchyLevel(data);
  }, [userId]);

  useEffect(() => { fetchRoles(); fetchMyLevel(); }, [fetchRoles, fetchMyLevel]);

  /** Can the current user edit this role? Admin (level 0) can edit everything including itself. Others can only edit roles strictly below them. */
  const canEditRole = (role: Role): boolean => {
    if (!canManage) return false;
    // ERP Super Admin or terminal Super Admin (< 0) has full rights
    if (isTerminalAdmin) return true;
    if (myHierarchyLevel !== null && myHierarchyLevel < 0) return true;

    // Admin (0) can edit roles with level >= 0 (cannot edit Super Admin role)
    if (myHierarchyLevel === 0) {
      return (role.hierarchy_level ?? 999) >= 0;
    }

    const targetLevel = role.hierarchy_level ?? 999;
    return targetLevel > myHierarchyLevel;
  };

  const openEdit = (role: Role) => {
    if (!canEditRole(role)) return;
    setEditingRole(role);
    setIsNew(false);
    setEditName(role.name);
    setEditDesc(role.description);
    setEditPerms(new Set(role.permissions));
    setEditHierarchy(role.hierarchy_level !== null ? String(role.hierarchy_level) : "");
  };

  const openNew = () => {
    setEditingRole({ id: "", name: "", description: "", is_default: false, hierarchy_level: null, permissions: [] });
    setIsNew(true);
    setEditName("");
    setEditDesc("");
    setEditPerms(new Set());
    setEditHierarchy("");
  };

  const togglePerm = (perm: string) => {
    setEditPerms((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm); else next.add(perm);
      return next;
    });
  };

  const selectAll = () => {
    const all = Object.values(PERMISSION_GROUPS).flatMap(g => g.permissions.map(p => p.key));
    setEditPerms(new Set(all));
  };

  const handleSave = async () => {
    if (!editName.trim()) { toast.error("Role name is required"); return; }

    const parsedLevel = editHierarchy.trim() ? parseInt(editHierarchy.trim(), 10) : null;

    // Admin (level 0) can set any hierarchy level. Others must set levels below their own.
    if (parsedLevel !== null && myHierarchyLevel !== 0 && parsedLevel <= myHierarchyLevel) {
      toast.error(`Hierarchy level must be greater than ${myHierarchyLevel} (your level)`);
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.rpc("save_terminal_role", {
        p_role_id: isNew ? undefined : editingRole?.id,
        p_name: editName.trim(),
        p_description: editDesc.trim() || undefined,
        p_permissions: Array.from(editPerms),
        p_hierarchy_level: parsedLevel,
      });
      if (error) { toast.error(error.message); return; }
      toast.success(isNew ? "Role created" : "Role updated");
      setEditingRole(null);
      await fetchRoles();
    } finally {
      setIsSaving(false);
    }
  };

  const roleBadgeClass = (name: string, level: number | null) => {
    if (level === 0 || name.toLowerCase() === "admin") return "bg-red-500/20 text-red-400 border-red-500/30";
    if (level === 1) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    if (level === 2) return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    if (level === 3) return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    if (level === 4) return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
    if (level === 5) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    if (name.toLowerCase() === "viewer") return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    return "bg-primary/20 text-primary border-primary/30";
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {roles.length} role{roles.length !== 1 ? "s" : ""} defined
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { fetchRoles(); fetchMyLevel(); }}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            {canManage && (
              <Button size="sm" className="h-8 text-xs" onClick={openNew}>
                <Plus className="h-3.5 w-3.5 mr-1" /> New Role
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="grid gap-3">
            {roles.map((role) => {
              const editable = canEditRole(role);
              return (
                <div
                  key={role.id}
                  className="border border-border rounded-lg p-4 bg-muted/5 hover:bg-muted/10 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${roleBadgeClass(role.name, role.hierarchy_level)}`}>
                        {role.name}
                      </Badge>
                      {role.hierarchy_level !== null && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground border-muted-foreground/30 font-mono">
                          L{role.hierarchy_level}
                        </Badge>
                      )}
                      {role.is_default && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground border-muted-foreground/30">
                          Default
                        </Badge>
                      )}
                    </div>
                    {canManage && (
                      editable ? (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(role)}>
                          <Pencil className="h-3 w-3 mr-1" /> Edit
                        </Button>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 text-xs opacity-40 cursor-not-allowed" disabled>
                              <Lock className="h-3 w-3 mr-1" /> Edit
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Cannot edit roles at or above your hierarchy level</p>
                          </TooltipContent>
                        </Tooltip>
                      )
                    )}
                  </div>
                  {role.description && (
                    <p className="text-xs text-muted-foreground mb-3">{role.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {role.permissions.map((p) => (
                      <Badge key={p} variant="secondary" className="text-[10px] font-mono bg-muted/30">
                        {p.replace("terminal_", "")}
                      </Badge>
                    ))}
                    {role.permissions.length === 0 && (
                      <span className="text-xs text-muted-foreground italic">No permissions</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Edit/Create Role Dialog */}
        <Dialog open={!!editingRole} onOpenChange={(open) => !open && setEditingRole(null)}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{isNew ? "Create Role" : `Edit: ${editingRole?.name}`}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Supervisor"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <Input
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Optional description"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Hierarchy Level
                  {myHierarchyLevel !== 0 && (
                    <span className="text-muted-foreground/60 ml-1">(must be &gt; {myHierarchyLevel})</span>
                  )}
                </label>
                <Input
                  type="number"
                  value={editHierarchy}
                  onChange={(e) => setEditHierarchy(e.target.value)}
                  placeholder="e.g. 3"
                  className="h-9 text-sm w-32"
                  min={myHierarchyLevel === 0 ? 0 : myHierarchyLevel + 1}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5" /> Permissions
                  </label>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={selectAll}>
                    Select All
                  </Button>
                </div>
                <Accordion type="multiple" defaultValue={Object.keys(PERMISSION_GROUPS)} className="space-y-1">
                  {Object.entries(PERMISSION_GROUPS).map(([key, group]) => (
                    <AccordionItem key={key} value={key} className="border border-border rounded-md px-3">
                      <AccordionTrigger className="text-xs py-2 hover:no-underline">
                        <span className="flex items-center gap-2">
                          {group.label}
                          <Badge variant="secondary" className="text-[10px] h-4">
                            {group.permissions.filter(p => editPerms.has(p.key)).length}/{group.permissions.length}
                          </Badge>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="pb-2 space-y-1.5">
                        {group.permissions.map((p) => (
                          <label
                            key={p.key}
                            className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/20 rounded px-1 py-0.5"
                          >
                            <Checkbox
                              checked={editPerms.has(p.key)}
                              onCheckedChange={() => togglePerm(p.key)}
                              className="h-3.5 w-3.5"
                            />
                            <span>{p.label}</span>
                          </label>
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditingRole(null)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : isNew ? "Create Role" : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
