import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  actionType: string;
  actionLabel: string;
  recordedAt: string;
  formattedTime: string;
  metadata: Record<string, any>;
}

// Human-readable labels for action types
const ACTION_LABELS: Record<string, string> = {
  // Purchase
  'purchase.order_created': 'Order Created',
  'purchase.banking_collected': 'Banking Details Collected',
  'purchase.pan_collected': 'PAN/TDS Details Collected',
  'purchase.added_to_bank': 'Added to Bank',
  'purchase.payment_recorded': 'Payment Recorded',
  'purchase.order_completed': 'Order Completed',
  'purchase.order_cancelled': 'Order Cancelled',
  'purchase.order_edited': 'Order Edited',
  'purchase.manual_entry_created': 'Manual Entry Created',
  
  // Sales
  'sales.order_created': 'Sale Created',
  'sales.order_completed': 'Sale Completed',
  'sales.order_cancelled': 'Sale Cancelled',
  'sales.order_edited': 'Sale Edited',
  'sales.manual_entry_created': 'Manual Entry Created',
  
  // Stock
  'stock.adjustment_created': 'Stock Adjustment Created',
  'stock.transfer_created': 'Stock Transfer Created',
  'stock.wallet_adjusted': 'Wallet Adjusted',
  'stock.wallet_edited': 'Wallet Edited',
  'stock.product_created': 'Product Created',
  
  // Clients
  'client.created': 'Client Created',
  'client.updated': 'Client Updated',
  'client.kyc_approved': 'KYC Approved',
  'client.kyc_rejected': 'KYC Rejected',
  'client.seller_approved': 'Seller Approved',
  'client.seller_rejected': 'Seller Rejected',
  'client.buyer_approved': 'Buyer Approved',
  'client.buyer_rejected': 'Buyer Rejected',
  
  // Banking
  'bank.transaction_created': 'Transaction Created',
  'bank.transfer_completed': 'Transfer Completed',
  'bank.account_created': 'Account Created',
  'bank.account_closed': 'Account Closed',
  'bank.balance_adjusted': 'Balance Adjusted',
  
  // User Management
  'user.created': 'User Created',
  'user.updated': 'User Updated',
  'user.role_assigned': 'Role Assigned',
  'user.password_reset': 'Password Reset',
  'user.status_changed': 'Status Changed',
  'user.approved': 'User Approved',
  'user.rejected': 'User Rejected',
  
  // Other
  'expense.created': 'Expense Created',
  'employee.onboarded': 'Employee Onboarded',
  'employee.offboarded': 'Employee Offboarded',
};

function getActionLabel(actionType: string): string {
  return ACTION_LABELS[actionType] || actionType.replace(/\./g, ' ').replace(/_/g, ' ');
}

export function useActivityTimeline(entityId: string | undefined, entityType?: string) {
  return useQuery({
    queryKey: ['activity_timeline', entityId, entityType],
    queryFn: async (): Promise<ActivityLog[]> => {
      if (!entityId) return [];

      // Fetch logs with user details
      const { data: logs, error } = await supabase
        .from('system_action_logs')
        .select(`
          id,
          user_id,
          action_type,
          recorded_at,
          metadata
        `)
        .eq('entity_id', entityId)
        .order('recorded_at', { ascending: true });

      if (error) {
        console.error('[useActivityTimeline] Error fetching logs:', error);
        throw error;
      }

      if (!logs || logs.length === 0) return [];

      // Get unique user IDs
      const userIds = [...new Set(logs.map(log => log.user_id))];

      // Fetch user details
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, username, first_name, last_name')
        .in('id', userIds);

      if (usersError) {
        console.error('[useActivityTimeline] Error fetching users:', usersError);
      }

      // Create user map
      const userMap: Record<string, string> = {};
      users?.forEach(user => {
        const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
        userMap[user.id] = fullName || user.username || 'Unknown User';
      });

      // Transform logs
      return logs.map(log => ({
        id: log.id,
        userId: log.user_id,
        userName: userMap[log.user_id] || 'Unknown User',
        actionType: log.action_type,
        actionLabel: getActionLabel(log.action_type),
        recordedAt: log.recorded_at,
        formattedTime: format(new Date(log.recorded_at), 'dd MMM yyyy, HH:mm'),
        metadata: (log.metadata as Record<string, any>) || {},
      }));
    },
    enabled: !!entityId,
    staleTime: 30000, // 30 seconds
  });
}
