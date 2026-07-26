import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { LifeBuoy, Plus } from 'lucide-react';
import { toast } from 'sonner';

const CATS = ['leave', 'payroll', 'attendance', 'assets', 'documents', 'policy', 'other'];
const PRIOS = ['low', 'medium', 'high'];

const statusColor = (s: string) => ({
  open: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  in_progress: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  resolved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  closed: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
}[s] || 'bg-slate-500/15');

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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base"><LifeBuoy className="h-4 w-4" /> Help & Support</CardTitle>
        <Dialog open={openDlg} onOpenChange={setOpenDlg}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Raise Ticket</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Raise a Ticket</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Subject" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATS.map(c => <SelectItem key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIOS.map(p => <SelectItem key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Textarea placeholder="Describe the issue…" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpenDlg(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>Submit</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No tickets yet. Raise one whenever you need HR's help.</p>
        ) : (
          <div className="space-y-2">
            {tickets.map((t: any) => (
              <div key={t.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{t.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {t.category} · {t.priority} · {new Date(t.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <Badge className={statusColor(t.status)}>{t.status?.replace('_', ' ')}</Badge>
                </div>
                {t.resolution && (
                  <div className="mt-2 text-xs text-muted-foreground border-l-2 border-emerald-500 pl-2">
                    <b>HR: </b>{t.resolution}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
