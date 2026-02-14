import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, ChevronDown, ChevronRight, User, Users, Crown, Briefcase, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface HierarchyNode {
  userId: string;
  username: string;
  displayName: string;
  roleName: string;
  hierarchyLevel: number | null;
  specialization: string | null;
  shift: string | null;
  isActive: boolean;
  children: HierarchyNode[];
}

const LEVEL_ICONS: Record<number, React.ElementType> = {
  0: Crown,    // Admin
  1: Crown,    // COO
  2: Shield,   // Ops Manager
  3: Briefcase, // AM
  4: Users,    // Team Lead
  5: User,     // Operator
};

const LEVEL_COLORS: Record<number, string> = {
  0: "bg-red-500/20 text-red-400 border-red-500/30",
  1: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  2: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  3: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  4: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  5: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

function TreeNode({ node, depth = 0 }: { node: HierarchyNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 3);
  const hasChildren = node.children.length > 0;
  const Icon = LEVEL_ICONS[node.hierarchyLevel ?? 5] || User;
  const colorClass = LEVEL_COLORS[node.hierarchyLevel ?? 5] || LEVEL_COLORS[5];

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/20 transition-colors cursor-pointer group ${
          !node.isActive ? "opacity-50" : ""
        }`}
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <span className="w-3 shrink-0" />
        )}

        <div className="h-6 w-6 rounded-full bg-muted/30 border border-border flex items-center justify-center shrink-0">
          <Icon className="h-3 w-3 text-muted-foreground" />
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-medium truncate text-foreground">{node.displayName}</span>
          <span className="text-xs text-muted-foreground/80">@{node.username}</span>
        </div>

        <Badge variant="outline" className={`text-[10px] shrink-0 ${colorClass}`}>
          {node.roleName}
        </Badge>

        {node.specialization && node.specialization !== "both" && (
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {node.specialization}
          </Badge>
        )}

        {node.shift && (
          <Badge variant="secondary" className="text-[10px] shrink-0 bg-muted/30">
            {node.shift}
          </Badge>
        )}

        {hasChildren && (
          <span className="text-[10px] text-muted-foreground font-mono shrink-0">
            {node.children.length}
          </span>
        )}
      </div>

      {expanded && hasChildren && (
        <div className="border-l border-border/30" style={{ marginLeft: `${depth * 24 + 20}px` }}>
          {node.children.map(child => (
            <TreeNode key={child.userId} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function TerminalHierarchyView() {
  const [tree, setTree] = useState<HierarchyNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHierarchy = useCallback(async () => {
    setIsLoading(true);
    try {
      const [assignmentsRes, usersRes, rolesRes, profilesRes] = await Promise.all([
        supabase.from("p2p_terminal_user_roles").select("user_id, role_id"),
        supabase.from("users").select("id, username, first_name, last_name"),
        supabase.from("p2p_terminal_roles").select("id, name, hierarchy_level"),
        supabase.from("terminal_user_profiles").select("user_id, reports_to, specialization, shift, is_active"),
      ]);

      const usersMap = new Map<string, any>();
      (usersRes.data || []).forEach(u => usersMap.set(u.id, u));

      const rolesMap = new Map<string, any>();
      (rolesRes.data || []).forEach(r => rolesMap.set(r.id, r));

      const profilesMap = new Map<string, any>();
      (profilesRes.data || []).forEach(p => profilesMap.set(p.user_id, p));

      // Build user-role mapping (use highest-level role per user)
      const userRoleMap = new Map<string, any>();
      (assignmentsRes.data || []).forEach(a => {
        const role = rolesMap.get(a.role_id);
        if (!role) return;
        const existing = userRoleMap.get(a.user_id);
        if (!existing || (role.hierarchy_level !== null && (existing.hierarchy_level === null || role.hierarchy_level < existing.hierarchy_level))) {
          userRoleMap.set(a.user_id, role);
        }
      });

      // Build nodes
      const nodesMap = new Map<string, HierarchyNode>();
      for (const [userId, role] of userRoleMap) {
        const user = usersMap.get(userId);
        if (!user) continue;
        const profile = profilesMap.get(userId);
        nodesMap.set(userId, {
          userId,
          username: user.username,
          displayName: user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.username,
          roleName: role.name,
          hierarchyLevel: role.hierarchy_level,
          specialization: profile?.specialization || null,
          shift: profile?.shift || null,
          isActive: profile?.is_active !== false,
          children: [],
        });
      }

      // Build tree based on reports_to
      const roots: HierarchyNode[] = [];
      for (const [userId, node] of nodesMap) {
        const profile = profilesMap.get(userId);
        const parentId = profile?.reports_to;
        if (parentId && nodesMap.has(parentId)) {
          nodesMap.get(parentId)!.children.push(node);
        } else {
          roots.push(node);
        }
      }

      // Sort: by hierarchy level then name
      const sortNodes = (nodes: HierarchyNode[]) => {
        nodes.sort((a, b) => (a.hierarchyLevel ?? 99) - (b.hierarchyLevel ?? 99) || a.displayName.localeCompare(b.displayName));
        nodes.forEach(n => sortNodes(n.children));
      };
      sortNodes(roots);

      setTree(roots);
    } catch (err) {
      console.error("Error building hierarchy:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchHierarchy(); }, [fetchHierarchy]);

  const totalUsers = (() => {
    let count = 0;
    const walk = (nodes: HierarchyNode[]) => { count += nodes.length; nodes.forEach(n => walk(n.children)); };
    walk(tree);
    return count;
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Organizational hierarchy based on supervisor mappings. {totalUsers} user{totalUsers !== 1 ? "s" : ""} in tree.
        </p>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchHierarchy}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
        </div>
      ) : tree.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Users className="h-10 w-10 opacity-20" />
          <p className="text-sm">No hierarchy configured yet.</p>
          <p className="text-xs">Assign roles and set supervisor mappings in the Users tab to build the org tree.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg p-3 bg-muted/5">
          {tree.map(node => (
            <TreeNode key={node.userId} node={node} />
          ))}
        </div>
      )}
    </div>
  );
}
