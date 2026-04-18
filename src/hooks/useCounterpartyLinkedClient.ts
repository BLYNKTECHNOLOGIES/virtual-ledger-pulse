import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LinkedClientRiskInfo {
  client_id: string;
  name: string;
  risk_appetite: string | null;
  buyer_approval_status: string | null;
  seller_approval_status: string | null;
  is_buyer: boolean | null;
  is_seller: boolean | null;
  matchedBy: 'nickname' | 'verified_name';
}

/**
 * Resolve a Binance counterparty to an existing client by nickname (priority 1)
 * or verified name (priority 2). Only returns the client if their relevant side
 * (buyer for SELL orders, seller for BUY orders) has been APPROVED.
 */
export function useCounterpartyLinkedClient(
  counterpartyNickname?: string | null,
  counterpartyVerifiedName?: string | null,
  tradeType?: 'BUY' | 'SELL'
) {
  return useQuery<LinkedClientRiskInfo | null>({
    queryKey: ['counterparty_linked_client', counterpartyNickname, counterpartyVerifiedName, tradeType],
    enabled: !!(counterpartyNickname || counterpartyVerifiedName),
    staleTime: 60_000,
    queryFn: async () => {
      const nickname = counterpartyNickname?.trim();
      const verifiedName = counterpartyVerifiedName?.trim();

      let clientId: string | null = null;
      let matchedBy: 'nickname' | 'verified_name' = 'nickname';

      // Priority 1: nickname link (skip masked nicknames containing '*')
      if (nickname && !nickname.includes('*')) {
        const { data: nickRow } = await supabase
          .from('client_binance_nicknames')
          .select('client_id')
          .eq('nickname', nickname)
          .eq('is_active', true)
          .maybeSingle();
        if (nickRow?.client_id) {
          clientId = nickRow.client_id;
          matchedBy = 'nickname';
        }
      }

      // Priority 2: verified name link
      if (!clientId && verifiedName) {
        const { data: vnRows } = await supabase
          .from('client_verified_names')
          .select('client_id')
          .eq('verified_name', verifiedName)
          .limit(1);
        if (vnRows && vnRows.length > 0) {
          clientId = vnRows[0].client_id;
          matchedBy = 'verified_name';
        }
      }

      if (!clientId) return null;

      const { data: client } = await supabase
        .from('clients')
        .select('id, name, risk_appetite, buyer_approval_status, seller_approval_status, is_buyer, is_seller, is_deleted')
        .eq('id', clientId)
        .maybeSingle();

      if (!client || client.is_deleted) return null;

      // For SELL orders the counterparty is a buyer; for BUY orders, a seller.
      // Only surface the risk if the relevant approval has happened.
      const relevantStatus = tradeType === 'BUY'
        ? client.seller_approval_status
        : client.buyer_approval_status;
      if (relevantStatus !== 'APPROVED') return null;

      return {
        client_id: client.id,
        name: client.name,
        risk_appetite: client.risk_appetite,
        buyer_approval_status: client.buyer_approval_status,
        seller_approval_status: client.seller_approval_status,
        is_buyer: client.is_buyer,
        is_seller: client.is_seller,
        matchedBy,
      };
    },
  });
}

export const RISK_BADGE_STYLES: Record<string, { label: string; className: string }> = {
  PREMIUM:     { label: 'Premium',     className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  ESTABLISHED: { label: 'Established', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  STANDARD:    { label: 'Standard',    className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  CAUTIOUS:    { label: 'Cautious',    className: 'bg-orange-100 text-orange-800 border-orange-200' },
  HIGH_RISK:   { label: 'High Risk',   className: 'bg-red-100 text-red-800 border-red-200' },
};
