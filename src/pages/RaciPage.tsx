
import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft, Users, Target, BarChart3, Grid3X3, ChevronDown, ChevronRight,
  Shield, Settings, Loader2, Briefcase, Scale, AlertTriangle, CheckCircle2
} from 'lucide-react';
import {
  useRaciRoles, useRaciCategories, useRaciTasks, useRaciAssignments,
  useRoleKras, useRoleKpis,
  type RaciRole
} from '@/hooks/useRaciData';
import { RaciAdminPanel } from '@/components/raci/RaciAdminPanel';
import { supabase } from '@/integrations/supabase/client';
import { QueryProvider } from '@/components/QueryProvider';

const RACI_COLORS: Record<string, { bg: string; text: string; border: string; label: string; description: string }> = {
  R: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
    label: 'Responsible',
    description: 'Executes the task. The person or role who does the work to complete the activity.',
  },
  A: {
    bg: 'bg-red-500/10',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-200 dark:border-red-800',
    label: 'Accountable',
    description: 'Final owner. Only one per task — the person who is ultimately answerable for the correct completion.',
  },
  C: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
    label: 'Consulted',
    description: 'Must provide input before the work is done. Two-way communication — their expertise shapes the decision.',
  },
  I: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800',
    label: 'Informed',
    description: 'Kept in the loop after decisions or actions are taken. One-way communication — no input required.',
  },
};

