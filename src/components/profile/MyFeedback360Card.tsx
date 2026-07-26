import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquareHeart } from 'lucide-react';

export default function MyFeedback360Card({ employeeId }: { employeeId: string }) {
  const { data: pending = [] } = useQuery({
    queryKey: ['fb360_pending', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_feedback_360')
        .select('id, review_cycle, feedback_type, status, employee_id, updated_at')
        .eq('reviewer_id', employeeId)
        .neq('status', 'submitted')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  const { data: received = [] } = useQuery({
    queryKey: ['fb360_received', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_feedback_360')
        .select('id, review_cycle, feedback_type, rating, strengths, improvements, comments, submitted_at')
        .eq('employee_id', employeeId)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><MessageSquareHeart className="h-4 w-4" /> 360° Feedback</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">Pending from you</div>
          {pending.length === 0 ? (
            <p className="text-xs text-muted-foreground">No pending reviews.</p>
          ) : (
            <div className="space-y-2">
              {pending.map((p: any) => (
                <div key={p.id} className="rounded border p-2 flex items-center justify-between">
                  <div className="text-sm">{p.review_cycle} · {p.feedback_type}</div>
                  <Badge variant="outline">{p.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">Feedback about you</div>
          {received.length === 0 ? (
            <p className="text-xs text-muted-foreground">No feedback received yet.</p>
          ) : (
            <div className="space-y-2">
              {received.map((r: any) => (
                <div key={r.id} className="rounded border p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{r.review_cycle}</div>
                    {r.rating != null && <Badge>{r.rating}/5</Badge>}
                  </div>
                  {r.strengths && <div className="text-xs mt-1"><b>Strengths:</b> {r.strengths}</div>}
                  {r.improvements && <div className="text-xs mt-1"><b>Improvements:</b> {r.improvements}</div>}
                  {r.comments && <div className="text-xs text-muted-foreground mt-1">{r.comments}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
