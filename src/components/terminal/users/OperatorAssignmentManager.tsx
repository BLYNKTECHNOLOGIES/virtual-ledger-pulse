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
import { Plus, Trash2, ChevronDown, ChevronRight, User } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import {
  useAllOperatorAssignments,
  useCreateOperatorAssignment,
  useToggleOperatorAssignment,
  useDeleteOperatorAssignment,
} from '@/hooks/useOperatorModule';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

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
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  const { data: operatorUsers = [] } = useQuery({
    queryKey: ['operator-eligible-users'],
    queryFn: async () => {
      const { data: permissions } = await supabase
        .from('p2p_terminal_role_permissions' as any)
        .select('role_id')
        .eq('permission', 'terminal_orders_view');
      const operatorRoleIds = [...new Set((permissions || []).map((p: any) => p.role_id))];
      const { data: superAdminRoles } = await supabase
        .from('p2p_terminal_roles')
        .select('id')
        .lt('hierarchy_level', 0);
      const allRoleIds = [...new Set([...operatorRoleIds, ...(superAdminRoles || []).map((r: any) => r.id)])];
      if (allRoleIds.length === 0) return [];
      const { data: userRoles } = await supabase
        .from('p2p_terminal_user_roles')
        .select('user_id')
        .in('role_id', allRoleIds);
      if (!userRoles || userRoles.length === 0) return [];
      const userIds = [...new Set(userRoles.map((ur: any) => ur.user_id))];
      const { data: users } = await supabase
        .from('users')
        .select('id, username, first_name, last_name')
        .in('id', userIds);
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

  // Group assignments by user
  const groupedAssignments = useMemo(() => {
    const groups = new Map<string, { userName: string; assignments: any[] }>();
    for (const a of assignments) {
      const userId = a.operator_user_id || a.user?.id || 'unknown';
      const userName = getUserName(a.user);
      if (!groups.has(userId)) {
        groups.set(userId, { userName, assignments: [] });
      }
      groups.get(userId)!.assignments.push(a);
    }
    return Array.from(groups.entries()).sort((a, b) => a[1].userName.localeCompare(b[1].userName));
  }, [assignments]);

  const toggleUser = (userId: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
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
    setSelectedOperator('');
    setSelectedRange('');
    setAdId('');
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
            <DialogHeader>
              <DialogTitle>Create Operator Assignment</DialogTitle>
            </DialogHeader>
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
                {operatorUsers.length === 0 && <p className="text-[10px] text-amber-500">No users have the Orders permission.</p>}
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
                        <SelectItem key={r.id} value={r.id} className="text-xs">{r.name} ({(r.min_amount ?? 0).toLocaleString()} – {(r.max_amount ?? 0).toLocaleString()})</SelectItem>
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

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : groupedAssignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">No operator assignments configured</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Add assignments to route orders to operators automatically</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {groupedAssignments.map(([userId, group]) => {
                const isOpen = expandedUsers.has(userId);
                const activeCount = group.assignments.filter((a: any) => a.is_active).length;
                return (
                  <Collapsible key={userId} open={isOpen} onOpenChange={() => toggleUser(userId)}>
                    <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-foreground">{group.userName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                          {group.assignments.length} assignment{group.assignments.length !== 1 ? 's' : ''}
                        </Badge>
                        <Badge variant={activeCount > 0 ? 'default' : 'destructive'} className="text-[9px] px-1.5 py-0">
                          {activeCount} active
                        </Badge>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border hover:bg-transparent">
                            <TableHead className="text-[10px] text-muted-foreground font-medium pl-10">Type</TableHead>
                            <TableHead className="text-[10px] text-muted-foreground font-medium">Assignment</TableHead>
                            <TableHead className="text-[10px] text-muted-foreground font-medium">Active</TableHead>
                            <TableHead className="text-[10px] text-muted-foreground font-medium text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.assignments.map((a: any) => (
                            <TableRow key={a.id} className="border-border">
                              <TableCell className="py-2 pl-10">
                                <Badge variant="outline" className="text-[9px]">
                                  {a.assignment_type === 'size_range' ? 'Size Range' : 'Ad ID'}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-2">
                                <span className="text-xs text-muted-foreground">
                                  {a.assignment_type === 'size_range' && a.size_range
                                    ? `${a.size_range.name} (${(a.size_range.min_amount ?? 0).toLocaleString()}–${(a.size_range.max_amount ?? 0).toLocaleString()})`
                                    : a.ad_id || '—'}
                                </span>
                              </TableCell>
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
