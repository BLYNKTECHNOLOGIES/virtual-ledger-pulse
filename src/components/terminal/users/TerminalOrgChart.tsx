import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  RefreshCw, ZoomIn, ZoomOut, Maximize2, Search,
  ChevronDown, ChevronUp, User, Users, Crown, Briefcase, Shield,
  AlertTriangle, Link2Off
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface OrgNode {
  userId: string;
  username: string;
  displayName: string;
  roleName: string;
  hierarchyLevel: number | null;
  specialization: string | null;
  shift: string | null;
  isActive: boolean;
  children: OrgNode[];
  collapsed: boolean;
  isOrphan?: boolean; // true if this node should have a supervisor but doesn't
}

const LEVEL_COLORS: Record<number, { bg: string; border: string; text: string }> = {
  0: { bg: "bg-red-500/10", border: "border-red-500/40", text: "text-red-400" },
  1: { bg: "bg-amber-500/10", border: "border-amber-500/40", text: "text-amber-400" },
  2: { bg: "bg-purple-500/10", border: "border-purple-500/40", text: "text-purple-400" },
  3: { bg: "bg-blue-500/10", border: "border-blue-500/40", text: "text-blue-400" },
  4: { bg: "bg-cyan-500/10", border: "border-cyan-500/40", text: "text-cyan-400" },
  5: { bg: "bg-emerald-500/10", border: "border-emerald-500/40", text: "text-emerald-400" },
};

const DEFAULT_COLOR = { bg: "bg-muted/20", border: "border-border", text: "text-muted-foreground" };

