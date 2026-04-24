import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { useBinanceActiveOrders, useMarkOrderAsPaid, callBinanceAds } from '@/hooks/useBinanceActions';
import { useMemo, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

interface PayerAssignment {
  id: string;
  payer_user_id: string;
  assignment_type: 'size_range' | 'ad_id';
  size_range_id: string | null;
  ad_id: string | null;
  is_active: boolean;
  assigned_by: string;
  created_at: string;
  size_range?: { id: string; name: string; min_amount: number; max_amount: number } | null;
}

interface PayerOrderLog {
  id: string;
  order_number: string;
  payer_id: string;
  action: string;
  created_at: string;
}

interface PayerOrderLock {
  id: string;
  order_number: string;
  payer_user_id: string;
  status: string;
  locked_at: string;
}

export function usePayerAssignments(payerUserId?: string | null) {
  return useQuery({
    queryKey: ['payer-assignments', payerUserId],
    queryFn: async () => {
      let query = supabase
        .from('terminal_payer_assignments')
        .select('*')
        .eq('is_active', true);
      if (payerUserId) {
        query = query.eq('payer_user_id', payerUserId);
      }
      const { data, error } = await query;
      if (error) throw error;

      const sizeRangeIds = (data || [])
        .filter((a: any) => a.size_range_id)
        .map((a: any) => a.size_range_id);

      let sizeRangeMap: Record<string, any> = {};
      if (sizeRangeIds.length > 0) {
        const { data: ranges } = await supabase
          .from('terminal_order_size_ranges')
          .select('id, name, min_amount, max_amount')
          .in('id', sizeRangeIds);
        if (ranges) {
          for (const r of ranges) {
            sizeRangeMap[r.id] = r;
          }
        }
      }

      return (data || []).map((a: any) => ({
        ...a,
        size_range: a.size_range_id ? sizeRangeMap[a.size_range_id] || null : null,
      })) as PayerAssignment[];
    },
    enabled: true,
    placeholderData: keepPreviousData,
    retry: 3,
    staleTime: 30_000,
  });
}

// ===================== Order Locks =====================

export function usePayerOrderLocks() {
  return useQuery({
    queryKey: ['payer-order-locks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_payer_order_locks' as any)
        .select('*')
        .eq('status', 'active');
      if (error) throw error;
      return (data || []) as unknown as PayerOrderLock[];
    },
    staleTime: 2 * 1000,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });
}

function useLockOrderToPayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderNumber, payerUserId }: { orderNumber: string; payerUserId: string }) => {
      // Guarded insert: PostgREST cannot target partial unique indexes via onConflict,
      // so we attempt a plain insert and swallow 23505 (unique violation) which means
      // the order is already locked by someone — that is the expected no-op outcome.
      const { error } = await supabase
        .from('terminal_payer_order_locks' as any)
        .insert({ order_number: orderNumber, payer_user_id: payerUserId, status: 'active' });
      if (error) {
        // 23505 = unique_violation → already locked, fine.
        if (error.code === '23505') return;
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payer-order-locks'] });
    },
  });
}

function useCompleteOrderLock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderNumber: string) => {
      const { error } = await supabase
        .from('terminal_payer_order_locks' as any)
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('order_number', orderNumber)
        .eq('status', 'active');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payer-order-locks'] });
    },
  });
}

export function usePayerOrderLog() {
  return useQuery({
    queryKey: ['payer-order-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_payer_order_log')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as PayerOrderLog[];
    },
  });
}

export function useAutoReplyExclusions() {
  return useQuery({
    queryKey: ['auto-reply-exclusions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_auto_reply_exclusions')
        .select('order_number');
      if (error) throw error;
      return new Set((data || []).map((d: any) => d.order_number));
    },
  });
}

