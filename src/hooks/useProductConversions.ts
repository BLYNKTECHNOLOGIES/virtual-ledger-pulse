
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId, logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from "@/lib/system-action-logger";
import { toast } from "@/hooks/use-toast";

export interface ConversionDraft {
  wallet_id: string;
  side: 'BUY' | 'SELL';
  asset_code: string;
  quantity: number;
  price_usd: number;
  gross_usd_value: number;
  fee_percentage: number;
  fee_amount: number;
  fee_asset: string;
  net_asset_change: number;
  net_usdt_change: number;
  metadata?: Record<string, any>;
}

export interface ConversionRecord {
  id: string;
  reference_no: string;
  wallet_id: string;
  side: string;
  asset_code: string;
  quantity: number;
  price_usd: number;
  gross_usd_value: number;
  fee_percentage: number;
  fee_amount: number;
  fee_asset: string;
  net_asset_change: number;
  net_usdt_change: number;
  status: string;
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  metadata: Record<string, any>;
  // Joined
  wallets?: { wallet_name: string } | null;
  creator?: { username: string } | null;
  approver?: { username: string } | null;
  rejector?: { username: string } | null;
}

export interface ConversionFilters {
  dateFrom?: string;
  dateTo?: string;
  walletId?: string;
  side?: string;
  assetCode?: string;
  status?: string;
}

const CONVERSION_SELECT = `
  *,
  wallets:wallet_id(wallet_name),
  creator:created_by(username),
  approver:approved_by(username),
  rejector:rejected_by(username)
`;

export function useCreateConversion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (draft: ConversionDraft) => {
      const userId = getCurrentUserId();
      if (!userId) throw new Error("User session not found");

      const { data, error } = await supabase
        .from('erp_product_conversions' as any)
        .insert({
          ...draft,
          created_by: userId,
          status: 'PENDING_APPROVAL',
        })
        .select('id, reference_no')
        .single();

      if (error) throw error;

      await logActionWithCurrentUser({
        actionType: 'stock.conversion_created',
        entityType: 'erp_conversion',
        entityId: (data as any).id,
        module: Modules.STOCK,
        metadata: { reference_no: (data as any).reference_no, side: draft.side, asset_code: draft.asset_code },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['erp_conversions'] });
      toast({ title: "Conversion created", description: "Submitted for approval." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function usePendingConversions() {
  return useQuery({
    queryKey: ['erp_conversions', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('erp_product_conversions' as any)
        .select(CONVERSION_SELECT)
        .eq('status', 'PENDING_APPROVAL')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as ConversionRecord[];
    },
  });
}

export function useApproveConversion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversionId: string) => {
      const userId = getCurrentUserId();
      if (!userId) throw new Error("User session not found");

      const { data, error } = await supabase.rpc('approve_product_conversion', {
        p_conversion_id: conversionId,
        p_approved_by: userId,
      });

      if (error) throw error;
      const result = data as any;
      if (!result?.success) {
        throw new Error(result?.error || 'Approval failed');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['erp_conversions'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_asset_balances'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-stock'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_asset_positions'] });
      queryClient.invalidateQueries({ queryKey: ['realized_pnl_events'] });
      toast({ title: "Approved", description: "Conversion approved and posted." });
    },
    onError: (error: any) => {
      toast({ title: "Approval failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useRejectConversion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversionId, reason }: { conversionId: string; reason?: string }) => {
      const userId = getCurrentUserId();
      if (!userId) throw new Error("User session not found");

      const { data, error } = await supabase.rpc('reject_product_conversion', {
        p_conversion_id: conversionId,
        p_rejected_by: userId,
        p_reason: reason || null,
      });

      if (error) throw error;
      const result = data as any;
      if (!result?.success) {
        throw new Error(result?.error || 'Rejection failed');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['erp_conversions'] });
      toast({ title: "Rejected", description: "Conversion has been rejected." });
    },
    onError: (error: any) => {
      toast({ title: "Rejection failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useConversionHistory(filters: ConversionFilters = {}) {
  return useQuery({
    queryKey: ['erp_conversions', 'history', filters],
    queryFn: async () => {
      let query = supabase
        .from('erp_product_conversions' as any)
        .select(CONVERSION_SELECT)
        .order('created_at', { ascending: false });

      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.walletId) {
        query = query.eq('wallet_id', filters.walletId);
      }
      if (filters.side) {
        query = query.eq('side', filters.side);
      }
      if (filters.assetCode) {
        query = query.eq('asset_code', filters.assetCode);
      }
      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo + 'T23:59:59');
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as ConversionRecord[];
    },
  });
}