function OrgCardNode({
  node,
  onToggle,
  searchQuery,
}: {
  node: OrgNode;
  onToggle: (userId: string) => void;
  searchQuery: string;
}) {
  const level = node.hierarchyLevel ?? 5;
  const colors = LEVEL_COLORS[level] || DEFAULT_COLOR;
  const hasChildren = node.children.length > 0;

  const isMatch = searchQuery
    ? node.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.username.toLowerCase().includes(searchQuery.toLowerCase())
    : false;

  return (
    <div className="flex flex-col items-center">
      {/* Card */}
      <div
        className={`relative rounded-lg border-2 ${
          node.isOrphan
            ? "border-destructive/70 bg-destructive/10 ring-2 ring-destructive/30 ring-offset-1 ring-offset-background"
            : `${colors.border} ${colors.bg}`
        } px-4 py-3 min-w-[160px] max-w-[220px] text-center transition-all hover:shadow-md ${
          !node.isActive ? "opacity-50" : ""
        } ${isMatch ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
      >
        {node.isOrphan && (
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-destructive text-destructive-foreground text-[9px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
            <Link2Off className="h-2.5 w-2.5" />
            No Supervisor
          </div>
        )}
        <div className={`text-sm font-semibold text-foreground leading-tight truncate ${node.isOrphan ? "mt-1" : ""}`}>
          {node.displayName}
        </div>
        <div className={`text-[11px] mt-0.5 ${node.isOrphan ? "text-destructive" : colors.text} font-medium`}>
          {node.roleName}
        </div>
        {node.specialization && node.specialization !== "both" && (
          <div className="text-[10px] text-muted-foreground mt-0.5">{node.specialization}</div>
        )}
        {node.shift && (
          <div className="text-[9px] text-muted-foreground/70 mt-0.5">{node.shift}</div>
        )}

        {/* Toggle children */}
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.userId);
            }}
            className={`absolute -bottom-3 left-1/2 -translate-x-1/2 h-5 w-5 rounded-full border ${colors.border} ${colors.bg} flex items-center justify-center hover:scale-110 transition-transform z-10`}
          >
            {node.collapsed ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        )}
      </div>

      {/* Children */}
      {hasChildren && !node.collapsed && (
        <div className="flex flex-col items-center">
          {/* Vertical line from parent to horizontal bar */}
          <div className="w-px h-8 bg-border" />

          {node.children.length === 1 ? (
            <OrgCardNode
              node={node.children[0]}
              onToggle={onToggle}
              searchQuery={searchQuery}
            />
          ) : (
            <div className="flex flex-col items-center">
              {/* Horizontal bar connecting all children */}
              <div className="flex items-start gap-4">
                {node.children.map((child, idx) => (
                  <div key={child.userId} className="flex flex-col items-center relative">
                    {/* Horizontal connector bar */}
                    <div
                      className="absolute top-0 h-px bg-border"
                      style={{
                        left: idx === 0 ? '50%' : 0,
                        right: idx === node.children.length - 1 ? '50%' : 0,
                      }}
                    />
                    {/* Vertical line down to child card */}
                    <div className="w-px h-6 bg-border" />
                    <OrgCardNode
                      node={child}
                      onToggle={onToggle}
                      searchQuery={searchQuery}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TerminalOrgChart() {
  const [tree, setTree] = useState<OrgNode[]>([]);
  const [orphanNodes, setOrphanNodes] = useState<OrgNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [managerFilter, setManagerFilter] = useState("all");
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartWrapperRef = useRef<HTMLDivElement>(null);

  const fetchHierarchy = useCallback(async () => {
    setIsLoading(true);
    try {
      const [assignmentsRes, usersRes, rolesRes, profilesRes, supervisorMapsRes] = await Promise.all([
        supabase.from("p2p_terminal_user_roles").select("user_id, role_id"),
        supabase.from("users").select("id, username, first_name, last_name"),
        supabase.from("p2p_terminal_roles").select("id, name, hierarchy_level"),
        supabase.from("terminal_user_profiles").select("user_id, specialization, shift, is_active"),
        supabase.from("terminal_user_supervisor_mappings").select("user_id, supervisor_id"),
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
      const nodesMap = new Map<string, OrgNode>();
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
          collapsed: false,
        });
      }

      // Build tree based on supervisor mappings
      const roots: OrgNode[] = [];
      const supervisorMap = new Map<string, string[]>();
      (supervisorMapsRes.data || []).forEach(m => {
        const list = supervisorMap.get(m.user_id) || [];
        list.push(m.supervisor_id);
        supervisorMap.set(m.user_id, list);
      });

      // Find the minimum hierarchy level (the true top)
      const minLevel = Math.min(...Array.from(nodesMap.values()).map(n => n.hierarchyLevel ?? 99));

      const addedToParent = new Set<string>();
      for (const [userId, node] of nodesMap) {
        const supervisors = supervisorMap.get(userId) || [];
        for (const parentId of supervisors) {
          if (nodesMap.has(parentId)) {
            const childNode = addedToParent.has(userId) ? { ...node, children: [...node.children] } : node;
            nodesMap.get(parentId)!.children.push(childNode);
            addedToParent.add(userId);
          }
        }
        if (!addedToParent.has(userId)) {
          // Mark as orphan if this is NOT the top-level role but has no supervisor
          const level = node.hierarchyLevel ?? 99;
          if (level > minLevel) {
            node.isOrphan = true;
          }
          roots.push(node);
        }
      }

      // Sort by hierarchy level then name
      const sortNodes = (nodes: OrgNode[]) => {
        nodes.sort((a, b) => (a.hierarchyLevel ?? 99) - (b.hierarchyLevel ?? 99) || a.displayName.localeCompare(b.displayName));
        nodes.forEach(n => sortNodes(n.children));
      };
      sortNodes(roots);

      // Separate true roots from orphans
      const trueRoots = roots.filter(n => !n.isOrphan);
      const orphans = roots.filter(n => n.isOrphan);

      // Collect managers (nodes with children)
      const mgrs: { id: string; name: string }[] = [];
      const collectManagers = (nodes: OrgNode[]) => {
        for (const n of nodes) {
          if (n.children.length > 0) mgrs.push({ id: n.userId, name: n.displayName });
          collectManagers(n.children);
        }
      };
      collectManagers(roots);
      setManagers(mgrs);
      setTree(trueRoots);
      setOrphanNodes(orphans);
    } catch (err) {
      console.error("Error building org chart:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchHierarchy(); }, [fetchHierarchy]);

  const toggleNode = useCallback((userId: string) => {
    setTree(prev => {
      const toggle = (nodes: OrgNode[]): OrgNode[] =>
        nodes.map(n => ({
          ...n,
          collapsed: n.userId === userId ? !n.collapsed : n.collapsed,
          children: toggle(n.children),
        }));
      return toggle(prev);
    });
  }, []);

  // Filter tree by reporting manager
  const filteredTree = managerFilter === "all"
    ? tree
    : tree.reduce<OrgNode[]>((acc, node) => {
        const findSubtree = (n: OrgNode): OrgNode | null => {
          if (n.userId === managerFilter) return n;
          for (const child of n.children) {
            const found = findSubtree(child);
            if (found) return found;
          }
          return null;
        };
        const found = findSubtree(node);
        if (found) acc.push(found);
        return acc;
      }, []);

  const totalUsers = (() => {
    let count = 0;
    const walk = (nodes: OrgNode[]) => { count += nodes.length; nodes.forEach(n => walk(n.children)); };
    walk(filteredTree);
    walk(orphanNodes);
    return count;
  })();

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.15, 2));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.15, 0.3));
  const handleFullscreen = () => setIsFullscreen(f => !f);

  // Close fullscreen on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFullscreen]);

  const chartContent = (
    <>
      {isLoading ? (
        <div className="flex justify-center items-center py-24">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : filteredTree.length === 0 && orphanNodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-2">
          <Users className="h-10 w-10 opacity-20" />
          <p className="text-sm">No hierarchy configured yet.</p>
          <p className="text-xs">Assign roles and set supervisor mappings to build the org chart.</p>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="overflow-auto p-8"
          style={{ maxHeight: isFullscreen ? "100%" : "70vh", height: isFullscreen ? "100%" : undefined }}
        >
          <div
            className="flex flex-col items-center gap-0 min-w-max"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top center",
              transition: "transform 0.2s ease",
            }}
          >
            {/* Connected tree */}
            {filteredTree.map(node => (
              <OrgCardNode
                key={node.userId}
                node={node}
                onToggle={toggleNode}
                searchQuery={searchQuery}
              />
            ))}

            {/* Orphan nodes shown separately below with a divider */}
            {orphanNodes.length > 0 && filteredTree.length > 0 && (
              <div className="w-full flex flex-col items-center mt-10 pt-6 border-t border-destructive/30">
                <div className="flex items-center gap-2 mb-4 text-xs text-destructive font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Disconnected Users (No Supervisor Assigned)
                </div>
                <div className="flex items-start gap-6 flex-wrap justify-center">
                  {orphanNodes.map(node => (
                    <OrgCardNode
                      key={node.userId}
                      node={node}
                      onToggle={toggleNode}
                      searchQuery={searchQuery}
                    />
                  ))}
                </div>
              </div>
            )}

            {filteredTree.length === 0 && orphanNodes.length > 0 && (
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-2 text-xs text-destructive font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  All users are disconnected — assign supervisors to build the hierarchy
                </div>
                <div className="flex items-start gap-6 flex-wrap justify-center">
                  {orphanNodes.map(node => (
                    <OrgCardNode
                      key={node.userId}
                      node={node}
                      onToggle={toggleNode}
                      searchQuery={searchQuery}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  const zoomControls = (
    <div className="absolute top-3 right-3 z-20 flex flex-col gap-1">
      <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleZoomIn}>
        <ZoomIn className="h-3.5 w-3.5" />
      </Button>
      <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleZoomOut}>
        <ZoomOut className="h-3.5 w-3.5" />
      </Button>
      <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleFullscreen}>
        <Maximize2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  return (
    <>
      {/* Fullscreen overlay */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold">Organization Chart</h2>
              <span className="text-[11px] text-muted-foreground">{totalUsers} users</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="h-8 pl-7 w-[160px] text-xs bg-secondary border-border"
                />
              </div>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleFullscreen}>
                <Maximize2 className="h-3.5 w-3.5" />
                Exit Fullscreen
              </Button>
            </div>
          </div>
          <div className="flex-1 relative overflow-hidden">
            {zoomControls}
            <div className="h-full overflow-auto p-8">
              <div
                className="flex flex-col items-center gap-0 min-w-max"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "top center",
                  transition: "transform 0.2s ease",
                }}
              >
                {filteredTree.map(node => (
                  <OrgCardNode key={node.userId} node={node} onToggle={toggleNode} searchQuery={searchQuery} />
                ))}
                {orphanNodes.length > 0 && filteredTree.length > 0 && (
                  <div className="w-full flex flex-col items-center mt-10 pt-6 border-t border-destructive/30">
                    <div className="flex items-center gap-2 mb-4 text-xs text-destructive font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Disconnected Users
                    </div>
                    <div className="flex items-start gap-6 flex-wrap justify-center">
                      {orphanNodes.map(node => (
                        <OrgCardNode key={node.userId} node={node} onToggle={toggleNode} searchQuery={searchQuery} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Controls */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Reporting Managers:</span>
              <Select value={managerFilter} onValueChange={setManagerFilter}>
                <SelectTrigger className="h-8 w-[180px] text-xs">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All</SelectItem>
                  {managers.map(m => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="h-8 pl-7 w-[160px] text-xs bg-secondary border-border"
              />
            </div>

            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchHierarchy}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Terminal organization chart based on supervisor mappings. {totalUsers} user{totalUsers !== 1 ? "s" : ""}.
        </p>

        {/* Orphan Warning Banner */}
        {orphanNodes.length > 0 && (
          <div className="flex items-start gap-3 p-3 rounded-lg border border-destructive/40 bg-destructive/5">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-destructive">
                Broken Chain Detected — {orphanNodes.length} user{orphanNodes.length !== 1 ? "s" : ""} without a supervisor
              </p>
              <p className="text-[11px] text-muted-foreground">
                The following users have no reporting manager assigned and are disconnected from the hierarchy. 
                Assign a supervisor in Users &amp; Roles to fix.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {orphanNodes.map(n => (
                  <Badge key={n.userId} variant="destructive" className="text-[10px] gap-1">
                    <Link2Off className="h-2.5 w-2.5" />
                    {n.displayName} ({n.roleName})
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Chart Container */}
        <div ref={chartWrapperRef} className="relative border border-border rounded-lg bg-muted/5 overflow-hidden" style={{ minHeight: "400px" }}>
          {zoomControls}
          {chartContent}
        </div>
      </div>
    </>
  );
}
