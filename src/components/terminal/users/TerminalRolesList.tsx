import { useState, useEffect, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Shield, Pencil, Plus, RefreshCw, Lock, ChevronDown, ChevronRight, ArrowLeftRight, FileStack } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTerminalAuth } from "@/hooks/useTerminalAuth";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TerminalRoleComparison } from "./TerminalRoleComparison";
import {
  TERMINAL_PERMISSION_MODULES,
  TERMINAL_ROLE_TEMPLATES,
  TERMINAL_TIER_STYLES,
  TERMINAL_TIER_SWITCH_STYLES,
  type TerminalPermissionDef,
} from '@/lib/permissions/terminalCatalog';

interface Role {
  id: string;
  name: string;
  description: string;
  is_default: boolean;
  hierarchy_level: number | null;
  permissions: string[];
}

// ─── Component ─────────────────────────────────────────────────────

export function TerminalRolesList() {
  const { hasPermission, terminalPermissions, userId, isTerminalAdmin, isSuperAdmin } = useTerminalAuth();
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
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);

  // Current user's permissions for delegation guard
  const myPerms = useMemo(() => new Set<string>(
    isSuperAdmin
      ? TERMINAL_PERMISSION_MODULES.flatMap(m => m.permissions.map(p => p.key))
      : terminalPermissions
  ), [terminalPermissions, isSuperAdmin]);

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

  const canEditRole = (role: Role): boolean => {
    if (!canManage) return false;
    if (isTerminalAdmin) return true;
    if (myHierarchyLevel !== null && myHierarchyLevel < 0) return true;
    if (myHierarchyLevel === 0) return (role.hierarchy_level ?? 999) >= 0;
    return (role.hierarchy_level ?? 999) > myHierarchyLevel;
  };

  const openEdit = (role: Role) => {
    if (!canEditRole(role)) return;
    setEditingRole(role);
    setIsNew(false);
    setEditName(role.name);
    setEditDesc(role.description);
    const knownKeys = new Set<string>(TERMINAL_TERMINAL_PERMISSION_MODULES.flatMap(m => m.permissions.map(p => p.key)));
    setEditPerms(new Set(role.permissions.filter(p => knownKeys.has(p as string))));
    setEditHierarchy(role.hierarchy_level !== null ? String(role.hierarchy_level) : "");
    setCollapsedModules(new Set());
  };

  const openNew = () => {
    setEditingRole({ id: "", name: "", description: "", is_default: false, hierarchy_level: null, permissions: [] });
    setIsNew(true);
    setEditName("");
    setEditDesc("");
    setEditPerms(new Set());
    setEditHierarchy("");
    setCollapsedModules(new Set());
  };

  const togglePerm = (perm: TerminalPermissionDef) => {
    setEditPerms((prev) => {
      const next = new Set(prev);
      if (next.has(perm.key)) {
        next.delete(perm.key);
      } else {
        next.add(perm.key);
        // Auto-enable prerequisites
        perm.requires?.forEach(req => next.add(req));
      }
      return next;
    });
  };

  const selectAllGrantable = () => {
    const grantable = TERMINAL_PERMISSION_MODULES.flatMap(m => m.permissions.filter(p => myPerms.has(p.key)).map(p => p.key));
    setEditPerms(new Set(grantable));
  };

  const deselectAll = () => setEditPerms(new Set());

  const toggleModuleCollapse = (key: string) => {
    setCollapsedModules(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    if (!editName.trim()) { toast.error("Role name is required"); return; }
    const parsedLevel = editHierarchy.trim() ? parseInt(editHierarchy.trim(), 10) : null;
    if (parsedLevel !== null && myHierarchyLevel > 0 && parsedLevel <= myHierarchyLevel) {
      toast.error(`Hierarchy level must be greater than ${myHierarchyLevel} (your level)`);
      return;
    }
    setIsSaving(true);
    try {
      const rpcParams: Record<string, any> = {
        p_name: editName.trim(),
        p_permissions: Array.from(editPerms),
      };
      if (!isNew && editingRole?.id) rpcParams.p_role_id = editingRole.id;
      if (editDesc.trim()) rpcParams.p_description = editDesc.trim();
      if (parsedLevel !== null) rpcParams.p_hierarchy_level = parsedLevel;
      
      const { data, error } = await supabase.rpc("save_terminal_role", rpcParams as any);
      if (error) {
        console.error('[save_terminal_role] error:', error.code, error.message, error.details, error.hint);
        toast.error(error.message);
        return;
      }
      toast.success(isNew ? "Role created" : "Role updated");
      setEditingRole(null);
      await fetchRoles();
    } finally {
      setIsSaving(false);
    }
  };

  const roleBadgeClass = (name: string, level: number | null) => {
    if (level !== null && level < 0) return "bg-destructive/20 text-destructive border-destructive/30";
    if (level === 0 || name.toLowerCase() === "admin") return "bg-destructive/20 text-destructive border-destructive/30";
    if (level === 1) return "bg-warning/20 text-warning border-warning/30";
    if (level === 2) return "bg-primary/20 text-primary border-primary/30";
    if (level === 3) return "bg-info/20 text-info border-info/30";
    if (level === 4) return "bg-info/20 text-info border-info/30";
    if (level === 5) return "bg-success/20 text-success border-success/30";
    if (name.toLowerCase() === "viewer") return "bg-muted/20 text-muted border-muted/30";
    return "bg-primary/20 text-primary border-primary/30";
  };

  // Group permissions by module for display in role cards
  const getModuleSummary = (perms: string[]) => {
    const permSet = new Set(perms);
    return TERMINAL_PERMISSION_MODULES
      .map(m => ({
        ...m,
        granted: m.permissions.filter(p => permSet.has(p.key)).length,
        total: m.permissions.length,
      }))
      .filter(m => m.granted > 0);
  };

  const totalPerms = TERMINAL_PERMISSION_MODULES.reduce((sum, m) => sum + m.permissions.length, 0);
  const selectedCount = editPerms.size;

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
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowCompare(true)}>
              <ArrowLeftRight className="h-3.5 w-3.5 mr-1" /> Compare
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
              const modules = getModuleSummary(role.permissions);
              return (
                <div
                  key={role.id}
                  className="border border-border rounded-lg p-4 bg-muted/5 hover:bg-muted/10 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-xs ${roleBadgeClass(role.name, role.hierarchy_level)}`}>
                        {role.name}
                      </Badge>
                      {role.hierarchy_level !== null && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground border-muted-foreground/30 t-mono">
                          L{role.hierarchy_level}
                        </Badge>
                      )}
                      {role.is_default && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground border-muted-foreground/30">
                          Default
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {role.permissions.length} permission{role.permissions.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {canManage && (
                      editable ? (
                        <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => openEdit(role)}>
                          <Pencil className="h-3 w-3 mr-1" /> Edit
                        </Button>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 text-xs opacity-40 cursor-not-allowed shrink-0" disabled>
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
                    <p className="text-xs text-muted-foreground mb-2">{role.description}</p>
                  )}
                  {/* Module summary badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {modules.map(m => (
                      <Badge key={m.key} variant="secondary" className="text-[10px] gap-1 bg-muted/30">
                        <span>{m.icon}</span>
                        <span>{m.label}</span>
                        <span className="text-muted-foreground">{m.granted}/{m.total}</span>
                      </Badge>
                    ))}
                    {modules.length === 0 && (
                      <span className="text-xs text-muted-foreground italic">No permissions</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── Edit/Create Role Dialog ─── */}
        <Dialog open={!!editingRole} onOpenChange={(open) => !open && setEditingRole(null)}>
          <DialogContent className="t-scale-in sm:max-w-2xl max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-2">
              <DialogTitle>{isNew ? "Create Role" : `Edit: ${editingRole?.name}`}</DialogTitle>
            </DialogHeader>

            <div className="px-6 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Name</label>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="e.g. Supervisor" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Hierarchy Level
                    {myHierarchyLevel > 0 && <span className="text-muted-foreground/60 ml-1">(&gt; {myHierarchyLevel})</span>}
                  </label>
                  <Input type="number" value={editHierarchy} onChange={(e) => setEditHierarchy(e.target.value)} placeholder="e.g. 3" className="h-8 text-sm w-full" min={myHierarchyLevel === 0 ? 0 : myHierarchyLevel + 1} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Optional description" className="h-8 text-sm" />
              </div>
            </div>

            {/* Permission header */}
            <div className="px-6 pt-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  Permissions ({selectedCount}/{totalPerms})
                </span>
              </div>
              <div className="flex gap-1.5">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1">
                      <FileStack className="h-3 w-3" /> Template
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {Object.entries(TERMINAL_ROLE_TEMPLATES).map(([key, tmpl]) => {
                      // Only apply permissions the current user can grant (delegation guard)
                      const applicable = tmpl.permissions.filter(p => myPerms.has(p));
                      return (
                        <DropdownMenuItem
                          key={key}
                          onClick={() => {
                            setEditPerms(new Set(applicable));
                            toast.success(`Applied ${tmpl.label} template (${applicable.length} permissions)`);
                          }}
                        >
                          {tmpl.label} ({applicable.length})
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={deselectAll}>Clear</Button>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={selectAllGrantable}>Select All</Button>
              </div>
            </div>

            {/* Tier legend */}
            <div className="px-6 flex flex-wrap gap-2">
              {([['view', 'View', 'bg-success'], ['manage', 'Manage', 'bg-info'], ['action', 'Action', 'bg-info'], ['special', 'Special', 'bg-warning'], ['destructive', 'Destructive', 'bg-destructive']] as const).map(([tier, label, color]) => (
                <div key={tier} className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${color}`} />
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>

            {/* Module Grid */}
            <ScrollArea className="flex-1 min-h-0 px-6 pb-2 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 280px)' }}>
              <div className="space-y-2 pr-2 pb-4">
                {TERMINAL_PERMISSION_MODULES.map((mod) => {
                  const grantedInModule = mod.permissions.filter(p => editPerms.has(p.key)).length;
                  const isCollapsed = collapsedModules.has(mod.key);
                  return (
                    <div key={mod.key} className="border border-border rounded-lg overflow-hidden">
                      {/* Module Header */}
                      <button
                        type="button"
                        onClick={() => toggleModuleCollapse(mod.key)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/20 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{mod.icon}</span>
                          <span className="text-xs font-medium">{mod.label}</span>
                          <Badge variant="secondary" className={`text-[10px] h-4 px-1.5 ${grantedInModule === mod.permissions.length ? 'bg-success/20 text-success' : grantedInModule > 0 ? 'bg-info/20 text-info' : ''}`}>
                            {grantedInModule}/{mod.permissions.length}
                          </Badge>
                        </div>
                        {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                      </button>

                      {/* Permission Toggles */}
                      {!isCollapsed && (
                        <div className="px-3 pb-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
                          {mod.permissions.map((perm) => {
                            const canGrant = myPerms.has(perm.key);
                            const isEnabled = editPerms.has(perm.key);
                            return (
                              <div key={perm.key} className="flex items-center justify-between gap-2 min-h-[28px]">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  {!canGrant && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Lock className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                                      </TooltipTrigger>
                                      <TooltipContent side="left">
                                        <p className="text-xs">You don't have this permission</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 font-normal ${TERMINAL_TIER_STYLES[perm.tier]}`}>
                                    {perm.label}
                                  </Badge>
                                </div>
                                <Switch
                                  checked={isEnabled}
                                  onCheckedChange={() => canGrant && togglePerm(perm)}
                                  disabled={!canGrant}
                                  className={`h-4 w-7 shrink-0 ${canGrant ? TERMINAL_TIER_SWITCH_STYLES[perm.tier] : 'opacity-30'}`}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            <DialogFooter className="px-6 py-3 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setEditingRole(null)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : isNew ? "Create Role" : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Role Comparison Dialog */}
        <TerminalRoleComparison
          open={showCompare}
          onOpenChange={setShowCompare}
          roles={roles}
          modules={TERMINAL_PERMISSION_MODULES}
        />
      </div>
    </TooltipProvider>
  );
}
