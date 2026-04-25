import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { format } from 'date-fns';
import { Headphones, Plus, Search, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { TerminalPermissionGate } from '@/components/terminal/TerminalPermissionGate';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

const ticketSchema = z.object({
  orderNumber: z.string().trim().min(3).max(80),
  customerIssue: z.string().trim().min(5).max(2000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  assignedTo: z.string().uuid().optional().nullable(),
});

type TicketStatus = 'open' | 'in_progress' | 'pending_customer' | 'escalated' | 'resolved' | 'closed';
type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

type SupportTicket = {
  id: string;
  order_number: string;
  customer_issue: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigned_to: string | null;
  created_by: string;
  escalated: boolean;
  escalation_reason: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

type UserOption = {
  id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
};

const statusLabels: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  pending_customer: 'Pending customer',
  escalated: 'Escalated',
  resolved: 'Resolved',
  closed: 'Closed',
};

const priorityLabels: Record<TicketPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

const statusClasses: Record<TicketStatus, string> = {
  open: 'border-primary/30 bg-primary/10 text-primary',
  in_progress: 'border-accent/30 bg-accent/10 text-accent-foreground',
  pending_customer: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  escalated: 'border-destructive/30 bg-destructive/10 text-destructive',
  resolved: 'border-success/30 bg-success/10 text-success',
  closed: 'border-muted-foreground/30 bg-muted text-muted-foreground',
};

const priorityClasses: Record<TicketPriority, string> = {
  low: 'border-muted-foreground/30 text-muted-foreground',
  medium: 'border-primary/30 text-primary',
  high: 'border-destructive/30 text-destructive',
  urgent: 'border-destructive bg-destructive/10 text-destructive',
};

function userLabel(user?: UserOption | null) {
  if (!user) return 'Unassigned';
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return fullName || user.username || 'User';
}

export default function TerminalSupport() {
  const { user } = useAuth();
  const terminalAuth = useTerminalAuth();
  const userId = terminalAuth.userId || user?.id || null;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [orderNumber, setOrderNumber] = useState('');
  const [customerIssue, setCustomerIssue] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [assignedTo, setAssignedTo] = useState('unassigned');

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['customer_support_tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_support_tickets' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as SupportTicket[];
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ['support_assignable_users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, first_name, last_name')
        .eq('status', 'ACTIVE')
        .order('first_name', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as UserOption[];
    },
  });

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  const createTicket = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      const payload = ticketSchema.parse({
        orderNumber,
        customerIssue,
        priority,
        assignedTo: assignedTo === 'unassigned' ? null : assignedTo,
      });
      const { error } = await supabase.from('customer_support_tickets' as any).insert({
        order_number: payload.orderNumber,
        customer_issue: payload.customerIssue,
        priority: payload.priority,
        assigned_to: payload.assignedTo,
        created_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setOrderNumber('');
      setCustomerIssue('');
      setPriority('medium');
      setAssignedTo('unassigned');
      queryClient.invalidateQueries({ queryKey: ['customer_support_tickets'] });
      toast({ title: 'Ticket created', description: 'Customer support ticket is now tracked.' });
    },
    onError: (error: any) => toast({ title: 'Ticket creation failed', description: error.message, variant: 'destructive' }),
  });

  const updateTicket = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SupportTicket> }) => {
      const { error } = await supabase.from('customer_support_tickets' as any).update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer_support_tickets'] }),
    onError: (error: any) => toast({ title: 'Ticket update failed', description: error.message, variant: 'destructive' }),
  });

  const filteredTickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (statusFilter !== 'all' && ticket.status !== statusFilter) return false;
      if (!q) return true;
      return ticket.order_number.toLowerCase().includes(q) || ticket.customer_issue.toLowerCase().includes(q);
    });
  }, [tickets, search, statusFilter]);

  const openCount = tickets.filter((ticket) => !['resolved', 'closed'].includes(ticket.status)).length;
  const escalatedCount = tickets.filter((ticket) => ticket.status === 'escalated' || ticket.escalated).length;
  const resolvedCount = tickets.filter((ticket) => ['resolved', 'closed'].includes(ticket.status)).length;

  const content = (
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Headphones className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Customer Support</h1>
              <p className="text-xs text-muted-foreground">Order-linked tickets, escalations, and issue resolution</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Card><CardContent className="flex items-center gap-3 p-4"><Headphones className="h-4 w-4 text-primary" /><div><p className="text-xs text-muted-foreground">Active</p><p className="text-xl font-semibold text-foreground">{openCount}</p></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-4"><AlertTriangle className="h-4 w-4 text-destructive" /><div><p className="text-xs text-muted-foreground">Escalated</p><p className="text-xl font-semibold text-foreground">{escalatedCount}</p></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-4"><CheckCircle2 className="h-4 w-4 text-success" /><div><p className="text-xs text-muted-foreground">Resolved</p><p className="text-xl font-semibold text-foreground">{resolvedCount}</p></div></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Plus className="h-4 w-4" /> New ticket</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-3 lg:grid-cols-[180px_1fr_150px_220px_auto] lg:items-end">
              <div className="space-y-1.5"><Label className="text-xs">Order Number</Label><Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="Order no." className="h-9 text-xs" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Customer Issue</Label><Textarea value={customerIssue} onChange={(e) => setCustomerIssue(e.target.value)} placeholder="Describe issue raised by customer" className="min-h-9 text-xs" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Priority</Label><Select value={priority} onValueChange={(value) => setPriority(value as TicketPriority)}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(priorityLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-xs">Assign</Label><Select value={assignedTo} onValueChange={setAssignedTo}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{users.map((user) => <SelectItem key={user.id} value={user.id}>{userLabel(user)}</SelectItem>)}</SelectContent></Select></div>
              <Button onClick={() => createTicket.mutate()} disabled={createTicket.isPending} className="h-9">Create</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order or issue" className="h-8 pl-8 text-xs" /></div>
              <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All status</SelectItem>{Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
              <span className="text-xs text-muted-foreground">{filteredTickets.length} tickets</span>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          {isLoading ? Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-28 w-full" />) : filteredTickets.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground"><Headphones className="mx-auto mb-2 h-8 w-8 opacity-40" /><p className="text-sm">No support tickets found</p></CardContent></Card>
          ) : filteredTickets.map((ticket) => (
            <Card key={ticket.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">{ticket.order_number}</span>
                      <Badge variant="outline" className={statusClasses[ticket.status]}>{statusLabels[ticket.status]}</Badge>
                      <Badge variant="outline" className={priorityClasses[ticket.priority]}>{priorityLabels[ticket.priority]}</Badge>
                      {ticket.escalated && <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">Escalated</Badge>}
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-foreground">{ticket.customer_issue}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Assigned: {userLabel(usersById.get(ticket.assigned_to || ''))}</span>
                      <span>Created: {format(new Date(ticket.created_at), 'dd MMM yyyy, HH:mm')}</span>
                      {ticket.resolved_at && <span>Resolved: {format(new Date(ticket.resolved_at), 'dd MMM yyyy, HH:mm')}</span>}
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3 lg:w-[520px]">
                    <Select value={ticket.status} onValueChange={(value) => updateTicket.mutate({ id: ticket.id, patch: { status: value as TicketStatus, escalated: value === 'escalated' ? true : ticket.escalated } })}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
                    <Select value={ticket.priority} onValueChange={(value) => updateTicket.mutate({ id: ticket.id, patch: { priority: value as TicketPriority } })}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(priorityLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
                    <Select value={ticket.assigned_to || 'unassigned'} onValueChange={(value) => updateTicket.mutate({ id: ticket.id, patch: { assigned_to: value === 'unassigned' ? null : value } })}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{users.map((user) => <SelectItem key={user.id} value={user.id}>{userLabel(user)}</SelectItem>)}</SelectContent></Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
  );

  return terminalAuth.userId ? (
    <TerminalPermissionGate permissions={['terminal_orders_escalate']}>
      {content}
    </TerminalPermissionGate>
  ) : content;
  );
}
