import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { LifeBuoy, Plus, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { SectionBlock, StatusPill, ProfileEmptyState, ProfileSkeleton, type StatusTone } from './primitives';
import { fmtDay, humanize } from './format';

const CATS = ['leave', 'payroll', 'attendance', 'assets', 'documents', 'policy', 'other'];
const PRIOS = ['low', 'medium', 'high'];

const statusTone = (s: string): StatusTone => ({
  open: 'warning',
  in_progress: 'info',
  resolved: 'success',
  closed: 'neutral',
} as Record<string, StatusTone>)[s] || 'neutral';

export default function MyHelpdeskCard({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [openDlg, setOpenDlg] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: 'other', priority: 'medium' });

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['my_helpdesk', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_helpdesk_tickets')
        .select('id, title, category, priority, status, resolution, created_at, resolved_at')
        .eq('raised_by', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error('Title required');
      const { error } = await supabase.from('hr_helpdesk_tickets').insert({
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category,
        priority: form.priority,
        status: 'open',
        raised_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Ticket raised. HR will get back to you.');
      setOpenDlg(false);
      setForm({ title: '', description: '', category: 'other', priority: 'medium' });
      qc.invalidateQueries({ queryKey: ['my_helpdesk', userId] });
    },
    onError: (e: any) => toast.error(e.message || 'Could not raise ticket'),
  });

  return (
    <SectionBlock
      icon={LifeBuoy}
      title="Your tickets"
      description={tickets.length ? `${tickets.filter((t: any) => ['open', 'in_progress'].includes(t.status)).length} open · ${tickets.length} in total` : 'Questions about leave, pay, attendance or anything else'}
      flush
      actions={
        <Dialog open={openDlg} onOpenChange={setOpenDlg}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Raise ticket</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Raise a Ticket</DialogTitle>
              <DialogDescription>HR replies here, on this tab.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="hd-title">Subject *</Label>
                <Input id="hd-title" placeholder="e.g. Payslip shows the wrong working days" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0 space-y-1.5">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATS.map(c => <SelectItem key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PRIOS.map(p => <SelectItem key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hd-desc">Details</Label>
                <Textarea id="hd-desc" placeholder="Describe the issue…" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpenDlg(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending || !form.title.trim()}>Submit</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      {isLoading ? (
        <ProfileSkeleton rows={3} bare />
      ) : tickets.length === 0 ? (
        <ProfileEmptyState bare icon={MessageSquare} title="No tickets yet" description="Raise one whenever you need HR's help." />
      ) : (
        <ul className="divide-y divide-border">
          {tickets.map((t: any) => (
            <li key={t.id} className="px-3.5 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-foreground">{t.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {humanize(t.category)} · {humanize(t.priority)} priority · raised {fmtDay(t.created_at)}
                  </div>
                </div>
                <StatusPill tone={statusTone(t.status)}>{humanize(t.status)}</StatusPill>
              </div>
              {t.resolution && (
                <div className="mt-2 rounded-md border-l-2 border-success bg-success/[0.06] px-2.5 py-1.5 text-xs text-foreground">
                  <span className="font-semibold">HR: </span>{t.resolution}
                  {t.resolved_at && <span className="text-muted-foreground"> · {fmtDay(t.resolved_at)}</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionBlock>
  );
}
