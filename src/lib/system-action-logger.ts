import { supabase } from "@/integrations/supabase/client";

// Action type definitions organized by module
export const ActionTypes = {
  // Purchase Module
  PURCHASE_ORDER_CREATED: 'purchase.order_created',
  PURCHASE_BANKING_COLLECTED: 'purchase.banking_collected',
  PURCHASE_PAN_COLLECTED: 'purchase.pan_collected',
  PURCHASE_ADDED_TO_BANK: 'purchase.added_to_bank',
  PURCHASE_PAYMENT_RECORDED: 'purchase.payment_recorded',
  PURCHASE_ORDER_COMPLETED: 'purchase.order_completed',
  PURCHASE_ORDER_CANCELLED: 'purchase.order_cancelled',
  PURCHASE_ORDER_EDITED: 'purchase.order_edited',
  PURCHASE_MANUAL_ENTRY_CREATED: 'purchase.manual_entry_created',
  
  // Sales Module
  SALES_ORDER_CREATED: 'sales.order_created',
  SALES_ORDER_COMPLETED: 'sales.order_completed',
  SALES_ORDER_CANCELLED: 'sales.order_cancelled',
  SALES_ORDER_EDITED: 'sales.order_edited',
  SALES_MANUAL_ENTRY_CREATED: 'sales.manual_entry_created',
  
  // Stock Module
  STOCK_ADJUSTMENT_CREATED: 'stock.adjustment_created',
  STOCK_TRANSFER_CREATED: 'stock.transfer_created',
  STOCK_WALLET_ADJUSTED: 'stock.wallet_adjusted',
  STOCK_WALLET_EDITED: 'stock.wallet_edited',
  STOCK_PRODUCT_CREATED: 'stock.product_created',
  
  // Clients Module
  CLIENT_CREATED: 'client.created',
  CLIENT_UPDATED: 'client.updated',
  CLIENT_KYC_APPROVED: 'client.kyc_approved',
  CLIENT_KYC_REJECTED: 'client.kyc_rejected',
  CLIENT_SELLER_APPROVED: 'client.seller_approved',
  CLIENT_SELLER_REJECTED: 'client.seller_rejected',
  CLIENT_BUYER_APPROVED: 'client.buyer_approved',
  CLIENT_BUYER_REJECTED: 'client.buyer_rejected',
  
  // Banking (BAMS) Module
  BANK_TRANSACTION_CREATED: 'bank.transaction_created',
  BANK_TRANSFER_COMPLETED: 'bank.transfer_completed',
  BANK_ACCOUNT_CREATED: 'bank.account_created',
  BANK_ACCOUNT_CLOSED: 'bank.account_closed',
  BANK_ACCOUNT_DORMANT: 'bank.account_dormant',
  BANK_ACCOUNT_REACTIVATED: 'bank.account_reactivated',
  BANK_BALANCE_ADJUSTED: 'bank.balance_adjusted',
  
  // User Management
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_ROLE_ASSIGNED: 'user.role_assigned',
  USER_PASSWORD_RESET: 'user.password_reset',
  USER_STATUS_CHANGED: 'user.status_changed',
  USER_APPROVED: 'user.approved',
  USER_REJECTED: 'user.rejected',
  
  // Expenses
  EXPENSE_CREATED: 'expense.created',
  
  // Employee
  EMPLOYEE_ONBOARDED: 'employee.onboarded',
  EMPLOYEE_OFFBOARDED: 'employee.offboarded',
} as const;

export type ActionType = typeof ActionTypes[keyof typeof ActionTypes];

// Entity type definitions
export const EntityTypes = {
  PURCHASE_ORDER: 'purchase_order',
  SALES_ORDER: 'sales_order',
  STOCK_TRANSACTION: 'stock_transaction',
  STOCK_TRANSFER: 'stock_transfer',
  STOCK_ADJUSTMENT: 'stock_adjustment',
  WALLET: 'wallet',
  PRODUCT: 'product',
  CLIENT: 'client',
  CLIENT_ONBOARDING: 'client_onboarding',
  BANK_ACCOUNT: 'bank_account',
  BANK_TRANSACTION: 'bank_transaction',
  USER: 'user',
  EXPENSE: 'expense',
  EMPLOYEE: 'employee',
} as const;

