
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Users, FolderTree, ListTodo, Target, BarChart3, Settings, Grid3X3 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useRaciRoles, useRaciCategories, useRaciTasks, useRaciAssignments,
  useRoleKras, useRoleKpis, useRaciMutations,
} from '@/hooks/useRaciData';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RaciAdminPanel({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            RACI Admin Panel
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="roles" className="flex-1 min-h-0 flex flex-col">
          <div className="px-6">
            <TabsList className="w-full bg-muted/50">
              <TabsTrigger value="roles" className="gap-1 text-xs"><Users className="h-3 w-3" />Roles</TabsTrigger>
              <TabsTrigger value="categories" className="gap-1 text-xs"><FolderTree className="h-3 w-3" />Categories</TabsTrigger>
              <TabsTrigger value="tasks" className="gap-1 text-xs"><ListTodo className="h-3 w-3" />Tasks</TabsTrigger>
              <TabsTrigger value="assignments" className="gap-1 text-xs"><Grid3X3 className="h-3 w-3" />RACI</TabsTrigger>
              <TabsTrigger value="kras" className="gap-1 text-xs"><Target className="h-3 w-3" />KRAs</TabsTrigger>
              <TabsTrigger value="kpis" className="gap-1 text-xs"><BarChart3 className="h-3 w-3" />KPIs</TabsTrigger>
            </TabsList>
          </div>
          <ScrollArea className="flex-1 min-h-0 px-6 pb-4">
            <TabsContent value="roles"><RolesEditor /></TabsContent>
            <TabsContent value="categories"><CategoriesEditor /></TabsContent>
            <TabsContent value="tasks"><TasksEditor /></TabsContent>
            <TabsContent value="assignments"><AssignmentsEditor /></TabsContent>
            <TabsContent value="kras"><KrasEditor /></TabsContent>
            <TabsContent value="kpis"><KpisEditor /></TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function RolesEditor() {
  const { data: roles = [] } = useRaciRoles();
  const { upsertRole, deleteRole } = useRaciMutations();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState('');
  const [color, setColor] = useState('#4F46E5');

  const handleAdd = () => {
    if (!name.trim()) return;
    upsertRole.mutate(
      { name: name.trim(), description: description || null, department: department || null, color },
      {
        onSuccess: () => { setName(''); setDescription(''); setDepartment(''); toast.success('Role added'); },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Role Name *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Operations Manager" className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Department</Label>
          <Input value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Operations" className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description" className="h-8 text-sm" />
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">Color</Label>
            <Input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-8 w-16" />
          </div>
          <Button onClick={handleAdd} size="sm" className="gap-1" disabled={upsertRole.isPending}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        {roles.map(role => (
          <div key={role.id} className="flex items-center justify-between p-2 rounded-lg border border-border">
            <div className="flex items-center gap-2">
              {role.color && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: role.color }} />}
              <span className="text-sm font-medium">{role.name}</span>
              {role.department && <Badge variant="secondary" className="text-[10px]">{role.department}</Badge>}
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteRole.mutate(role.id, { onSuccess: () => toast.success('Deleted') })}>
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoriesEditor() {
  const { data: categories = [] } = useRaciCategories();
  const { upsertCategory, deleteCategory } = useRaciMutations();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');

  const handleAdd = () => {
    if (!name.trim()) return;
    upsertCategory.mutate(
      { name: name.trim(), icon: icon || null, display_order: categories.length },
      {
        onSuccess: () => { setName(''); setIcon(''); toast.success('Category added'); },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <Label className="text-xs">Category Name *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Treasury & Fund Management" className="h-8 text-sm" />
        </div>
        <div className="w-20">
          <Label className="text-xs">Icon (emoji)</Label>
          <Input value={icon} onChange={e => setIcon(e.target.value)} placeholder="💰" className="h-8 text-sm" />
        </div>
        <Button onClick={handleAdd} size="sm" className="gap-1" disabled={upsertCategory.isPending}>
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      <div className="space-y-1">
        {categories.map(cat => (
          <div key={cat.id} className="flex items-center justify-between p-2 rounded-lg border border-border">
            <div className="flex items-center gap-2">
              {cat.icon && <span>{cat.icon}</span>}
              <span className="text-sm">{cat.name}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteCategory.mutate(cat.id, { onSuccess: () => toast.success('Deleted') })}>
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TasksEditor() {
  const { data: categories = [] } = useRaciCategories();
  const { data: tasks = [] } = useRaciTasks();
  const { upsertTask, deleteTask } = useRaciMutations();
  const [categoryId, setCategoryId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleAdd = () => {
    if (!name.trim() || !categoryId) return;
    upsertTask.mutate(
      { name: name.trim(), category_id: categoryId, description: description || null, display_order: tasks.length },
      {
        onSuccess: () => { setName(''); setDescription(''); toast.success('Task added'); },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Category *</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Task Name *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Approve fund transfers" className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" className="h-8 text-sm" />
        </div>
        <div className="flex items-end">
          <Button onClick={handleAdd} size="sm" className="gap-1" disabled={upsertTask.isPending}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        {categories.map(cat => {
          const catTasks = tasks.filter(t => t.category_id === cat.id);
          if (catTasks.length === 0) return null;
          return (
            <div key={cat.id} className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground mt-2">{cat.icon} {cat.name}</p>
              {catTasks.map(task => (
                <div key={task.id} className="flex items-center justify-between p-2 rounded-lg border border-border ml-4">
                  <span className="text-sm">{task.name}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteTask.mutate(task.id, { onSuccess: () => toast.success('Deleted') })}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AssignmentsEditor() {
  const { data: roles = [] } = useRaciRoles();
  const { data: tasks = [] } = useRaciTasks();
  const { data: categories = [] } = useRaciCategories();
  const { data: assignments = [] } = useRaciAssignments();
  const { upsertAssignment, deleteAssignment } = useRaciMutations();
  const [taskId, setTaskId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [type, setType] = useState('R');

  const handleAdd = () => {
    if (!taskId || !roleId) return;
    upsertAssignment.mutate(
      { task_id: taskId, role_id: roleId, assignment_type: type },
      {
        onSuccess: () => toast.success('Assignment saved'),
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-3 gap-3 items-end">
        <div>
          <Label className="text-xs">Task *</Label>
          <Select value={taskId} onValueChange={setTaskId}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select task" /></SelectTrigger>
            <SelectContent>
              {categories.map(cat => {
                const catTasks = tasks.filter(t => t.category_id === cat.id);
                return catTasks.map(t => (
                  <SelectItem key={t.id} value={t.id}>{cat.icon} {t.name}</SelectItem>
                ));
              })}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Role *</Label>
          <Select value={roleId} onValueChange={setRoleId}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select role" /></SelectTrigger>
            <SelectContent>
              {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 items-end">
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-8 text-sm w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="R">R - Responsible</SelectItem>
                <SelectItem value="A">A - Accountable</SelectItem>
                <SelectItem value="C">C - Consulted</SelectItem>
                <SelectItem value="I">I - Informed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} size="sm" className="gap-1" disabled={upsertAssignment.isPending}>
            <Plus className="h-3 w-3" /> Set
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        {assignments.map(a => {
          const task = tasks.find(t => t.id === a.task_id);
          const role = roles.find(r => r.id === a.role_id);
          if (!task || !role) return null;
          return (
            <div key={a.id} className="flex items-center justify-between p-2 rounded-lg border border-border">
              <div className="flex items-center gap-2 text-sm">
                <Badge className={`${(RACI_BADGE as any)[a.assignment_type]?.bg} ${(RACI_BADGE as any)[a.assignment_type]?.text} border-0 text-xs`}>
                  {a.assignment_type}
                </Badge>
                <span>{task.name}</span>
                <span className="text-muted-foreground">→</span>
                <span className="font-medium">{role.name}</span>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6"
                onClick={() => deleteAssignment.mutate({ taskId: a.task_id, roleId: a.role_id }, { onSuccess: () => toast.success('Removed') })}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const RACI_BADGE = {
  R: { bg: 'bg-blue-500/15', text: 'text-blue-600' },
  A: { bg: 'bg-red-500/15', text: 'text-red-600' },
  C: { bg: 'bg-amber-500/15', text: 'text-amber-600' },
  I: { bg: 'bg-emerald-500/15', text: 'text-emerald-600' },
};

function KrasEditor() {
  const { data: roles = [] } = useRaciRoles();
  const { data: kras = [] } = useRoleKras();
  const { upsertKra, deleteKra } = useRaciMutations();
  const [roleId, setRoleId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [weightage, setWeightage] = useState('');

  const handleAdd = () => {
    if (!roleId || !title.trim()) return;
    upsertKra.mutate(
      { role_id: roleId, title: title.trim(), description: description || null, weightage: weightage ? parseFloat(weightage) : 0, display_order: kras.length },
      {
        onSuccess: () => { setTitle(''); setDescription(''); setWeightage(''); toast.success('KRA added'); },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Role *</Label>
          <Select value={roleId} onValueChange={setRoleId}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select role" /></SelectTrigger>
            <SelectContent>
              {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">KRA Title *</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Fund Management Efficiency" className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional details" className="h-8 text-sm" />
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">Weight %</Label>
            <Input type="number" value={weightage} onChange={e => setWeightage(e.target.value)} placeholder="20" className="h-8 text-sm w-20" />
          </div>
          <Button onClick={handleAdd} size="sm" className="gap-1" disabled={upsertKra.isPending}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        {roles.map(role => {
          const roleKras = kras.filter(k => k.role_id === role.id);
          if (roleKras.length === 0) return null;
          return (
            <div key={role.id}>
              <p className="text-xs font-semibold text-muted-foreground mt-2">{role.name}</p>
              {roleKras.map(kra => (
                <div key={kra.id} className="flex items-center justify-between p-2 rounded-lg border border-border ml-4 mt-1">
                  <div>
                    <span className="text-sm">{kra.title}</span>
                    {kra.weightage > 0 && <Badge variant="outline" className="text-[10px] ml-2">{kra.weightage}%</Badge>}
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteKra.mutate(kra.id, { onSuccess: () => toast.success('Deleted') })}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KpisEditor() {
  const { data: roles = [] } = useRaciRoles();
  const { data: kras = [] } = useRoleKras();
  const { data: kpis = [] } = useRoleKpis();
  const { upsertKpi, deleteKpi } = useRaciMutations();
  const [roleId, setRoleId] = useState('');
  const [kraId, setKraId] = useState('');
  const [metric, setMetric] = useState('');
  const [target, setTarget] = useState('');
  const [method, setMethod] = useState('');
  const [frequency, setFrequency] = useState('Monthly');

  const filteredKras = kras.filter(k => k.role_id === roleId);

  const handleAdd = () => {
    if (!kraId || !roleId || !metric.trim()) return;
    upsertKpi.mutate(
      { kra_id: kraId, role_id: roleId, metric: metric.trim(), target: target || null, measurement_method: method || null, frequency, display_order: kpis.length },
      {
        onSuccess: () => { setMetric(''); setTarget(''); setMethod(''); toast.success('KPI added'); },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Role *</Label>
          <Select value={roleId} onValueChange={v => { setRoleId(v); setKraId(''); }}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select role" /></SelectTrigger>
            <SelectContent>
              {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">KRA *</Label>
          <Select value={kraId} onValueChange={setKraId}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select KRA" /></SelectTrigger>
            <SelectContent>
              {filteredKras.map(k => <SelectItem key={k.id} value={k.id}>{k.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">KPI Metric *</Label>
          <Input value={metric} onChange={e => setMetric(e.target.value)} placeholder="e.g. Transaction error rate" className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Target</Label>
          <Input value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. < 0.5%" className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Measurement Method</Label>
          <Input value={method} onChange={e => setMethod(e.target.value)} placeholder="e.g. Weekly audit" className="h-8 text-sm" />
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">Frequency</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="h-8 text-sm w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Daily">Daily</SelectItem>
                <SelectItem value="Weekly">Weekly</SelectItem>
                <SelectItem value="Monthly">Monthly</SelectItem>
                <SelectItem value="Quarterly">Quarterly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} size="sm" className="gap-1" disabled={upsertKpi.isPending}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        {kpis.map(kpi => {
          const role = roles.find(r => r.id === kpi.role_id);
          const kra = kras.find(k => k.id === kpi.kra_id);
          return (
            <div key={kpi.id} className="flex items-center justify-between p-2 rounded-lg border border-border">
              <div className="text-sm">
                <span className="font-medium">{kpi.metric}</span>
                <span className="text-muted-foreground text-xs ml-2">({role?.name} / {kra?.title})</span>
                {kpi.target && <Badge variant="outline" className="text-[10px] ml-2">🎯 {kpi.target}</Badge>}
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteKpi.mutate(kpi.id, { onSuccess: () => toast.success('Deleted') })}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
