import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTerminalJurisdiction } from '@/hooks/useTerminalJurisdiction';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { toast } from 'sonner';

interface AutoAssignmentConfig {
  id: string;
  is_enabled: boolean;
  assignment_strategy: string;
  max_orders_per_operator: number;
  consider_specialization: boolean;
  consider_shift: boolean;
  consider_size_range: boolean;
  consider_exchange_mapping: boolean;
  cooldown_minutes: number;
}

export function useAutoAssignment() {
  const { userId } = useTerminalAuth();
  const { getEligibleOperators, assignOrder } = useTerminalJurisdiction();
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchConfig = useCallback(async (): Promise<AutoAssignmentConfig | null> => {
    const { data } = await supabase
      .from('terminal_auto_assignment_config')
      .select('*')
      .limit(1)
      .single();
    return data as AutoAssignmentConfig | null;
  }, []);

  const updateConfig = useCallback(async (updates: Partial<AutoAssignmentConfig>) => {
    const { data: existing } = await supabase
      .from('terminal_auto_assignment_config')
      .select('id')
      .limit(1)
      .single();

    if (!existing) return;

    const { error } = await supabase
      .from('terminal_auto_assignment_config')
      .update({ ...updates, updated_by: userId, updated_at: new Date().toISOString() })
      .eq('id', existing.id);

    if (error) throw error;
  }, [userId]);

  const autoAssignOrder = useCallback(async (
    orderNumber: string,
    tradeType: string,
    totalPrice: number,
    asset: string
  ): Promise<{ assigned: boolean; assignedTo?: string; reason?: string }> => {
    try {
      const config = await fetchConfig();
      if (!config?.is_enabled) {
        return { assigned: false, reason: 'Auto-assignment disabled' };
      }

      const operators = await getEligibleOperators();
      if (operators.length === 0) {
        return { assigned: false, reason: 'No eligible operators' };
      }

      // Filter by specialization
      let eligible = [...operators];
      if (config.consider_specialization) {
        const spec = tradeType === 'BUY' ? 'purchase' : 'sales';
        eligible = eligible.filter(op => op.specialization === 'both' || op.specialization === spec);
      }

      // Filter by max workload
      eligible = eligible.filter(op => op.activeOrderCount < config.max_orders_per_operator);

      if (eligible.length === 0) {
        return { assigned: false, reason: 'All eligible operators at max capacity' };
      }

      // Strategy: least_workload (already sorted) or round_robin
      let selected = eligible[0]; // least workload is default sort

      if (config.assignment_strategy === 'round_robin') {
        // Get last assigned operator from logs
        const { data: lastLog } = await supabase
          .from('terminal_auto_assignment_log')
          .select('assigned_to')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (lastLog) {
          const lastIdx = eligible.findIndex(op => op.userId === lastLog.assigned_to);
          const nextIdx = (lastIdx + 1) % eligible.length;
          selected = eligible[nextIdx];
        }
      }

      // Assign the order
      await assignOrder(orderNumber, selected.userId, tradeType, totalPrice, asset);

      // Log the auto-assignment
      await supabase.from('terminal_auto_assignment_log').insert({
        order_number: orderNumber,
        assigned_to: selected.userId,
        strategy_used: config.assignment_strategy,
        eligible_count: eligible.length,
        reason: `Auto-assigned via ${config.assignment_strategy}`,
      });

      return { assigned: true, assignedTo: selected.userId };
    } catch (err: any) {
      console.error('Auto-assignment error:', err);
      return { assigned: false, reason: err.message };
    }
  }, [fetchConfig, getEligibleOperators, assignOrder]);

  const bulkAutoAssign = useCallback(async (
    orders: Array<{ orderNumber: string; tradeType: string; totalPrice: number; asset: string }>
  ) => {
    setIsProcessing(true);
    let assigned = 0;
    let failed = 0;

    for (const order of orders) {
      const result = await autoAssignOrder(order.orderNumber, order.tradeType, order.totalPrice, order.asset);
      if (result.assigned) assigned++;
      else failed++;
    }

    setIsProcessing(false);
    toast.success(`Auto-assigned ${assigned} orders${failed > 0 ? `, ${failed} failed` : ''}`);
    return { assigned, failed };
  }, [autoAssignOrder]);

  return {
    fetchConfig,
    updateConfig,
    autoAssignOrder,
    bulkAutoAssign,
    isProcessing,
  };
}
