import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getUserName, useAllSmallPaymentManagerAssignments, useCreateSmallPaymentManagerAssignment, useDeleteSmallPaymentManagerAssignment, useToggleSmallPaymentManagerAssignment } from '@/hooks/useSmallPaymentsManager';

export function SmallPaymentManagerAssignmentManager() {
  const { data: assignments = [], isLoading } = useAllSmallPaymentManagerAssignments();
  const createAssignment = useCreateSmallPaymentManagerAssignment();
  const toggleAssignment = useToggleSmallPaymentManagerAssignment();
  const deleteAssignment = useDeleteSmallPaymentManagerAssignment();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formType, setFormType] = useState<'size_range' | 'ad_id'>('size_range');
  const [selectedManager, setSelectedManager] = useState('');
  const [selectedRange, setSelectedRange] = useState('');
  const [adId, setAdId] = useState('');

  const { data: managerUsers = [] } = useQuery({
    queryKey: ['small-payment-manager-users'],
    queryFn: async () => {
      const { data: permissions } = await supabase.from('p2p_terminal_role_permissions' as any).select('role_id').in('permission', ['terminal_small_payments_view', 'terminal_small_payments_manage']);
      const roleIds = [...new Set((permissions || []).map((p: any) => p.role_id))];
      if (!roleIds.length) return [];
      const { data: userRoles } = await supabase.from('p2p_terminal_user_roles').select('user_id').in('role_id', roleIds);
      const userIds = [...new Set((userRoles || []).map((ur: any) => ur.user_id))];
      if (!userIds.length) return [];
      const { data: users } = await supabase.from('users').select('id, username, first_name, last_name').in('id', userIds);
      return users || [];
    },
  });

  const { data: sizeRanges = [] } = useQuery({
    queryKey: ['small-payment-size-ranges'],
    queryFn: async () => {
      const { data } = await supabase.from('terminal_order_size_ranges').select('id, name, min_amount, max_amount, order_type').eq('is_active', true).order('min_amount');
      return (data || []).filter((r: any) => !r.order_type || r.order_type === 'BUY' || r.order_type === 'BOTH');
    },
  });

  const summary = useMemo(() => ({ active: assignments.filter((a: any) => a.is_active).length, total: assignments.length }), [assignments]);

  const handleCreate = async () => {
    if (!selectedManager) return toast.error('Select a manager');
    if (formType === 'size_range' && !selectedRange) return toast.error('Select a size range');
    if (formType === 'ad_id' && !adId.trim()) return toast.error('Enter an Ad ID');
    await createAssignment.mutateAsync({ manager_user_id: selectedManager, assignment_type: formType, size_range_id: selectedRange, ad_id: adId.trim() });
    setDialogOpen(false);
    setSelectedManager(''); setSelectedRange(''); setAdId('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Small Payments Manager Assignments</h3>
          <p className="text-[11px] text-muted-foreground">Route post-payment and alternate UPI exception cases by amount range or Ad ID</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">{summary.active}/{summary.total} active</Badge>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button size="sm" className="h-8 text-xs gap-1.5"><Plus className="h-3.5 w-3.5" /> Add Assignment</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Small Payments Assignment</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2"><Label className="text-xs">Manager</Label><Select value={selectedManager} onValueChange={setSelectedManager}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select manager..." /></SelectTrigger><SelectContent>{managerUsers.map((u: any) => <SelectItem key={u.id} value={u.id} className="text-xs">{getUserName(u)} ({u.username})</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label className="text-xs">Assignment Type</Label><Select value={formType} onValueChange={(v) => setFormType(v as any)}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="size_range" className="text-xs">Size Range</SelectItem><SelectItem value="ad_id" className="text-xs">Ad ID</SelectItem></SelectContent></Select></div>
                {formType === 'size_range' ? <div className="space-y-2"><Label className="text-xs">Size Range</Label><Select value={selectedRange} onValueChange={setSelectedRange}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select range..." /></SelectTrigger><SelectContent>{sizeRanges.map((r: any) => <SelectItem key={r.id} value={r.id} className="text-xs">{r.name} ({Number(r.min_amount).toLocaleString('en-IN')} – {Number(r.max_amount).toLocaleString('en-IN')})</SelectItem>)}</SelectContent></Select></div> : <div className="space-y-2"><Label className="text-xs">Binance Ad ID</Label><Input value={adId} onChange={(e) => setAdId(e.target.value)} className="h-9 text-xs" placeholder="Enter Binance ad number..." /></div>}
                <Button onClick={handleCreate} className="w-full h-9 text-xs" disabled={createAssignment.isPending}>{createAssignment.isPending ? 'Creating...' : 'Create Assignment'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="bg-card border-border"><CardContent className="p-0">
        {isLoading ? <div className="p-4 space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : assignments.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">No Small Payments assignments configured</div> : (
          <Table><TableHeader><TableRow><TableHead className="text-[10px]">Manager</TableHead><TableHead className="text-[10px]">Type</TableHead><TableHead className="text-[10px]">Assignment</TableHead><TableHead className="text-[10px]">Active</TableHead><TableHead className="text-right text-[10px]">Actions</TableHead></TableRow></TableHeader><TableBody>
            {assignments.map((a: any) => <TableRow key={a.id}><TableCell className="py-2 text-xs font-medium">{getUserName(a.user)}</TableCell><TableCell className="py-2"><Badge variant="outline" className="text-[9px]">{a.assignment_type === 'size_range' ? 'Size Range' : 'Ad ID'}</Badge></TableCell><TableCell className="py-2 text-xs text-muted-foreground">{a.assignment_type === 'size_range' && a.size_range ? `${a.size_range.name} (${Number(a.size_range.min_amount).toLocaleString('en-IN')}–${Number(a.size_range.max_amount).toLocaleString('en-IN')})` : a.ad_id}</TableCell><TableCell className="py-2"><Switch checked={a.is_active} onCheckedChange={(checked) => toggleAssignment.mutate({ id: a.id, is_active: checked })} /></TableCell><TableCell className="py-2 text-right"><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteAssignment.mutate(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell></TableRow>)}
          </TableBody></Table>
        )}
      </CardContent></Card>
    </div>
  );
}