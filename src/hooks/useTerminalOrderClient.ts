import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';

/**
 * ERP client behind a Terminal order — resolved on the server by Binance userNo
 * only (get_terminal_order_client), the same identity rule as
 * src/lib/clientIdentityResolver.ts. Names and nicknames are never used to
 * match, because they collide across different people.
 */
export interface TerminalOrderClientProfile {
  id: string;
  code: string | null;
  name: string;
  state: string | null;
  client_type: string | null;
  since: string | null;
  kyc_status: string | null;
  risk_appetite: string | null;
  risk_level: string | null;
  buyer_status: string | null;
  seller_status: string | null;
  purpose: string | null;
  compliance_note: string | null;
  assigned_operator: string | null;
  monthly_limit: number | null;
  phone_masked: string | null;
  pan_masked: string | null;
  /** Whether the viewer may open /clients/:id (clients_view or clients_manage). */
  can_open_profile?: boolean;
}

export interface TerminalOrderClientLinked {
  status: 'linked';
  client: TerminalOrderClientProfile;
  month: {
    /** COMPLETED ERP sales orders this IST calendar month. */
    buy_total: number;
    buy_count: number;
    /** Completed Binance sales to this client this month that are not in ERP yet. */
    pending_total?: number;
    pending_count?: number;
    /** True when the order being viewed is already inside buy_total or pending_total. */
    this_order_counted?: boolean;
  };
  history: {
    buy_count: number; buy_total: number; first_buy: string | null; last_buy: string | null;
    sell_count: number; sell_total: number; first_sell: string | null; last_sell: string | null;
  };
  banks: { bank: string | null; last4: string | null }[];
  documents: {
    count: number; aadhaar: boolean; pan: boolean; vkyc: boolean; bank_statement: boolean; source_of_fund: boolean;
    /** Distinct lower-case document types on file. */
    types?: string[];
  };
  notes: { note: string; by: string | null; at: string }[];
  limit_request_pending: boolean;
}

export type TerminalOrderClientResult =
  | { status: 'identity_pending' }
  | { status: 'not_client' }
  | TerminalOrderClientLinked;

/** The server refuses people without ERP client access (42501) — not a failure worth retrying or showing. */
export const isClientAccessDenied = (error: unknown) =>
  !!error && typeof error === 'object' && (error as { code?: string }).code === '42501';

const PENDING_RECHECK_MS = 15_000;
const PENDING_MAX_CHECKS = 8;

/** One server call per order; cached so switching between orders is instant. */
export function useTerminalOrderClient(orderNumber?: string | null) {
  // Keyed by the signed-in person too, so a later sign-in on the same tab never sees cached client data.
  const { userId } = useTerminalAuth();
  return useQuery<TerminalOrderClientResult>({
    queryKey: ['terminal-order-client', userId ?? null, orderNumber ?? null],
    enabled: !!userId && !!orderNumber && !orderNumber.startsWith('INQ-'),
    // A brand-new order may not have the counterparty's Binance id stored yet; look again shortly.
    staleTime: (q) => (q.state.data?.status === 'identity_pending' ? PENDING_RECHECK_MS : 2 * 60_000),
    refetchInterval: (q) =>
      q.state.data?.status === 'identity_pending' && q.state.dataUpdateCount < PENDING_MAX_CHECKS ? PENDING_RECHECK_MS : false,
    retry: (failures, error) => !isClientAccessDenied(error) && failures < 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_terminal_order_client', { p_order_number: orderNumber as string });
      if (error) throw error;
      return (data ?? { status: 'not_client' }) as unknown as TerminalOrderClientResult;
    },
  });
}

export const isLinkedClient = (r: TerminalOrderClientResult | undefined | null): r is TerminalOrderClientLinked =>
  !!r && r.status === 'linked' && !!(r as TerminalOrderClientLinked).client;
