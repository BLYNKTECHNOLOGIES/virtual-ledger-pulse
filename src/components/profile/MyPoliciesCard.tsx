import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BookOpen, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';

const ACK_KEY = (uid: string) => `hr_policy_ack_${uid}`;

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4" /> HR Policies
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading policies…</p>
        ) : policies.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No policies published yet.</p>
        ) : (
          <ScrollArea className="max-h-[420px] pr-2">
            <div className="space-y-2">
              {policies.map((p: any) => {
                const isOpen = open === p.id;
                const acked = acks[p.id];
                return (
                  <div key={p.id} className="rounded-lg border">
                    <button
                      className="w-full flex items-center justify-between p-3 text-left"
                      onClick={() => setOpen(isOpen ? null : p.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{p.title}</div>
                        {acked && (
                          <div className="text-[11px] text-emerald-600 flex items-center gap-1 mt-0.5">
                            <CheckCircle2 className="h-3 w-3" /> Acknowledged
                          </div>
                        )}
                      </div>
                      {isOpen ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 space-y-3">
                        <div className="text-sm whitespace-pre-wrap text-muted-foreground">{p.body}</div>
                        {Array.isArray(p.attachments) && p.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {p.attachments.map((a: string, i: number) => (
                              <a key={i} href={a} target="_blank" rel="noopener noreferrer" className="text-xs underline text-primary">
                                Attachment {i + 1}
                              </a>
                            ))}
                          </div>
                        )}
                        {!acked ? (
                          <Button size="sm" onClick={() => acknowledge(p.id)}>
                            I have read & understood
                          </Button>
                        ) : (
                          <Badge variant="secondary" className="text-[11px]">
                            Acknowledged {new Date(acked).toLocaleDateString()}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
