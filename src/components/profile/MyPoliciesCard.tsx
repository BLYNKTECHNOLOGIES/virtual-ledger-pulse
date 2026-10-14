import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { BookOpen, CheckCircle2, ChevronDown, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionBlock, StatusPill, ProfileEmptyState, ProfileSkeleton } from './primitives';
import { fmtDay } from './format';

const ACK_KEY = (uid: string) => `hr_policy_ack_${uid}`;

const fileName = (url: string, i: number) => {
  try {
    const last = decodeURIComponent(String(url).split('?')[0].split('/').pop() || '');
    return last || `Attachment ${i + 1}`;
  } catch {
    return `Attachment ${i + 1}`;
  }
};

export default function MyPoliciesCard({ userId }: { userId: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [acks, setAcks] = useState<Record<string, string>>({});

  useEffect(() => {
    try { setAcks(JSON.parse(localStorage.getItem(ACK_KEY(userId)) || '{}')); } catch { /* noop */ }
  }, [userId]);

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ['hr_policies_visible'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_policies')
        .select('id, title, body, attachments, updated_at')
        .eq('is_visible_to_all', true)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const acknowledge = (id: string) => {
    const next = { ...acks, [id]: new Date().toISOString() };
    setAcks(next);
    try { localStorage.setItem(ACK_KEY(userId), JSON.stringify(next)); } catch { /* noop */ }
  };

  const readCount = (policies as any[]).filter((p) => acks[p.id]).length;

  return (
    <SectionBlock
      icon={BookOpen}
      title="Published policies"
      description={policies.length ? `${policies.length} published · ${readCount} marked as read on this device` : undefined}
      flush
    >
      {isLoading ? (
        <ProfileSkeleton rows={3} bare />
      ) : policies.length === 0 ? (
        <ProfileEmptyState bare icon={BookOpen} title="No policies published yet" description="Company policies appear here once HR publishes them." />
      ) : (
        <ul className="divide-y divide-border">
          {policies.map((p: any) => {
            const isOpen = open === p.id;
            const acked = acks[p.id];
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline-none"
                  onClick={() => setOpen(isOpen ? null : p.id)}
                  aria-expanded={isOpen}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-foreground">{p.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {p.updated_at && <span>Updated {fmtDay(p.updated_at)}</span>}
                      {acked && (
                        <StatusPill tone="success"><CheckCircle2 className="h-3 w-3" /> Read</StatusPill>
                      )}
                    </div>
                  </div>
                  <ChevronDown className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
                </button>
                {isOpen && (
                  <div className="space-y-3 px-3.5 pb-4">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{p.body}</div>
                    {Array.isArray(p.attachments) && p.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {p.attachments.map((a: string, i: number) => (
                          <a key={i} href={a} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-primary hover:bg-primary/5">
                            <Paperclip className="h-3 w-3" /> {fileName(a, i)}
                          </a>
                        ))}
                      </div>
                    )}
                    {!acked ? (
                      <Button size="sm" onClick={() => acknowledge(p.id)}>
                        I have read & understood
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        You marked this as read on {fmtDay(acked)} (saved on this device).
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionBlock>
  );
}
