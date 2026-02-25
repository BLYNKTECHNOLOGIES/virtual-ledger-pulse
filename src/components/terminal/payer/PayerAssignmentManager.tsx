import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import {
  useAllPayerAssignments,
  useCreatePayerAssignment,
  useTogglePayerAssignment,
  useDeletePayerAssignment,
} from '@/hooks/usePayerModule';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function PayerAssignmentManager() {
  const { data: assignments = [], isLoading } = useAllPayerAssignments();
  const createAssignment = useCreatePayerAssignment();
  const toggleAssignment = useTogglePayerAssignment();
  const deleteAssignment = useDeletePayerAssignment();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formType, setFormType] = useState<'size_range' | 'ad_id'>('size_range');
  const [selectedPayer, setSelectedPayer] = useState('');
  const [selectedRange, setSelectedRange] = useState('');
  const [adId, setAdId] = useState('');

  // Fetch payer users (users with Payer role)
  const { data: payerUsers = [] } = useQuery({
    queryKey: ['payer-users'],
    queryFn: async () => {
      // Get the Payer role ID
      const { data: role } = await supabase
        .from('p2p_terminal_roles')
        .select('id')
        .eq('name', 'Payer')
        .maybeSingle();
      if (!role) return [];

      // Get users with that role
      const { data: userRoles } = await supabase
        .from('p2p_terminal_user_roles')
        .select('user_id')
        .eq('role_id', role.id);
      if (!userRoles || userRoles.length === 0) return [];

      const userIds = userRoles.map((ur: any) => ur.user_id);
      const { data: users } = await supabase
        .from('users')
        .select('id, username, first_name, last_name')
        .in('id', userIds);
      return users || [];
    },
  });

  // Fetch size ranges
  const { data: sizeRanges = [] } = useQuery({
    queryKey: ['payer-size-ranges'],
    queryFn: async () => {
      const { data } = await supabase
        .from('terminal_order_size_ranges')
        .select('id, name, min_amount, max_amount, order_type')
        .eq('is_active', true)
        .order('min_amount', { ascending: true });
      // Filter to BUY or BOTH
      return (data || []).filter((r: any) => !r.order_type || r.order_type === 'BUY' || r.order_type === 'BOTH');
    },
  });

  const handleCreate = async () => {
    if (!selectedPayer) {
      toast.error('Select a payer');
      return;
    }
    if (formType === 'size_range' && !selectedRange) {
      toast.error('Select a size range');
      return;
    }
    if (formType === 'ad_id' && !adId.trim()) {
      toast.error('Enter an ad ID');
      return;
    }

    await createAssignment.mutateAsync({
      payer_user_id: selectedPayer,
      assignment_type: formType,
      size_range_id: formType === 'size_range' ? selectedRange : undefined,
      ad_id: formType === 'ad_id' ? adId.trim() : undefined,
    });

    setDialogOpen(false);
    setSelectedPayer('');
    setSelectedRange('');
    setAdId('');
  };

  const getUserName = (user: any) => {
    if (!user) return '—';
    if (user.first_name || user.last_name) return `${user.first_name || ''} ${user.last_name || ''}`.trim();
    return user.username || '—';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">Payer Assignments</h3>
          <p className="text-[11px] text-muted-foreground">Configure which orders each payer handles</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-8 text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Assignment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Payer Assignment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label className="text-xs">Payer</Label>
                <Select value={selectedPayer} onValueChange={setSelectedPayer}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select payer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {payerUsers.map((u: any) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs">
                        {getUserName(u)} ({u.username})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {payerUsers.length === 0 && (
                  <p className="text-[10px] text-amber-500">No users have the Payer role yet. Assign the role first.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Assignment Type</Label>
                <Select value={formType} onValueChange={(v) => setFormType(v as any)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
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
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select range..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sizeRanges.map((r: any) => (
                        <SelectItem key={r.id} value={r.id} className="text-xs">
                          {r.name} ({(r.min_amount ?? 0).toLocaleString()} – {(r.max_amount ?? 0).toLocaleString()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-xs">Binance Ad ID</Label>
                  <Input
                    value={adId}
                    onChange={(e) => setAdId(e.target.value)}
                    placeholder="Enter Binance ad number..."
                    className="h-9 text-xs"
                  />
                </div>
              )}

              <Button
                onClick={handleCreate}
                className="w-full h-9 text-xs"
                disabled={createAssignment.isPending}
              >
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
          ) : assignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">No assignments configured</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Add assignments to route orders to payers</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-[10px] text-muted-foreground font-medium">Payer</TableHead>
                  <TableHead className="text-[10px] text-muted-foreground font-medium">Type</TableHead>
                  <TableHead className="text-[10px] text-muted-foreground font-medium">Assignment</TableHead>
                  <TableHead className="text-[10px] text-muted-foreground font-medium">Active</TableHead>
                  <TableHead className="text-[10px] text-muted-foreground font-medium text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a: any) => (
                  <TableRow key={a.id} className="border-border">
                    <TableCell className="py-2">
                      <span className="text-xs text-foreground font-medium">
                        {getUserName(a.user)}
                      </span>
                    </TableCell>
                    <TableCell className="py-2">
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
                      <Switch
                        checked={a.is_active}
                        onCheckedChange={(checked) =>
                          toggleAssignment.mutate({ id: a.id, is_active: checked })
                        }
                      />
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => deleteAssignment.mutate(a.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
