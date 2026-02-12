import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export function useReconciliationScan() {
  const [isScanning, setIsScanning] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const lastScanQuery = useQuery({
    queryKey: ['reconciliation-last-scan'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reconciliation_scan_log')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  const scanHistoryQuery = useQuery({
    queryKey: ['reconciliation-scan-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reconciliation_scan_log')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
  });

  const runScan = async (scope: string[] = ['all']) => {
    setIsScanning(true);
    try {
      const response = await supabase.functions.invoke('reconciliation-scan', {
        body: { scope, triggered_by: user?.username || user?.id || 'unknown' },
      });

      if (response.error) throw response.error;

      const result = response.data;
      toast.success(`Scan complete: ${result.findings_count} findings (${result.critical_count} critical)`);

      queryClient.invalidateQueries({ queryKey: ['reconciliation-findings'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-counts'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-last-scan'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-scan-history'] });

      return result;
    } catch (err: any) {
      console.error('Scan failed:', err);
      toast.error('Reconciliation scan failed: ' + (err?.message || 'Unknown error'));
      throw err;
    } finally {
      setIsScanning(false);
    }
  };

  return {
    runScan,
    isScanning,
    lastScan: lastScanQuery.data,
    lastScanLoading: lastScanQuery.isLoading,
    scanHistory: scanHistoryQuery.data || [],
  };
}
