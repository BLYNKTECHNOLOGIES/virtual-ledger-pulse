import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { useBinanceActiveOrders, useMarkOrderAsPaid, callBinanceAds } from '@/hooks/useBinanceActions';
import { useMemo, useCallback } from 'react';
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

      // Fetch size range details for assignments that have size_range_id
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

  return useMutation({
    mutationFn: async ({ orderNumber, action }: { orderNumber: string; action: string }) => {
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('terminal_payer_order_log')
        .insert({ order_number: orderNumber, payer_id: userId, action });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payer-order-log'] });
    },
  });
}

export function usePayerOrders() {
  const { userId } = useTerminalAuth();
  const { data: activeOrdersData, isLoading: ordersLoading, refetch: refetchOrders, isFetching } = useBinanceActiveOrders();
  const { data: assignments = [], isLoading: assignmentsLoading } = usePayerAssignments(userId);
  const { data: orderLog = [], isLoading: logLoading } = usePayerOrderLog();
  const { data: exclusions = new Set<string>() } = useAutoReplyExclusions();

  // Set of orders already marked paid
  const paidOrderNumbers = useMemo(() => {
    return new Set(orderLog.filter(l => l.action === 'marked_paid').map(l => l.order_number));
  }, [orderLog]);

  // Filter active BUY orders matching payer assignments
  const allMatchedOrders = useMemo(() => {
    const d = (activeOrdersData as any)?.data ?? activeOrdersData;
    const list = Array.isArray(d) ? d : [];

    // Only BUY orders
    const buyOrders = list.filter((o: any) => o.tradeType === 'BUY');

    // Filter by assignment
    return buyOrders.filter((o: any) => {
      const totalPrice = parseFloat(o.totalPrice || '0');
      const advNo = o.advNo || '';

      return assignments.some((a) => {
        if (a.assignment_type === 'ad_id' && a.ad_id) {
          return advNo === a.ad_id;
        }
        if (a.assignment_type === 'size_range' && a.size_range) {
          return totalPrice >= a.size_range.min_amount && totalPrice <= a.size_range.max_amount;
        }
        return false;
      });
    });
  }, [activeOrdersData, assignments]);

  // Pending: not marked paid, not completed/cancelled/expired
  const pendingOrders = useMemo(() => {
    return allMatchedOrders
      .filter((o: any) => !paidOrderNumbers.has(o.orderNumber))
      .filter((o: any) => {
        const status = String(o.orderStatus ?? '').toUpperCase();
        return !status.includes('COMPLETED') && !status.includes('CANCEL') && !status.includes('EXPIRED');
      });
  }, [allMatchedOrders, paidOrderNumbers]);

  // Completed: orders marked paid by this payer (from log)
  const completedOrders = useMemo(() => {
    return allMatchedOrders.filter((o: any) => paidOrderNumbers.has(o.orderNumber));
  }, [allMatchedOrders, paidOrderNumbers]);

  return {
    orders: pendingOrders,
    completedOrders,
    isLoading: ordersLoading || assignmentsLoading || logLoading,
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
