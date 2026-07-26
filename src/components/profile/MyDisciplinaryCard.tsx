import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert } from 'lucide-react';

export default function MyDisciplinaryCard({ employeeId }: { employeeId: string }) {
  const { data: actions = [], isLoading } = useQuery({
    queryKey: ['my_disciplinary', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_disciplinary_actions')
        .select('id, action_type, description, unit_in, duration, start_date, created_at')
        .contains('employee_ids', [employeeId])
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="h-4 w-4" /> Disciplinary Record</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
        ) : actions.length === 0 ? (
          <p className="text-sm text-emerald-600 py-4 text-center">Clean record. No disciplinary actions on file.</p>
        ) : (
          <div className="space-y-2">
            {actions.map((a: any) => (
              <div key={a.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{a.action_type}</div>
                    {a.description && <div className="text-xs text-muted-foreground mt-1">{a.description}</div>}
                  </div>
                  {a.duration && <Badge variant="outline">{a.duration} {a.unit_in || ''}</Badge>}
                </div>
                {a.start_date && <div className="text-[11px] text-muted-foreground mt-1">From {new Date(a.start_date).toLocaleDateString()}</div>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