export function useExcludeFromAutoReply() {
  const queryClient = useQueryClient();
  const { userId } = useTerminalAuth();

  return useMutation({
    mutationFn: async (orderNumber: string) => {
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('terminal_auto_reply_exclusions')
        .insert({ order_number: orderNumber, excluded_by: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Order removed from auto-reply');
      queryClient.invalidateQueries({ queryKey: ['auto-reply-exclusions'] });
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });
}

export function useLogPayerAction() {
  const queryClient = useQueryClient();
  const { userId } = useTerminalAuth();
  const completeOrderLock = useCompleteOrderLock();

  return useMutation({
    mutationFn: async ({ orderNumber, action }: { orderNumber: string; action: string }) => {
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('terminal_payer_order_log')
        .insert({ order_number: orderNumber, payer_id: userId, action });
      if (error) throw error;
    },
    onSuccess: (_d, variables) => {
      queryClient.invalidateQueries({ queryKey: ['payer-order-log'] });
      // When an order is marked paid, release the lock
      if (variables.action === 'marked_paid') {
        completeOrderLock.mutate(variables.orderNumber);
      }
    },
  });
}

export function usePayerOrders() {
  const queryClient = useQueryClient();
  const { userId } = useTerminalAuth();
  const { data: activeOrdersData, isLoading: ordersLoading, refetch: refetchOrders, isFetching } = useBinanceActiveOrders();
  const { data: myAssignments = [], isLoading: assignmentsLoading } = usePayerAssignments(userId);
  const { data: allAssignments = [], isLoading: allAssignmentsLoading } = usePayerAssignments(null);
  const { data: orderLog = [], isLoading: logLoading } = usePayerOrderLog();
  const { data: orderLocks = [], isLoading: locksLoading } = usePayerOrderLocks();
  const { data: exclusions = new Set<string>() } = useAutoReplyExclusions();
  const lockOrder = useLockOrderToPayer();

  // Realtime: instantly invalidate locks/log when any payer takes action anywhere
  useEffect(() => {
    const channel = supabase
      .channel('payer-tab-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'terminal_payer_order_locks' }, () => {
        queryClient.invalidateQueries({ queryKey: ['payer-order-locks'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'terminal_payer_order_log' }, () => {
        queryClient.invalidateQueries({ queryKey: ['payer-order-log'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Set of orders already marked paid
  const paidOrderNumbers = useMemo(() => {
    return new Set(orderLog.filter(l => l.action === 'marked_paid').map(l => l.order_number));
  }, [orderLog]);

  // Build lock maps for fast lookup
  const lockByOrder = useMemo(() => {
    const map = new Map<string, string>(); // order_number -> payer_user_id
    for (const lock of orderLocks) {
      map.set(lock.order_number, lock.payer_user_id);
    }
    return map;
  }, [orderLocks]);

  // Count how many orders each payer already has marked paid (for workload balancing)
  const payerWorkloadMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const log of orderLog) {
      if (log.action === 'marked_paid') {
        map[log.payer_id] = (map[log.payer_id] || 0) + 1;
      }
    }
    return map;
  }, [orderLog]);

  // Helper: find all payer user IDs that match a given order
  const getMatchingPayers = useCallback((order: any): string[] => {
    const totalPrice = parseFloat(order.totalPrice || '0');
    const advNo = order.advNo || '';
    const matchedPayers = new Set<string>();

    for (const a of allAssignments) {
      if (!a.is_active) continue;
      if (a.assignment_type === 'ad_id' && a.ad_id && advNo === a.ad_id) {
        matchedPayers.add(a.payer_user_id);
      }
      if (a.assignment_type === 'size_range' && a.size_range) {
        if (totalPrice >= a.size_range.min_amount && totalPrice <= a.size_range.max_amount) {
          matchedPayers.add(a.payer_user_id);
        }
      }
    }
    return Array.from(matchedPayers);
  }, [allAssignments]);

  // Filter and deduplicate: locked orders stay with their payer, new orders get distributed
  const { myOrders: allMatchedOrders, newLocks } = useMemo(() => {
    const d = (activeOrdersData as any)?.data ?? activeOrdersData;
    const list = Array.isArray(d) ? d : [];


    const buyOrders = list.filter((o: any) => o.tradeType === 'BUY');

    if (myAssignments.length === 0) {
      // Even with no current assignments, still show orders locked to this user
      const lockedToMe = buyOrders.filter((o: any) => lockByOrder.get(o.orderNumber) === userId);
      return { myOrders: lockedToMe, newLocks: [] };
    }

    const myOrders: any[] = [];
    const newLocks: { orderNumber: string; payerUserId: string }[] = [];
    const runningWorkload: Record<string, number> = { ...payerWorkloadMap };

    const sorted = [...buyOrders].sort((a: any, b: any) =>
      (a.orderNumber || '').localeCompare(b.orderNumber || '')
    );

    for (const order of sorted) {
      const existingLock = lockByOrder.get(order.orderNumber);

      if (existingLock) {
        // Order is already locked to a payer — respect the lock regardless of current assignments
        if (existingLock === userId) {
          myOrders.push(order);
        } else {
        }
        continue;
      }

      // No lock exists — distribute based on current assignments
      const matchingPayers = getMatchingPayers(order);
      if (matchingPayers.length === 0) continue;

      // Pick the payer with least workload
      let bestPayer = matchingPayers[0];
      let bestLoad = runningWorkload[bestPayer] || 0;
      for (let i = 1; i < matchingPayers.length; i++) {
        const load = runningWorkload[matchingPayers[i]] || 0;
        if (load < bestLoad) {
          bestLoad = load;
          bestPayer = matchingPayers[i];
        }
      }

      runningWorkload[bestPayer] = (runningWorkload[bestPayer] || 0) + 1;

      // Create a lock for this new assignment
      newLocks.push({ orderNumber: order.orderNumber, payerUserId: bestPayer });

      if (bestPayer === userId) {
        myOrders.push(order);
      } else {
      }
    }

    return { myOrders, newLocks };
  }, [activeOrdersData, myAssignments, allAssignments, getMatchingPayers, payerWorkloadMap, userId, lockByOrder]);

  // Persist new locks to the database (fire-and-forget, deduplicated)
  const lockedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const lock of newLocks) {
      if (!lockedRef.current.has(lock.orderNumber)) {
        lockedRef.current.add(lock.orderNumber);
        lockOrder.mutate(lock, {
          onError: () => {
            // Remove from ref so it can retry next cycle
            lockedRef.current.delete(lock.orderNumber);
          },
        });
      }
    }
  }, [newLocks]);

  // Pending: orders that still need payer action.
  // NOTE: Status 3 (BUYER_PAYED → "Releasing" for BUY) is intentionally KEPT in pending
  // because the payer may still want to trigger Quick Receive (self-release via security
  // deposit) when the seller is slow to release coins. Only truly finalized states
  // (4/5 COMPLETED, 7 CANCELLED) and explicitly acknowledged orders are excluded.
  const pendingOrders = useMemo(() => {
    const excludeFromPending = new Set(['4', '5', '7']);
    const result = allMatchedOrders
      .filter((o: any) => !paidOrderNumbers.has(String(o.orderNumber)))
      .filter((o: any) => !excludeFromPending.has(String(o.orderStatus)));

    return result;
  }, [allMatchedOrders, paidOrderNumbers]);

  // Completed: orders marked paid by this payer (acknowledged) or finalized on Binance
  const completedOrders = useMemo(() => {
    return allMatchedOrders.filter((o: any) =>
      paidOrderNumbers.has(o.orderNumber) ||
      ['4', '5'].includes(String(o.orderStatus))
    );
  }, [allMatchedOrders, paidOrderNumbers]);

  return {
    orders: pendingOrders,
    completedOrders,
    isLoading: ordersLoading || assignmentsLoading || allAssignmentsLoading || logLoading || locksLoading,
    isFetching,
    refetch: refetchOrders,
    exclusions,
    paidOrderNumbers,
  };
}

// For management: get all payer assignments with user details
export function useAllPayerAssignments() {
  return useQuery({
    queryKey: ['all-payer-assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_payer_assignments')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Fetch user details and size range details
      const userIds = [...new Set((data || []).map((a: any) => a.payer_user_id))];
      const sizeRangeIds = (data || []).filter((a: any) => a.size_range_id).map((a: any) => a.size_range_id);

      const [usersRes, rangesRes] = await Promise.all([
        userIds.length > 0
          ? supabase.from('users').select('id, username, first_name, last_name').in('id', userIds)
          : { data: [] },
        sizeRangeIds.length > 0
          ? supabase.from('terminal_order_size_ranges').select('id, name, min_amount, max_amount').in('id', sizeRangeIds)
          : { data: [] },
      ]);

      const userMap: Record<string, any> = {};
      for (const u of usersRes.data || []) userMap[u.id] = u;

      const rangeMap: Record<string, any> = {};
      for (const r of rangesRes.data || []) rangeMap[r.id] = r;

      return (data || []).map((a: any) => ({
        ...a,
        user: userMap[a.payer_user_id] || null,
        size_range: a.size_range_id ? rangeMap[a.size_range_id] || null : null,
      }));
    },
  });
}

export function useCreatePayerAssignment() {
  const queryClient = useQueryClient();
  const { userId } = useTerminalAuth();

  return useMutation({
    mutationFn: async (params: {
      payer_user_id: string;
      assignment_type: 'size_range' | 'ad_id';
      size_range_id?: string;
      ad_id?: string;
    }) => {
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase.from('terminal_payer_assignments').insert({
        payer_user_id: params.payer_user_id,
        assignment_type: params.assignment_type,
        size_range_id: params.size_range_id || null,
        ad_id: params.ad_id || null,
        assigned_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Assignment created');
      queryClient.invalidateQueries({ queryKey: ['all-payer-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['payer-assignments'] });
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });
}

export function useTogglePayerAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('terminal_payer_assignments')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-payer-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['payer-assignments'] });
    },
  });
}

export function useDeletePayerAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('terminal_payer_assignments')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Assignment removed');
      queryClient.invalidateQueries({ queryKey: ['all-payer-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['payer-assignments'] });
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });
}

// ===================== Alternate UPI Request Hooks =====================

/** Query a single alternate UPI request by order number (latest) */
export function useAlternateUpiRequest(orderNumber: string) {
  return useQuery({
    queryKey: ['alternate-upi-request', orderNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_alternate_upi_requests' as any)
        .select('*')
        .eq('order_number', orderNumber)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!orderNumber,
  });
}

/** Query all alternate UPI requests, optionally filtered by status */
export function useAlternateUpiRequests(status?: string) {
  return useQuery({
    queryKey: ['alternate-upi-requests', status],
    queryFn: async () => {
      let query = supabase
        .from('terminal_alternate_upi_requests' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (status) {
        query = query.eq('status', status);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

/** Mutation: payer requests an alternate UPI */
export function useRequestAlternateUpi() {
  const queryClient = useQueryClient();
  const { userId } = useTerminalAuth();

  return useMutation({
    mutationFn: async (orderNumber: string) => {
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('terminal_alternate_upi_requests' as any)
        .insert({ order_number: orderNumber, requested_by: userId, status: 'pending' });
      if (error) throw error;
    },
    onSuccess: (_d, orderNumber) => {
      toast.success('Alternate UPI requested');
      queryClient.invalidateQueries({ queryKey: ['alternate-upi-request', orderNumber] });
      queryClient.invalidateQueries({ queryKey: ['alternate-upi-requests'] });
    },
    onError: (err: Error) => toast.error(`Request failed: ${err.message}`),
  });
}

/** Mutation: operator resolves an alternate UPI request with new details */
export function useResolveAlternateUpi() {
  const queryClient = useQueryClient();
  const { userId } = useTerminalAuth();

  return useMutation({
    mutationFn: async (params: {
      requestId: string;
      orderNumber: string;
      updatedUpiId: string;
      updatedUpiName: string;
      updatedPayMethod: string;
    }) => {
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('terminal_alternate_upi_requests' as any)
        .update({
          status: 'resolved',
          updated_upi_id: params.updatedUpiId,
          updated_upi_name: params.updatedUpiName,
          updated_pay_method: params.updatedPayMethod,
          resolved_by: userId,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', params.requestId);
      if (error) throw error;
    },
    onSuccess: (_d, params) => {
      toast.success('Payment method updated');
      queryClient.invalidateQueries({ queryKey: ['alternate-upi-request', params.orderNumber] });
      queryClient.invalidateQueries({ queryKey: ['alternate-upi-requests'] });
    },
    onError: (err: Error) => toast.error(`Update failed: ${err.message}`),
  });
}
