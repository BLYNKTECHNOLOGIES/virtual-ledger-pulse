import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
  const checkedAt = latestSnapshot?.checked_at ? new Date(latestSnapshot.checked_at) : null;

  return (
    <Card className={hasRestriction || isCachedOnly ? 'border-amber-500/30 bg-amber-500/5' : ''}>
      <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            {hasRestriction ? <ShieldAlert className="h-5 w-5 text-amber-500" /> : <CheckCircle className="h-5 w-5 text-primary" />}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">Binance Merchant State</p>
              <Badge variant="outline" className={`text-xs ${statusClass(businessStatus)}`}>
                {isCachedOnly ? `Cached: ${statusLabel(businessStatus)}` : statusLabel(businessStatus)}
              </Badge>
              {(userDetail.isError || isCachedOnly) && (
                <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/5 text-xs">
                  API unavailable
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {apiData?.nickname || latestSnapshot?.nickname || 'Binance merchant'}
              {apiData?.userKycStatus || latestSnapshot?.user_kyc_status ? ` · KYC ${apiData?.userKycStatus || latestSnapshot?.user_kyc_status}` : ''}
              {checkedAt ? ` · Checked ${format(checkedAt, 'dd MMM HH:mm:ss')}` : ''}
            </p>
            {hasRestriction && (
              <p className="flex items-center gap-1 text-xs text-amber-500">
                <AlertTriangle className="h-3.5 w-3.5" /> Binance is reporting a restricted merchant state; automation failures may be Binance-side.
              </p>
            )}
            {isCachedOnly && !hasRestriction && (
              <p className="flex items-center gap-1 text-xs text-amber-500">
                <AlertTriangle className="h-3.5 w-3.5" /> Showing cached Binance state only; refresh failed or live state is unavailable.
              </p>
            )}
            {userDetail.isError && <p className="text-xs text-destructive">{(userDetail.error as Error).message}</p>}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshState.mutate()}
          disabled={refreshState.isPending || userDetail.isLoading}
          className="shrink-0"
        >
          {refreshState.isPending || userDetail.isLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
          Refresh State
        </Button>
      </CardContent>
    </Card>
  );
}