export type EntityType = typeof EntityTypes[keyof typeof EntityTypes];

// Module definitions
export const Modules = {
  PURCHASE: 'purchase',
  SALES: 'sales',
  STOCK: 'stock',
  CLIENTS: 'clients',
  BAMS: 'bams',
  USER_MANAGEMENT: 'user_management',
  EXPENSES: 'expenses',
  HRMS: 'hrms',
} as const;

export type Module = typeof Modules[keyof typeof Modules];

interface LogActionParams {
  userId: string;
  actionType: ActionType | string;
  entityType: EntityType | string;
  entityId: string;
  module: Module | string;
  metadata?: Record<string, any>;
}

/**
 * Logs an action to the system_action_logs table.
 * 
 * Key behaviors:
 * - Idempotent: Uses upsert with ignoreDuplicates to prevent duplicate logs
 * - Non-blocking: Errors are logged but don't throw
 * - Server-side timestamp: Uses current timestamp at execution time
 * 
 * @param params - The action parameters to log
 */
export async function logAction(params: LogActionParams): Promise<void> {
  const { userId, actionType, entityType, entityId, module, metadata } = params;

  // Validate required fields
  if (!userId || !actionType || !entityType || !entityId || !module) {
    console.warn('[SystemActionLogger] Missing required fields, skipping log:', {
      hasUserId: !!userId,
      hasActionType: !!actionType,
      hasEntityType: !!entityType,
      hasEntityId: !!entityId,
      hasModule: !!module,
    });
    return;
  }

  try {
    const { error } = await supabase
      .from('system_action_logs')
      .upsert(
        {
          user_id: userId,
          action_type: actionType,
          entity_type: entityType,
          entity_id: entityId,
          module: module,
          recorded_at: new Date().toISOString(),
          metadata: metadata || {},
        },
        {
          onConflict: 'entity_id,action_type',
          ignoreDuplicates: true,
        }
      );

    if (error) {
      console.error('[SystemActionLogger] Failed to log action:', error);
    }
  } catch (err) {
    // Non-blocking: Log error but don't throw
    console.error('[SystemActionLogger] Exception while logging action:', err);
  }
}

/**
 * Helper to get current user ID from localStorage session.
 * The session structure is: { user: { id, username, ... }, timestamp, expiresIn }
 * This function extracts user.id as the source of truth for action attribution.
 */
export function getCurrentUserId(): string | null {
  try {
    const sessionStr = localStorage.getItem('userSession');
    if (sessionStr) {
      const session = JSON.parse(sessionStr);
      // Session structure: { user: { id, username, ... }, timestamp, expiresIn }
      const userId = session?.user?.id || session?.id || null;
      
      // Some deployments use non-UUID user ids (e.g., text ids). For action attribution we
      // accept any non-empty string except demo-admin-id.
      if (typeof userId === 'string' && userId.trim() && userId !== 'demo-admin-id') {
        // Keep a soft validation warning for diagnostics, but don't block.
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
        if (!isUuid) {
          console.warn('[SystemActionLogger] Non-UUID user id detected (allowed):', userId);
        }
        return userId;
      }

      if (userId === 'demo-admin-id') {
        console.warn('[SystemActionLogger] Demo admin detected - user ID not valid for production tracking');
        return null;
      }
    }
  } catch (err) {
    console.error('[SystemActionLogger] Failed to get current user ID:', err);
  }
  return null;
}

/**
 * Convenience function that auto-resolves the current user ID
 */
export async function logActionWithCurrentUser(
  params: Omit<LogActionParams, 'userId'>
): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) {
    console.warn('[SystemActionLogger] No user session found, skipping log');
    return;
  }
  await logAction({ ...params, userId });
}