function RaciPageContent() {
  const navigate = useNavigate();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showAdmin, setShowAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const { data: roles = [], isLoading: rolesLoading } = useRaciRoles();
  const { data: categories = [], isLoading: catsLoading } = useRaciCategories();
  const { data: tasks = [], isLoading: tasksLoading } = useRaciTasks();
  const { data: assignments = [] } = useRaciAssignments();
  const { data: allKras = [] } = useRoleKras();
  const { data: allKpis = [] } = useRoleKpis();

  const isLoading = rolesLoading || catsLoading || tasksLoading;

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('id', session.user.id)
        .single();
      if (!data) return;
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role:roles(name)')
        .eq('user_id', data.id);
      if (roleData?.some((r: any) => r.role?.name?.toLowerCase() === 'super admin')) {
        setIsSuperAdmin(true);
      }
    };
    checkAdmin();
  }, []);

  useEffect(() => {
    if (categories.length > 0 && expandedCategories.size === 0) {
      setExpandedCategories(new Set(categories.map(c => c.id)));
    }
  }, [categories]);

  const assignmentMap = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    assignments.forEach(a => {
      if (!map.has(a.task_id)) map.set(a.task_id, new Map());
      map.get(a.task_id)!.set(a.role_id, a.assignment_type);
    });
    return map;
  }, [assignments]);

  const tasksByCategory = useMemo(() => {
    const map = new Map<string, typeof tasks>();
    tasks.forEach(t => {
      if (!map.has(t.category_id)) map.set(t.category_id, []);
      map.get(t.category_id)!.push(t);
    });
    return map;
  }, [tasks]);

  const selectedRole = roles.find(r => r.id === selectedRoleId);
  const roleKras = allKras.filter(k => k.role_id === selectedRoleId);
  const roleKpis = allKpis.filter(k => k.role_id === selectedRoleId);

  const toggleCategory = (id: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading governance framework...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        {/* Header — clean corporate */}
        <header className="sticky top-0 z-50 border-b border-border bg-background">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Separator orientation="vertical" className="h-6" />
                <div>
                  <h1 className="text-base font-semibold text-foreground tracking-tight">
                    BlynkEx Governance Framework
                  </h1>
                  <p className="text-xs text-muted-foreground">Role Clarity, RACI Matrix, KRAs & KPIs</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {isSuperAdmin && (
                  <Button variant="outline" size="sm" onClick={() => setShowAdmin(true)} className="gap-1.5 text-xs">
                    <Settings className="h-3.5 w-3.5" />
                    Manage
                  </Button>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-[1440px] mx-auto px-6 lg:px-8 py-8">
          {roles.length === 0 ? (
            <Card className="text-center py-16">
              <CardContent>
                <Users className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">No roles defined yet.</p>
                {isSuperAdmin && (
                  <Button variant="outline" className="mt-4" onClick={() => setShowAdmin(true)}>
                    Add Roles & Data
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue="matrix" className="space-y-6">
              <div className="flex items-center justify-between">
                <TabsList className="bg-muted/40 h-10">
                  <TabsTrigger value="matrix" className="gap-1.5 text-xs data-[state=active]:shadow-sm">
                    <Grid3X3 className="h-3.5 w-3.5" />
                    RACI Matrix
                  </TabsTrigger>
                  <TabsTrigger value="kra-kpi" className="gap-1.5 text-xs data-[state=active]:shadow-sm">
                    <Target className="h-3.5 w-3.5" />
                    KRA & KPI
                  </TabsTrigger>
                  <TabsTrigger value="roles" className="gap-1.5 text-xs data-[state=active]:shadow-sm">
                    <Briefcase className="h-3.5 w-3.5" />
                    Role Charter
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* RACI Matrix Tab */}
              <TabsContent value="matrix" className="space-y-6">
                {/* RACI Legend Banner */}
                <div className="rounded-lg border border-border bg-muted/20 p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Understanding the RACI Framework</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {Object.entries(RACI_COLORS).map(([letter, config]) => (
                      <div key={letter} className={`rounded-md border ${config.border} ${config.bg} p-3`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${config.text} bg-background border ${config.border}`}>
                            {letter}
                          </span>
                          <span className={`text-sm font-semibold ${config.text}`}>{config.label}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{config.description}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <p className="text-[11px] text-muted-foreground">
                      <strong className="text-foreground">Governance Rule:</strong> Every activity has exactly one Accountable (A) owner — ensuring single-point ownership and eliminating ambiguity in the chain of command.
                    </p>
                  </div>
                </div>

                <RaciMatrixView
                  roles={roles}
                  categories={categories}
                  tasksByCategory={tasksByCategory}
                  assignmentMap={assignmentMap}
                  expandedCategories={expandedCategories}
                  toggleCategory={toggleCategory}
                />
              </TabsContent>

              {/* KRA & KPI Tab */}
              <TabsContent value="kra-kpi" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
                  {/* Role selector sidebar */}
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-3">Select Role</p>
                    {roles.map(role => (
                      <button
                        key={role.id}
                        onClick={() => setSelectedRoleId(role.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-all ${
                          selectedRoleId === role.id
                            ? 'bg-foreground text-background font-medium shadow-sm'
                            : 'hover:bg-muted text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {role.color && (
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: selectedRoleId === role.id ? 'currentColor' : role.color }} />
                          )}
                          <span className="truncate">{role.name}</span>
                        </div>
                        {role.department && (
                          <span className={`text-[10px] ml-[18px] block ${selectedRoleId === role.id ? 'opacity-70' : 'text-muted-foreground'}`}>{role.department}</span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* KRA/KPI detail */}
                  <div>
                    {selectedRole ? (
                      <KraKpiView role={selectedRole} kras={roleKras} kpis={roleKpis} />
                    ) : (
                      <div className="flex items-center justify-center h-64 rounded-lg border border-dashed border-border">
                        <div className="text-center">
                          <Target className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
                          <p className="text-sm text-muted-foreground">Select a role to view its performance framework</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Role Charter Tab */}
              <TabsContent value="roles" className="space-y-6">
                <RoleCharterView roles={roles} assignments={assignments} allKras={allKras} />
              </TabsContent>
            </Tabs>
          )}
        </main>

        {showAdmin && isSuperAdmin && (
          <RaciAdminPanel open={showAdmin} onOpenChange={setShowAdmin} />
        )}
      </div>
    </TooltipProvider>
  );
}

/* ─── RACI Matrix ─── */
function RaciMatrixView({
  roles, categories, tasksByCategory, assignmentMap, expandedCategories, toggleCategory,
}: {
  roles: RaciRole[];
  categories: any[];
  tasksByCategory: Map<string, any[]>;
  assignmentMap: Map<string, Map<string, string>>;
  expandedCategories: Set<string>;
  toggleCategory: (id: string) => void;
}) {
  if (categories.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 rounded-lg border border-dashed border-border">
        <p className="text-sm text-muted-foreground">No RACI data available</p>
      </div>
    );
  }

  return (
    <ScrollArea className="w-full">
      <div className="min-w-[900px]">
        {/* Header row */}
        <div className="flex items-stretch border border-border rounded-t-lg bg-muted/40">
          <div className="w-[300px] shrink-0 px-5 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider border-r border-border">
            Activity
          </div>
          {roles.map(role => (
            <div
              key={role.id}
              className="flex-1 min-w-[100px] px-2 py-3 text-center border-r border-border last:border-r-0"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center gap-1 cursor-help">
                    <span className="text-[10px] font-bold text-foreground leading-tight">{role.name}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="text-xs font-medium">{role.name}</p>
                  {role.description && <p className="text-[10px] text-muted-foreground mt-0.5">{role.description}</p>}
                </TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>

        {/* Category groups */}
        {categories.map(cat => {
          const catTasks = tasksByCategory.get(cat.id) || [];
          const isExpanded = expandedCategories.has(cat.id);

          return (
            <div key={cat.id} className="border-x border-b border-border last:rounded-b-lg">
              <button
                onClick={() => toggleCategory(cat.id)}
                className="w-full flex items-center gap-2 px-5 py-3 bg-muted/20 hover:bg-muted/30 transition-colors text-left"
              >
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="text-xs font-semibold text-foreground">{cat.name}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{catTasks.length} activities</span>
              </button>

              {isExpanded && catTasks.map((task, idx) => (
                <div
                  key={task.id}
                  className={`flex items-stretch hover:bg-muted/10 transition-colors ${idx < catTasks.length - 1 ? 'border-b border-border/40' : ''}`}
                >
                  <div className="w-[300px] shrink-0 px-5 py-2.5 border-r border-border/50">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs text-foreground leading-relaxed">{task.name}</span>
                      </TooltipTrigger>
                      {task.description && (
                        <TooltipContent side="right" className="max-w-xs">
                          <p className="text-xs">{task.description}</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </div>
                  {roles.map(role => {
                    const type = assignmentMap.get(task.id)?.get(role.id);
                    const config = type ? RACI_COLORS[type] : null;
                    return (
                      <div
                        key={role.id}
                        className={`flex-1 min-w-[100px] flex items-center justify-center border-r border-border/30 last:border-r-0 ${
                          config ? config.bg : ''
                        }`}
                      >
                        {config && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={`text-xs font-bold ${config.text}`}>{type}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-medium">{config.label}</p>
                              <p className="text-[10px] text-muted-foreground max-w-[200px]">{config.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

/* ─── KRA / KPI View ─── */
function KraKpiView({
  role, kras, kpis,
}: {
  role: RaciRole;
  kras: any[];
  kpis: any[];
}) {
  if (kras.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 rounded-lg border border-dashed border-border">
        <div className="text-center">
          <Target className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No KRAs defined for {role.name}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Role header */}
      <div className="border-b border-border pb-4">
        <div className="flex items-center gap-3 mb-2">
          {role.color && <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: role.color }} />}
          <h2 className="text-lg font-semibold text-foreground">{role.name}</h2>
          {role.department && <Badge variant="outline" className="text-[10px] font-normal">{role.department}</Badge>}
        </div>
        {role.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{role.description}</p>
        )}
      </div>

      {/* KRAs */}
      {kras.map(kra => {
        const kraKpis = kpis.filter(k => k.kra_id === kra.id);
        return (
          <div key={kra.id} className="rounded-lg border border-border overflow-hidden">
            {/* KRA header */}
            <div className="bg-muted/30 px-5 py-3 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <h3 className="text-sm font-semibold text-foreground">{kra.title}</h3>
                </div>
                {kra.weightage > 0 && (
                  <span className="text-xs font-medium text-muted-foreground">{kra.weightage}% Weight</span>
                )}
              </div>
              {kra.description && <p className="text-xs text-muted-foreground mt-1 ml-4">{kra.description}</p>}
            </div>

            {/* KPIs */}
            {kraKpis.length > 0 ? (
              <div className="divide-y divide-border/50">
                {kraKpis.map(kpi => (
                  <div key={kpi.id} className="px-5 py-3 hover:bg-muted/10 transition-colors">
                    <div className="flex items-start gap-3">
                      <BarChart3 className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">{kpi.metric}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                          {kpi.target && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                              Target: {kpi.target}
                            </span>
                          )}
                          {kpi.measurement_method && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Scale className="h-3 w-3 text-blue-500" />
                              {kpi.measurement_method}
                            </span>
                          )}
                          {kpi.frequency && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <BarChart3 className="h-3 w-3 text-amber-500" />
                              {kpi.frequency}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-4">
                <p className="text-xs text-muted-foreground">No KPIs defined for this KRA</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Role Charter View ─── */
function RoleCharterView({
  roles, assignments, allKras,
}: {
  roles: RaciRole[];
  assignments: any[];
  allKras: any[];
}) {
  return (
    <div className="space-y-4">
      {/* Structural insight banner */}
      <div className="rounded-lg border border-border bg-muted/20 p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Organizational Governance Structure</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {[
            { label: 'Frontline Execution', role: 'Operations Manager', icon: Shield },
            { label: 'Internal Risk Shield', role: 'Internal Compliance Officer', icon: AlertTriangle },
            { label: 'External Risk Shield', role: 'External Compliance Officer', icon: Scale },
            { label: 'System & Funds Control', role: 'General Manager', icon: Briefcase },
            { label: 'Strategic Governance', role: 'Managing Directors', icon: Target },
          ].map(item => (
            <div key={item.label} className="p-3 rounded-md border border-border bg-background">
              <item.icon className="h-3.5 w-3.5 text-primary mb-1.5" />
              <p className="font-semibold text-foreground">{item.label}</p>
              <p className="text-muted-foreground mt-0.5">{item.role}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Role cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {roles.map(role => {
          const roleAssignments = assignments.filter(a => a.role_id === role.id);
          const rCount = roleAssignments.filter(a => a.assignment_type === 'R').length;
          const aCount = roleAssignments.filter(a => a.assignment_type === 'A').length;
          const cCount = roleAssignments.filter(a => a.assignment_type === 'C').length;
          const iCount = roleAssignments.filter(a => a.assignment_type === 'I').length;
          const kraCount = allKras.filter(k => k.role_id === role.id).length;

          return (
            <div key={role.id} className="rounded-lg border border-border overflow-hidden hover:shadow-sm transition-shadow">
              {/* Role color accent */}
              <div className="h-1" style={{ backgroundColor: role.color || 'hsl(var(--primary))' }} />
              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{role.name}</h3>
                    {role.department && (
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{role.department}</span>
                    )}
                  </div>
                </div>
                {role.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4">{role.description}</p>
                )}
                <Separator className="mb-3" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {rCount > 0 && (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded ${RACI_COLORS.R.bg} ${RACI_COLORS.R.text}`}>
                        R {rCount}
                      </span>
                    )}
                    {aCount > 0 && (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded ${RACI_COLORS.A.bg} ${RACI_COLORS.A.text}`}>
                        A {aCount}
                      </span>
                    )}
                    {cCount > 0 && (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded ${RACI_COLORS.C.bg} ${RACI_COLORS.C.text}`}>
                        C {cCount}
                      </span>
                    )}
                    {iCount > 0 && (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded ${RACI_COLORS.I.bg} ${RACI_COLORS.I.text}`}>
                        I {iCount}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{kraCount} KRAs</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function RaciPage() {
  return (
    <QueryProvider>
      <RaciPageContent />
    </QueryProvider>
  );
}
