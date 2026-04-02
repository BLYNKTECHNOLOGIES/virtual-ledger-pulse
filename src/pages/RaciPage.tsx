
import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ArrowLeft, Users, Target, BarChart3, Grid3X3, ChevronDown, ChevronRight,
  Shield, Settings, Loader2
} from 'lucide-react';
import {
  useRaciRoles, useRaciCategories, useRaciTasks, useRaciAssignments,
  useRoleKras, useRoleKpis,
  type RaciRole
} from '@/hooks/useRaciData';
import { RaciAdminPanel } from '@/components/raci/RaciAdminPanel';
import { supabase } from '@/integrations/supabase/client';
import { QueryProvider } from '@/components/QueryProvider';

const RACI_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  R: { bg: 'bg-blue-500/15', text: 'text-blue-600 dark:text-blue-400', label: 'Responsible' },
  A: { bg: 'bg-red-500/15', text: 'text-red-600 dark:text-red-400', label: 'Accountable' },
  C: { bg: 'bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400', label: 'Consulted' },
  I: { bg: 'bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400', label: 'Informed' },
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

  // Check if current user is super admin
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

  // Auto-expand all categories
  useEffect(() => {
    if (categories.length > 0 && expandedCategories.size === 0) {
      setExpandedCategories(new Set(categories.map(c => c.id)));
    }
  }, [categories]);

  // Build assignment lookup
  const assignmentMap = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    assignments.forEach(a => {
      if (!map.has(a.task_id)) map.set(a.task_id, new Map());
      map.get(a.task_id)!.set(a.role_id, a.assignment_type);
    });
    return map;
  }, [assignments]);

  // Tasks grouped by category
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
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  BlynkEx — Role Clarity & RACI
                </h1>
                <p className="text-xs text-muted-foreground">Responsibility Assignment, KRAs & KPIs</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* RACI Legend */}
              <div className="hidden sm:flex items-center gap-1.5">
                {Object.entries(RACI_COLORS).map(([letter, config]) => (
                  <Tooltip key={letter}>
                    <TooltipTrigger asChild>
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold ${config.bg} ${config.text}`}>
                        {letter}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{config.label}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
              {isSuperAdmin && (
                <Button variant="outline" size="sm" onClick={() => setShowAdmin(true)} className="gap-1.5">
                  <Settings className="h-3.5 w-3.5" />
                  Manage
                </Button>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
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
            <Tabs defaultValue="matrix" className="space-y-4">
              <TabsList className="bg-muted/50">
                <TabsTrigger value="matrix" className="gap-1.5">
                  <Grid3X3 className="h-3.5 w-3.5" />
                  RACI Matrix
                </TabsTrigger>
                <TabsTrigger value="kra-kpi" className="gap-1.5">
                  <Target className="h-3.5 w-3.5" />
                  KRA & KPI
                </TabsTrigger>
                <TabsTrigger value="roles" className="gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Role Overview
                </TabsTrigger>
              </TabsList>

              {/* RACI Matrix Tab */}
              <TabsContent value="matrix" className="space-y-4">
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
              <TabsContent value="kra-kpi" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Role selector sidebar */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground px-1 mb-2">Select Role</p>
                    {roles.map(role => (
                      <button
                        key={role.id}
                        onClick={() => setSelectedRoleId(role.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedRoleId === role.id
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'hover:bg-muted text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {role.color && (
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                          )}
                          {role.name}
                        </div>
                        {role.department && (
                          <span className="text-xs text-muted-foreground">{role.department}</span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* KRA/KPI detail */}
                  <div className="md:col-span-3">
                    {selectedRole ? (
                      <KraKpiView role={selectedRole} kras={roleKras} kpis={roleKpis} />
                    ) : (
                      <Card className="text-center py-16">
                        <CardContent>
                          <Target className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                          <p className="text-sm text-muted-foreground">Select a role to view KRAs & KPIs</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Role Overview Tab */}
              <TabsContent value="roles" className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {roles.map(role => {
                    const roleAssignments = assignments.filter(a => a.role_id === role.id);
                    const rCount = roleAssignments.filter(a => a.assignment_type === 'R').length;
                    const aCount = roleAssignments.filter(a => a.assignment_type === 'A').length;
                    const cCount = roleAssignments.filter(a => a.assignment_type === 'C').length;
                    const iCount = roleAssignments.filter(a => a.assignment_type === 'I').length;
                    const kraCount = allKras.filter(k => k.role_id === role.id).length;

                    return (
                      <Card key={role.id} className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {role.color && (
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: role.color }} />
                              )}
                              <CardTitle className="text-sm">{role.name}</CardTitle>
                            </div>
                            {role.department && (
                              <Badge variant="secondary" className="text-[10px]">{role.department}</Badge>
                            )}
                          </div>
                          {role.description && (
                            <p className="text-xs text-muted-foreground mt-1">{role.description}</p>
                          )}
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-2 flex-wrap">
                            {rCount > 0 && <Badge className={`${RACI_COLORS.R.bg} ${RACI_COLORS.R.text} border-0`}>R: {rCount}</Badge>}
                            {aCount > 0 && <Badge className={`${RACI_COLORS.A.bg} ${RACI_COLORS.A.text} border-0`}>A: {aCount}</Badge>}
                            {cCount > 0 && <Badge className={`${RACI_COLORS.C.bg} ${RACI_COLORS.C.text} border-0`}>C: {cCount}</Badge>}
                            {iCount > 0 && <Badge className={`${RACI_COLORS.I.bg} ${RACI_COLORS.I.text} border-0`}>I: {iCount}</Badge>}
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <Target className="h-3 w-3" />
                            {kraCount} KRAs defined
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </main>

        {/* Admin Panel */}
        {showAdmin && isSuperAdmin && (
          <RaciAdminPanel open={showAdmin} onOpenChange={setShowAdmin} />
        )}
      </div>
    </TooltipProvider>
  );
}

// RACI Matrix sub-component
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
      <Card className="text-center py-16">
        <CardContent>
          <Grid3X3 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No RACI data available yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ScrollArea className="w-full">
      <div className="min-w-[800px]">
        {/* Sticky header row */}
        <div className="flex items-stretch border border-border rounded-t-lg bg-muted/30 sticky top-0 z-10">
          <div className="w-[280px] shrink-0 px-4 py-3 font-semibold text-xs text-muted-foreground border-r border-border">
            Task / Activity
          </div>
          {roles.map(role => (
            <div
              key={role.id}
              className="flex-1 min-w-[90px] px-2 py-3 text-center border-r border-border last:border-r-0"
            >
              <div className="flex flex-col items-center gap-1">
                {role.color && (
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: role.color }} />
                )}
                <span className="text-xs font-semibold text-foreground leading-tight">{role.name}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Category groups */}
        {categories.map(cat => {
          const catTasks = tasksByCategory.get(cat.id) || [];
          const isExpanded = expandedCategories.has(cat.id);

          return (
            <div key={cat.id} className="border-x border-b border-border last:rounded-b-lg">
              {/* Category header */}
              <button
                onClick={() => toggleCategory(cat.id)}
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/10 hover:bg-muted/20 transition-colors text-left"
              >
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                {cat.icon && <span className="text-sm">{cat.icon}</span>}
                <span className="text-xs font-semibold text-foreground">{cat.name}</span>
                <Badge variant="secondary" className="text-[10px] ml-auto">{catTasks.length}</Badge>
              </button>

              {/* Tasks */}
              {isExpanded && catTasks.map((task, idx) => (
                <div
                  key={task.id}
                  className={`flex items-stretch ${idx < catTasks.length - 1 ? 'border-b border-border/50' : ''}`}
                >
                  <div className="w-[280px] shrink-0 px-4 py-2.5 border-r border-border">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs text-foreground">{task.name}</span>
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
                        className={`flex-1 min-w-[90px] flex items-center justify-center border-r border-border/50 last:border-r-0 ${
                          config ? config.bg : ''
                        }`}
                      >
                        {config && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={`text-sm font-bold ${config.text}`}>{type}</span>
                            </TooltipTrigger>
                            <TooltipContent>{config.label}</TooltipContent>
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

// KRA/KPI sub-component
function KraKpiView({
  role, kras, kpis,
}: {
  role: RaciRole;
  kras: any[];
  kpis: any[];
}) {
  if (kras.length === 0) {
    return (
      <Card className="text-center py-12">
        <CardContent>
          <Target className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No KRAs defined for {role.name}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {role.color && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: role.color }} />}
        <h2 className="text-base font-semibold text-foreground">{role.name}</h2>
        {role.department && <Badge variant="secondary" className="text-[10px]">{role.department}</Badge>}
      </div>
      {role.description && <p className="text-sm text-muted-foreground -mt-2">{role.description}</p>}

      {kras.map(kra => {
        const kraKpis = kpis.filter(k => k.kra_id === kra.id);
        return (
          <Card key={kra.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  {kra.title}
                </CardTitle>
                {kra.weightage > 0 && (
                  <Badge variant="outline" className="text-[10px]">{kra.weightage}% Weight</Badge>
                )}
              </div>
              {kra.description && <p className="text-xs text-muted-foreground">{kra.description}</p>}
            </CardHeader>
            <CardContent>
              {kraKpis.length > 0 ? (
                <div className="space-y-2">
                  {kraKpis.map(kpi => (
                    <div key={kpi.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/30 border border-border/50">
                      <BarChart3 className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">{kpi.metric}</p>
                        <div className="flex flex-wrap gap-3 mt-1 text-[10px] text-muted-foreground">
                          {kpi.target && <span>🎯 Target: {kpi.target}</span>}
                          {kpi.measurement_method && <span>📐 {kpi.measurement_method}</span>}
                          {kpi.frequency && <span>🔄 {kpi.frequency}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No KPIs defined for this KRA</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// Wrapped with QueryProvider for public route
export default function RaciPage() {
  return (
    <QueryProvider>
      <RaciPageContent />
    </QueryProvider>
  );
}
