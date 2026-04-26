import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useBinanceUserDetail, useRefreshMerchantState } from '@/hooks/useBinanceActions';

function statusLabel(status: unknown) {
  const value = Number(status);
  if (value === 1) return 'Open';
  if (value === 2) return 'Closed';
  if (value === 3) return 'Take Break';
  return 'Unknown';
}

function statusClass(status: unknown) {
  const value = Number(status);
  if (value === 1) return 'border-trade-buy/30 text-trade-buy bg-trade-buy/5';
  if (value === 2) return 'border-destructive/30 text-destructive bg-destructive/5';
  if (value === 3) return 'border-amber-500/30 text-amber-500 bg-amber-500/5';
  return 'border-muted-foreground/30 text-muted-foreground bg-muted/30';
}

export function MerchantStateCard() {
  const userDetail = useBinanceUserDetail();
  const refreshState = useRefreshMerchantState();

  const { data: latestSnapshot } = useQuery({
    queryKey: ['binance-merchant-state-snapshots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('binance_merchant_state_snapshots' as any)
        .select('*')
        .order('checked_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    refetchInterval: 60_000,
  });

  const apiData = useMemo(() => {
    const raw = userDetail.data as any;
    return raw?.data?.data || raw?.data || null;
  }, [userDetail.data]);

  const hasLiveStatus = apiData?.businessStatus !== undefined && apiData?.businessStatus !== null;
  const businessStatus = hasLiveStatus ? apiData?.businessStatus : latestSnapshot?.business_status;
  const hasRestriction = Number(businessStatus) === 2 || Number(businessStatus) === 3;
  const isCachedOnly = !hasLiveStatus && !!latestSnapshot;

  return (
    <div className={`flex h-9 shrink-0 items-center gap-2 rounded-md border px-2.5 ${hasRestriction || isCachedOnly ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-card'}`}>
      {hasRestriction ? <ShieldAlert className="h-4 w-4 text-amber-500" /> : <CheckCircle className="h-4 w-4 text-primary" />}
      <span className="text-xs font-medium text-foreground">Merchant</span>
      <Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${statusClass(businessStatus)}`}>
        {isCachedOnly ? `Cached ${statusLabel(businessStatus)}` : statusLabel(businessStatus)}
      </Badge>
      {(userDetail.isError || isCachedOnly) && <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-destructive/30 text-destructive bg-destructive/5">API</Badge>}
      <Button variant="ghost" size="icon" onClick={() => refreshState.mutate()} disabled={refreshState.isPending || userDetail.isLoading} className="h-6 w-6 text-muted-foreground hover:text-foreground">
        {refreshState.isPending || userDetail.isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
