import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, ChevronDown, ChevronRight, User, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { toast as sonnerToast } from 'sonner';

function useAllOperatorAssignments() {
  return useQuery({
    queryKey: ['all-operator-assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_operator_assignments' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const userIds = [...new Set((data || []).map((a: any) => a.operator_user_id))];
      const sizeRangeIds = (data || []).filter((a: any) => a.size_range_id).map((a: any) => a.size_range_id);

      const [usersRes, rangesRes] = await Promise.all([
        userIds.length > 0
          ? supabase.from('users').select('id, username, first_name, last_name').in('id', userIds)
          : { data: [] },
        sizeRangeIds.length > 0
          ? supabase.from('terminal_order_size_ranges').select('id, name, min_amount, max_amount').in('id', sizeRangeIds)
          : { data: [] },
      ]);

      const userMap: Record<string, any> = {};
      for (const u of usersRes.data || []) userMap[u.id] = u;
      const rangeMap: Record<string, any> = {};
      for (const r of rangesRes.data || []) rangeMap[r.id] = r;

      return (data || []).map((a: any) => ({
        ...a,
        user: userMap[a.operator_user_id] || null,
        size_range: a.size_range_id ? rangeMap[a.size_range_id] || null : null,
      }));
    },
  });
}

function useCreateOperatorAssignment() {
  const queryClient = useQueryClient();
  const { userId } = useTerminalAuth();

  return useMutation({
    mutationFn: async (params: {
      operator_user_id: string;
      assignment_type: 'size_range' | 'ad_id';
      size_range_id?: string;
      ad_id?: string;
    }) => {
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase.from('terminal_operator_assignments' as any).insert({
        operator_user_id: params.operator_user_id,
        assignment_type: params.assignment_type,
        size_range_id: params.size_range_id || null,
        ad_id: params.ad_id || null,
        assigned_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      sonnerToast.success('Operator assignment created');
      queryClient.invalidateQueries({ queryKey: ['all-operator-assignments'] });
    },
    onError: (err: Error) => sonnerToast.error(`Failed: ${err.message}`),
  });
}

function useToggleOperatorAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('terminal_operator_assignments' as any)
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-operator-assignments'] });
    },
  });
}

function useDeleteOperatorAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('terminal_operator_assignments' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      sonnerToast.success('Assignment removed');
      queryClient.invalidateQueries({ queryKey: ['all-operator-assignments'] });
    },
    onError: (err: Error) => sonnerToast.error(`Failed: ${err.message}`),
  });
}
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

type GroupBy = 'user' | 'size_range';

