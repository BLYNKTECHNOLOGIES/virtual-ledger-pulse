import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, ShieldOff, Layers, Hash } from 'lucide-react';

export function PayerMyAssignments() {
  const { userId } = useTerminalAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['payer-my-assignments', userId],
    queryFn: async () => {
      if (!userId) return { assignments: [], sizeRanges: [] };

      const [assignmentsRes, rangesRes] = await Promise.all([
        supabase
          .from('terminal_payer_assignments')
          .select('id, assignment_type, size_range_id, ad_id, is_active, created_at')
          .eq('payer_user_id', userId),
        supabase
          .from('terminal_order_size_ranges')
          .select('id, name, min_amount, max_amount'),
      ]);

      // Only return new data if queries actually succeeded; otherwise throw to trigger retry
      if (assignmentsRes.error) {
        console.warn('[PayerMyAssignments] assignments query error:', assignmentsRes.error.message);
        throw new Error(assignmentsRes.error.message);
      }

      return {
        assignments: assignmentsRes.data || [],
        sizeRanges: rangesRes.data || [],
      };
    },
    enabled: !!userId,
    // CRITICAL: Keep showing previous data during background refetches to prevent flicker
    placeholderData: keepPreviousData,
    // Retry transient failures before showing error state
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    // Don't refetch too aggressively
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const assignments = data?.assignments || [];
  const sizeRangeMap = new Map((data?.sizeRanges || []).map((r: any) => [r.id, r]));

  const hasAssignments = assignments.length > 0;
  const activeAssignments = assignments.filter((a: any) => a.is_active);
  const isActive = activeAssignments.length > 0;

  if (isLoading) return null;

  return (
    <Card className={`border ${isActive ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-destructive/30 bg-destructive/5'}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          {isActive ? (
            <Shield className="h-4 w-4 text-emerald-500" />
          ) : (
            <ShieldOff className="h-4 w-4 text-destructive" />
          )}
          <span className="text-xs font-semibold text-foreground">My Payer Assignments</span>
          <Badge
            variant={isActive ? 'default' : 'destructive'}
            className="text-[9px] h-4 px-1.5"
          >
            {isActive ? 'Active' : hasAssignments ? 'All Inactive' : 'No Assignments'}
          </Badge>
        </div>

        {!hasAssignments ? (
          <p className="text-[11px] text-muted-foreground">
            You have no payer assignments. Contact your admin to get size ranges or ad IDs assigned.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {assignments.map((a: any) => {
              const range = a.size_range_id ? sizeRangeMap.get(a.size_range_id) : null;
              return (
                <div
                  key={a.id}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] ${
                    a.is_active
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : 'border-muted bg-muted/30 text-muted-foreground line-through'
                  }`}
                >
                  {a.assignment_type === 'size_range' ? (
                    <>
                      <Layers className="h-3 w-3 shrink-0" />
                      <span className="font-medium">
                        {range
                          ? `${range.name} (₹${Number(range.min_amount).toLocaleString('en-IN')} – ₹${Number(range.max_amount).toLocaleString('en-IN')})`
                          : 'Unknown Range'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Hash className="h-3 w-3 shrink-0" />
                      <span className="font-mono font-medium">{a.ad_id || 'N/A'}</span>
                    </>
                  )}
                  {!a.is_active && (
                    <Badge variant="outline" className="text-[8px] h-3 px-1 border-destructive/40 text-destructive">
                      Inactive
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
