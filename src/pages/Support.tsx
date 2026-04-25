import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { format } from 'date-fns';
import { ArrowRight, ClipboardList, Headphones, Plus, Search, AlertTriangle, CheckCircle2, History, Repeat2, MessageSquare, Paperclip, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const ticketSchema = z.object({
  orderNumber: z.string().trim().min(3).max(80),
  customerIssue: z.string().trim().min(5).max(2000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  assignedTo: z.string().uuid().optional().nullable(),
});

type TicketStatus = 'open' | 'in_progress' | 'pending_customer' | 'resolved' | 'closed';
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

type TicketTransfer = {
  id: string;
  ticket_id: string;
  from_user_id: string | null;
  to_user_id: string;
  transferred_by: string;
  transfer_reason: string | null;
  created_at: string;
};

type TicketActivity = {
  id: string;
  ticket_id: string;
  activity_type: 'note' | 'status_change' | 'escalation' | 'transfer' | 'attachment';
  message: string;
  actor_id: string;
  created_at: string;
};

type TicketAttachment = {
  id: string;
  ticket_id: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by: string;
  note: string | null;
  created_at: string;
};

const statusLabels: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  pending_customer: 'Pending customer',
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
  resolved: 'border-success/30 bg-success/10 text-success',
  closed: 'border-muted-foreground/30 bg-muted text-muted-foreground',
};

const priorityClasses: Record<TicketPriority, string> = {
  low: 'border-muted-foreground/30 text-muted-foreground',
  medium: 'border-primary/30 text-primary',
  high: 'border-destructive/30 text-destructive',
  urgent: 'border-destructive bg-destructive/10 text-destructive',
};

const workflowStatuses: TicketStatus[] = ['open', 'in_progress', 'pending_customer', 'resolved', 'closed'];

const nextWorkflowStatus = (status: TicketStatus): TicketStatus | null => {
  const index = workflowStatuses.indexOf(status);
  return index >= 0 && index < workflowStatuses.length - 1 ? workflowStatuses[index + 1] : null;
};

function userLabel(user?: UserOption | null) {
  if (!user) return 'Unassigned';
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return fullName || user.username || 'User';
}

export default function Support() {
  const { user } = useAuth();
  const userId = user?.id || null;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [orderNumber, setOrderNumber] = useState('');
  const [customerIssue, setCustomerIssue] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [assignedTo, setAssignedTo] = useState('unassigned');
  const [formErrors, setFormErrors] = useState<Partial<Record<'orderNumber' | 'customerIssue', string>>>({});
  const [transferTicket, setTransferTicket] = useState<SupportTicket | null>(null);
  const [transferTo, setTransferTo] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [ticketNotes, setTicketNotes] = useState<Record<string, string>>({});
  const [attachmentNotes, setAttachmentNotes] = useState<Record<string, string>>({});

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

  const { data: transfers = [] } = useQuery({
    queryKey: ['customer_support_ticket_transfers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_support_ticket_transfers' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as TicketTransfer[];
    },
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['customer_support_ticket_activities'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customer_support_ticket_activities' as any).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as TicketActivity[];
    },
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ['customer_support_ticket_attachments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customer_support_ticket_attachments' as any).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as TicketAttachment[];
    },
  });

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const transfersByTicketId = useMemo(() => {
    const grouped = new Map<string, TicketTransfer[]>();
    transfers.forEach((transfer) => grouped.set(transfer.ticket_id, [...(grouped.get(transfer.ticket_id) || []), transfer]));
    return grouped;
  }, [transfers]);
  const activitiesByTicketId = useMemo(() => {
    const grouped = new Map<string, TicketActivity[]>();
    activities.forEach((activity) => grouped.set(activity.ticket_id, [...(grouped.get(activity.ticket_id) || []), activity]));
    return grouped;
  }, [activities]);
  const attachmentsByTicketId = useMemo(() => {
    const grouped = new Map<string, TicketAttachment[]>();
    attachments.forEach((attachment) => grouped.set(attachment.ticket_id, [...(grouped.get(attachment.ticket_id) || []), attachment]));
    return grouped;
  }, [attachments]);

  const createTicket = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      const parsed = ticketSchema.safeParse({
        orderNumber,
        customerIssue,
        priority,
        assignedTo: assignedTo === 'unassigned' ? null : assignedTo,
      });
      if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors;
        setFormErrors({
          orderNumber: fieldErrors.orderNumber?.[0],
          customerIssue: fieldErrors.customerIssue?.[0],
        });
        throw new Error('Please correct the highlighted ticket fields.');
      }
      setFormErrors({});
      const payload = parsed.data;
      const { error } = await supabase.from('customer_support_tickets' as any).insert({
        order_number: payload.orderNumber,
        customer_issue: payload.customerIssue,
        priority: payload.priority,
        status: 'open',
        escalated: false,
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
      setFormErrors({});
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

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (!transferTicket || !transferTo) throw new Error('Select a transfer assignee.');
      const { error } = await supabase.rpc('transfer_customer_support_ticket' as any, {
        p_ticket_id: transferTicket.id,
        p_to_user_id: transferTo,
        p_transfer_reason: transferReason.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTransferTicket(null);
      setTransferTo('');
      setTransferReason('');
      queryClient.invalidateQueries({ queryKey: ['customer_support_tickets'] });
      queryClient.invalidateQueries({ queryKey: ['customer_support_ticket_transfers'] });
      toast({ title: 'Ticket transferred', description: 'Assignment history has been recorded.' });
    },
    onError: (error: any) => toast({ title: 'Ticket transfer failed', description: error.message, variant: 'destructive' }),
  });

  const openTransferDialog = (ticket: SupportTicket) => {
    setTransferTicket(ticket);
    setTransferTo('');
    setTransferReason('');
  };

  const addNote = useMutation({
    mutationFn: async ({ ticketId, message }: { ticketId: string; message: string }) => {
      if (!userId) throw new Error('User not authenticated');
      const { error } = await supabase.from('customer_support_ticket_activities' as any).insert({ ticket_id: ticketId, activity_type: 'note', message, actor_id: userId });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      setTicketNotes((current) => ({ ...current, [variables.ticketId]: '' }));
      queryClient.invalidateQueries({ queryKey: ['customer_support_ticket_activities'] });
      toast({ title: 'Note added', description: 'Ticket activity has been updated.' });
    },
    onError: (error: any) => toast({ title: 'Note failed', description: error.message, variant: 'destructive' }),
  });

  const uploadAttachment = useMutation({
    mutationFn: async ({ ticketId, file, note }: { ticketId: string; file: File; note: string }) => {
      if (!userId) throw new Error('User not authenticated');
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${ticketId}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from('support-ticket-attachments').upload(filePath, file, { upsert: false, contentType: file.type || undefined });
      if (uploadError) throw uploadError;
      const { error } = await supabase.from('customer_support_ticket_attachments' as any).insert({ ticket_id: ticketId, file_name: file.name, file_path: filePath, mime_type: file.type || null, file_size: file.size, uploaded_by: userId, note: note.trim() || null });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      setAttachmentNotes((current) => ({ ...current, [variables.ticketId]: '' }));
      queryClient.invalidateQueries({ queryKey: ['customer_support_ticket_attachments'] });
      toast({ title: 'File uploaded', description: 'Attachment has been added to the ticket.' });
    },
    onError: (error: any) => toast({ title: 'Upload failed', description: error.message, variant: 'destructive' }),
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
  const escalatedCount = tickets.filter((ticket) => ticket.escalated).length;
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
            <div className="grid gap-3 lg:grid-cols-[180px_1fr_150px_220px_auto] lg:items-start">
              <div className="space-y-1.5"><Label className="text-xs">Order Number</Label><Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="Order no." className="h-9 text-xs" aria-invalid={!!formErrors.orderNumber} />{formErrors.orderNumber && <p className="text-xs text-destructive">{formErrors.orderNumber}</p>}</div>
              <div className="space-y-1.5"><Label className="text-xs">Customer Issue</Label><Textarea value={customerIssue} onChange={(e) => setCustomerIssue(e.target.value)} placeholder="Describe issue raised by customer" className="min-h-20 text-xs" aria-invalid={!!formErrors.customerIssue} />{formErrors.customerIssue && <p className="text-xs text-destructive">{formErrors.customerIssue}</p>}</div>
              <div className="space-y-1.5"><Label className="text-xs">Priority</Label><Select value={priority} onValueChange={(value) => setPriority(value as TicketPriority)}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(priorityLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-xs">Assign</Label><Select value={assignedTo} onValueChange={setAssignedTo}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{users.map((user) => <SelectItem key={user.id} value={user.id}>{userLabel(user)}</SelectItem>)}</SelectContent></Select></div>
              <Button onClick={() => createTicket.mutate()} disabled={createTicket.isPending} className="h-9">Create</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><ClipboardList className="h-4 w-4" /> Ticket lifecycle workflow</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {workflowStatuses.map((status, index) => (
                  <div key={status} className="flex items-center gap-2">
                    <Badge variant="outline" className={statusClasses[status]}>{index + 1}. {statusLabels[status]}</Badge>
                    {index < workflowStatuses.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                ))}
              </div>
              <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive"><AlertTriangle className="mr-1 h-3 w-3" /> Escalated flag</Badge>
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

        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><History className="h-4 w-4" /> Assignment history</CardTitle></CardHeader>
          <CardContent>
            {transfers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No ticket transfers recorded yet.</p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {transfers.map((transfer) => {
                  const ticket = tickets.find((item) => item.id === transfer.ticket_id);
                  return (
                    <div key={transfer.id} className="grid gap-2 rounded-md border border-border bg-muted/20 p-3 text-xs md:grid-cols-[180px_1fr_220px] md:items-center">
                      <div className="font-mono font-medium text-foreground">{ticket?.order_number || 'Unknown ticket'}</div>
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-muted-foreground">
                        <span className="text-foreground">{userLabel(usersById.get(transfer.from_user_id || ''))}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span className="text-foreground">{userLabel(usersById.get(transfer.to_user_id))}</span>
                        <span>transferred by</span>
                        <span className="text-foreground">{userLabel(usersById.get(transfer.transferred_by))}</span>
                      </div>
                      <div className="text-right font-mono text-muted-foreground">{format(new Date(transfer.created_at), 'dd MMM yyyy, HH:mm:ss')}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-2">
          {isLoading ? Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-28 w-full" />) : filteredTickets.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground"><Headphones className="mx-auto mb-2 h-8 w-8 opacity-40" /><p className="text-sm">No support tickets found</p></CardContent></Card>
          ) : filteredTickets.map((ticket) => {
            const ticketTransfers = transfersByTicketId.get(ticket.id) || [];
            const ticketActivities = activitiesByTicketId.get(ticket.id) || [];
            const ticketAttachments = attachmentsByTicketId.get(ticket.id) || [];
            return (
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
                    {ticketTransfers.length > 0 && (
                      <div className="space-y-1 rounded-md border border-border bg-muted/20 p-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5 font-medium text-foreground"><History className="h-3.5 w-3.5" /> Transfer history</div>
                        {ticketTransfers.map((transfer) => (
                          <div key={transfer.id} className="flex flex-wrap gap-x-1.5 gap-y-1">
                            <span>{format(new Date(transfer.created_at), 'dd MMM, HH:mm')}:</span>
                            <span>{userLabel(usersById.get(transfer.from_user_id || ''))}</span>
                            <ArrowRight className="h-3 w-3" />
                            <span>{userLabel(usersById.get(transfer.to_user_id))}</span>
                            <span>by {userLabel(usersById.get(transfer.transferred_by))}</span>
                            {transfer.transfer_reason && <span>• {transfer.transfer_reason}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="grid gap-3 rounded-md border border-border bg-muted/10 p-3 lg:grid-cols-2">
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground"><MessageSquare className="h-3.5 w-3.5" /> Activity notes</div>
                        <Textarea value={ticketNotes[ticket.id] || ''} onChange={(e) => setTicketNotes((current) => ({ ...current, [ticket.id]: e.target.value }))} placeholder="Write update, customer response, evidence, or internal note" className="min-h-16 text-xs" />
                        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!ticketNotes[ticket.id]?.trim() || addNote.isPending} onClick={() => addNote.mutate({ ticketId: ticket.id, message: ticketNotes[ticket.id].trim() })}>Add note</Button>
                        <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
                          {ticketActivities.map((activity) => <div key={activity.id} className="rounded border border-border bg-background p-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">{userLabel(usersById.get(activity.actor_id))}</span> • {format(new Date(activity.created_at), 'dd MMM yyyy, HH:mm:ss')}<div className="mt-1 whitespace-pre-wrap text-foreground">{activity.message}</div></div>)}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground"><Paperclip className="h-3.5 w-3.5" /> Files & images</div>
                        <Input value={attachmentNotes[ticket.id] || ''} onChange={(e) => setAttachmentNotes((current) => ({ ...current, [ticket.id]: e.target.value }))} placeholder="Optional file note" className="h-8 text-xs" />
                        <Label className="flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-xs hover:bg-accent hover:text-accent-foreground"><Upload className="h-3.5 w-3.5" /> Upload file or image<Input type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadAttachment.mutate({ ticketId: ticket.id, file, note: attachmentNotes[ticket.id] || '' }); e.currentTarget.value = ''; }} /></Label>
                        <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
                          {ticketAttachments.map((attachment) => <div key={attachment.id} className="rounded border border-border bg-background p-2 text-xs text-muted-foreground"><div className="flex items-center justify-between gap-2"><span className="truncate font-medium text-foreground">{attachment.file_name}</span><span>{format(new Date(attachment.created_at), 'dd MMM, HH:mm')}</span></div><div>Uploaded by {userLabel(usersById.get(attachment.uploaded_by))}{attachment.note ? ` • ${attachment.note}` : ''}</div></div>)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-4 lg:w-[650px]">
                    {nextWorkflowStatus(ticket.status) && <Button variant="outline" className="h-8 text-xs" onClick={() => updateTicket.mutate({ id: ticket.id, patch: { status: nextWorkflowStatus(ticket.status) as TicketStatus } })}>Move to {statusLabels[nextWorkflowStatus(ticket.status) as TicketStatus]}</Button>}
                    <Button variant={ticket.escalated ? 'destructive' : 'outline'} className="h-8 text-xs" onClick={() => updateTicket.mutate({ id: ticket.id, patch: { escalated: !ticket.escalated } })}>{ticket.escalated ? 'Remove escalation' : 'Escalate'}</Button>
                    <Select value={ticket.priority} onValueChange={(value) => updateTicket.mutate({ id: ticket.id, patch: { priority: value as TicketPriority } })}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(priorityLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
                    {ticket.assigned_to ? <Button variant="outline" className="h-8 text-xs" onClick={() => openTransferDialog(ticket)}><Repeat2 className="mr-1.5 h-3.5 w-3.5" /> Transfer</Button> : <Select value="unassigned" onValueChange={(value) => updateTicket.mutate({ id: ticket.id, patch: { assigned_to: value } })}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{userLabel(user)}</SelectItem>)}</SelectContent></Select>}
                  </div>
                </div>
              </CardContent>
            </Card>
          );})}
        </div>
        <Dialog open={!!transferTicket} onOpenChange={(open) => !open && setTransferTicket(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle className="flex items-center gap-2 text-base"><Repeat2 className="h-4 w-4" /> Transfer ticket</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                <div className="font-mono font-medium text-foreground">{transferTicket?.order_number}</div>
                <div>Current assignee: {userLabel(usersById.get(transferTicket?.assigned_to || ''))}</div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Transfer to</Label><Select value={transferTo} onValueChange={setTransferTo}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select assignee" /></SelectTrigger><SelectContent>{users.filter((user) => user.id !== transferTicket?.assigned_to).map((user) => <SelectItem key={user.id} value={user.id}>{userLabel(user)}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-xs">Reason</Label><Textarea value={transferReason} onChange={(e) => setTransferReason(e.target.value)} placeholder="Reason for transfer" className="min-h-20 text-xs" maxLength={1000} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setTransferTicket(null)}>Cancel</Button><Button onClick={() => transferMutation.mutate()} disabled={!transferTo || transferMutation.isPending}>Transfer</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  );

  return content;
}