export function OperatorAssignmentManager() {
  const { data: assignments = [], isLoading } = useAllOperatorAssignments();
  const createAssignment = useCreateOperatorAssignment();
  const toggleAssignment = useToggleOperatorAssignment();
  const deleteAssignment = useDeleteOperatorAssignment();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formType, setFormType] = useState<'size_range' | 'ad_id'>('size_range');
  const [selectedOperator, setSelectedOperator] = useState('');
  const [selectedRange, setSelectedRange] = useState('');
  const [adId, setAdId] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<GroupBy>('user');

  const { data: operatorUsers = [] } = useQuery({
    queryKey: ['operator-eligible-users'],
    queryFn: async () => {
      const { data: permissions } = await supabase
        .from('p2p_terminal_role_permissions' as any)
        .select('role_id')
        .eq('permission', 'terminal_orders_view');
      const operatorRoleIds = [...new Set((permissions || []).map((p: any) => p.role_id))];
      const { data: superAdminRoles } = await supabase
        .from('p2p_terminal_roles').select('id').lt('hierarchy_level', 0);
      const allRoleIds = [...new Set([...operatorRoleIds, ...(superAdminRoles || []).map((r: any) => r.id)])];
      if (allRoleIds.length === 0) return [];
      const { data: userRoles } = await supabase
        .from('p2p_terminal_user_roles').select('user_id').in('role_id', allRoleIds);
      if (!userRoles || userRoles.length === 0) return [];
      const userIds = [...new Set(userRoles.map((ur: any) => ur.user_id))];
      const { data: users } = await supabase
        .from('users').select('id, username, first_name, last_name').in('id', userIds);
      return users || [];
    },
  });

  const { data: sizeRanges = [] } = useQuery({
    queryKey: ['operator-size-ranges'],
    queryFn: async () => {
      const { data } = await supabase
        .from('terminal_order_size_ranges')
        .select('id, name, min_amount, max_amount, order_type')
        .eq('is_active', true)
        .order('min_amount', { ascending: true });
      return data || [];
    },
  });

  const groupedAssignments = useMemo(() => {
    const groups = new Map<string, { label: string; assignments: any[] }>();

    if (groupBy === 'user') {
      for (const a of assignments) {
        const userId = a.operator_user_id || a.user?.id || 'unknown';
        const userName = getUserName(a.user);
        if (!groups.has(userId)) groups.set(userId, { label: userName, assignments: [] });
        groups.get(userId)!.assignments.push(a);
      }
    } else {
      for (const a of assignments) {
        if (a.assignment_type === 'size_range' && a.size_range) {
          const key = a.size_range_id || a.size_range?.id || 'unknown';
          const label = `${a.size_range.name} (${(a.size_range.min_amount ?? 0).toLocaleString('en-IN')}–${(a.size_range.max_amount ?? 0).toLocaleString('en-IN')})`;
          if (!groups.has(key)) groups.set(key, { label, assignments: [] });
          groups.get(key)!.assignments.push(a);
        } else {
          const key = `ad_${a.ad_id || 'unknown'}`;
          const label = `Ad ID: ${a.ad_id || '—'}`;
          if (!groups.has(key)) groups.set(key, { label, assignments: [] });
          groups.get(key)!.assignments.push(a);
        }
      }
    }

    return Array.from(groups.entries()).sort((a, b) => a[1].label.localeCompare(b[1].label));
  }, [assignments, groupBy]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleGroupByChange = (val: string) => {
    setGroupBy(val as GroupBy);
    setExpandedGroups(new Set());
  };

  const handleCreate = async () => {
    if (!selectedOperator) { toast.error('Select an operator'); return; }
    if (formType === 'size_range' && !selectedRange) { toast.error('Select a size range'); return; }
    if (formType === 'ad_id' && !adId.trim()) { toast.error('Enter an ad ID'); return; }
    await createAssignment.mutateAsync({
      operator_user_id: selectedOperator,
      assignment_type: formType,
      size_range_id: formType === 'size_range' ? selectedRange : undefined,
      ad_id: formType === 'ad_id' ? adId.trim() : undefined,
    });
    setDialogOpen(false);
    setSelectedOperator(''); setSelectedRange(''); setAdId('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">Operator Assignments</h3>
          <p className="text-[11px] text-muted-foreground">Configure which orders each operator handles by size range or ad ID</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-8 text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Assignment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Operator Assignment</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label className="text-xs">Operator</Label>
                <Select value={selectedOperator} onValueChange={setSelectedOperator}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select operator..." /></SelectTrigger>
                  <SelectContent>
                    {operatorUsers.map((u: any) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs">{getUserName(u)} ({u.username})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Assignment Type</Label>
                <Select value={formType} onValueChange={(v) => setFormType(v as any)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="size_range" className="text-xs">Size Range</SelectItem>
                    <SelectItem value="ad_id" className="text-xs">Ad ID</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formType === 'size_range' ? (
                <div className="space-y-2">
                  <Label className="text-xs">Size Range</Label>
                  <Select value={selectedRange} onValueChange={setSelectedRange}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select range..." /></SelectTrigger>
                    <SelectContent>
                      {sizeRanges.map((r: any) => (
                        <SelectItem key={r.id} value={r.id} className="text-xs">{r.name} ({(r.min_amount ?? 0).toLocaleString('en-IN')} – {(r.max_amount ?? 0).toLocaleString('en-IN')})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-xs">Binance Ad ID</Label>
                  <Input value={adId} onChange={(e) => setAdId(e.target.value)} placeholder="Enter Binance ad number..." className="h-9 text-xs" />
                </div>
              )}
              <Button onClick={handleCreate} className="w-full h-9 text-xs" disabled={createAssignment.isPending}>
                {createAssignment.isPending ? 'Creating...' : 'Create Assignment'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Group by toggle */}
      <Tabs value={groupBy} onValueChange={handleGroupByChange} className="w-full">
        <TabsList className="h-8 w-fit">
          <TabsTrigger value="user" className="text-[10px] h-6 gap-1 px-2.5">
            <User className="h-3 w-3" /> By User
          </TabsTrigger>
          <TabsTrigger value="size_range" className="text-[10px] h-6 gap-1 px-2.5">
            <Layers className="h-3 w-3" /> By Size Range
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : groupedAssignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">No operator assignments configured</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {groupedAssignments.map(([key, group]) => {
                const isOpen = expandedGroups.has(key);
                const activeCount = group.assignments.filter((a: any) => a.is_active).length;
                const allActive = activeCount === group.assignments.length;
                return (
                  <Collapsible key={key} open={isOpen} onOpenChange={() => toggleGroup(key)}>
                    <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors">
                      <CollapsibleTrigger className="flex items-center gap-2 flex-1 min-w-0">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                        {groupBy === 'user' ? <User className="h-3.5 w-3.5 text-muted-foreground" /> : <Layers className="h-3.5 w-3.5 text-muted-foreground" />}
                        <span className="text-xs font-medium text-foreground">{group.label}</span>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-1">
                          {group.assignments.length}
                        </Badge>
                        <Badge variant={activeCount > 0 ? 'default' : 'destructive'} className="text-[9px] px-1.5 py-0">
                          {activeCount} active
                        </Badge>
                      </CollapsibleTrigger>
                      <div className="flex items-center gap-1.5 ml-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[9px] text-muted-foreground">{allActive ? 'All On' : 'All Off'}</span>
                        <Switch
                          checked={allActive}
                          onCheckedChange={(checked) => {
                            group.assignments.forEach((a: any) => {
                              if (a.is_active !== checked) toggleAssignment.mutate({ id: a.id, is_active: checked });
                            });
                          }}
                        />
                      </div>
                    </div>
                    <CollapsibleContent>
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border hover:bg-transparent">
                            {groupBy === 'size_range' && <TableHead className="text-[10px] text-muted-foreground font-medium pl-10">Operator</TableHead>}
                            <TableHead className="text-[10px] text-muted-foreground font-medium pl-10">Type</TableHead>
                            {groupBy === 'user' && <TableHead className="text-[10px] text-muted-foreground font-medium">Assignment</TableHead>}
                            <TableHead className="text-[10px] text-muted-foreground font-medium">Active</TableHead>
                            <TableHead className="text-[10px] text-muted-foreground font-medium text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.assignments.map((a: any) => (
                            <TableRow key={a.id} className="border-border">
                              {groupBy === 'size_range' && (
                                <TableCell className="py-2 pl-10">
                                  <span className="text-xs text-foreground font-medium">{getUserName(a.user)}</span>
                                </TableCell>
                              )}
                              <TableCell className="py-2 pl-10">
                                <Badge variant="outline" className="text-[9px]">
                                  {a.assignment_type === 'size_range' ? 'Size Range' : 'Ad ID'}
                                </Badge>
                              </TableCell>
                              {groupBy === 'user' && (
                                <TableCell className="py-2">
                                  <span className="text-xs text-muted-foreground">
                                    {a.assignment_type === 'size_range' && a.size_range
                                      ? `${a.size_range.name} (${(a.size_range.min_amount ?? 0).toLocaleString('en-IN')}–${(a.size_range.max_amount ?? 0).toLocaleString('en-IN')})`
                                      : a.ad_id || '—'}
                                  </span>
                                </TableCell>
                              )}
                              <TableCell className="py-2">
                                <Switch checked={a.is_active} onCheckedChange={(checked) => toggleAssignment.mutate({ id: a.id, is_active: checked })} />
                              </TableCell>
                              <TableCell className="py-2 text-right">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteAssignment.mutate(a.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function getUserName(user: any) {
  if (!user) return '—';
  if (user.first_name || user.last_name) return `${user.first_name || ''} ${user.last_name || ''}`.trim();
  return user.username || '—';
}
