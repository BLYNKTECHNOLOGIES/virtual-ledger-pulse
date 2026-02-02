import { BuyOrder, BuyOrderStatus, PanType, STATUS_ORDER } from './buy-order-types';
import { parsePanTypeFromNotes } from './pan-notes';

// Check if banking details are collected
export function hasBankingDetails(order: BuyOrder): boolean {
  if (order.payment_method_type === 'UPI') {
    return !!order.upi_id;
  }
  return !!(order.bank_account_name && order.bank_account_number && order.ifsc_code);
}

// Check if PAN is collected (pan_number exists means 1% TDS is applicable)
export function hasPanDetails(order: BuyOrder): boolean {
  return !!order.pan_number;
}

// Check if TDS type is already determined (either by PAN or by notes)
export function hasTdsTypeSelected(order: BuyOrder): boolean {
  // PAN number provided = 1% TDS
  if (order.pan_number) return true;
  // Check if notes contain TDS type marker
  const panType = parsePanTypeFromNotes(order.notes);
  return panType !== null;
}

// Get effective PAN type based on order data
// If pan_number exists, it's always pan_provided (1% TDS) - cannot be changed
// Otherwise, parse from notes or return null
export function getEffectivePanType(order: BuyOrder): PanType | null {
  // If PAN number is provided, TDS is locked to 1%
  if (order.pan_number) {
    return 'pan_provided';
  }
  // Otherwise check notes for TDS type
  return parsePanTypeFromNotes(order.notes);
}

// Get the effective status based on collected data
// This determines which steps should show as "completed" even if status hasn't progressed
export function getEffectiveCompletedSteps(order: BuyOrder): {
  bankingCollected: boolean;
  panCollected: boolean;
} {
  return {
    bankingCollected: hasBankingDetails(order),
    panCollected: hasTdsTypeSelected(order),
  };
}

// Check what fields are missing for a status transition
// IMPORTANT: This function respects the state progression guard.
// Once an order is in 'added_to_bank' or later, PAN collection should NOT
// return a 'timer' type which would re-trigger the Add to Bank flow.
export function getMissingFieldsForStatus(
  order: BuyOrder,
  targetStatus: string
): { type: 'banking' | 'pan' | 'timer' | null; fields: string[] } {
  const currentStatusIndex = STATUS_ORDER.indexOf(order.order_status as BuyOrderStatus);
  const addedToBankIndex = STATUS_ORDER.indexOf('added_to_bank');
  
  // STATE GUARD: If order is already at 'added_to_bank' or beyond,
  // do NOT return timer type for any subsequent data collection.
  // This prevents workflow regression.
  const isAtOrPastAddedToBank = currentStatusIndex >= addedToBankIndex;

  if (targetStatus === 'banking_collected') {
    // If banking details already provided, skip this step entirely
    if (hasBankingDetails(order)) {
      return { type: null, fields: [] };
    }
    if (order.payment_method_type === 'UPI') {
      if (!order.upi_id) {
        return { type: 'banking', fields: ['upi_id'] };
      }
    } else {
      const missing: string[] = [];
      if (!order.bank_account_name) missing.push('bank_name');
      if (!order.bank_account_number) missing.push('account_number');
      if (!order.ifsc_code) missing.push('ifsc_code');
      if (missing.length > 0) {
        return { type: 'banking', fields: missing };
      }
    }
  }

  if (targetStatus === 'pan_collected') {
    // If TDS type already selected (by PAN or notes marker), skip this step
    if (hasTdsTypeSelected(order)) {
      return { type: null, fields: [] };
    }
    // Otherwise show dialog for TDS options
    return { type: 'pan', fields: ['pan_number'] };
  }

  // For added_to_bank, we need to set a timer
  // BUT: Only if we're not already at or past 'added_to_bank'
  if (targetStatus === 'added_to_bank') {
    // If already at or past added_to_bank, don't show timer dialog again
    if (isAtOrPastAddedToBank) {
      return { type: null, fields: [] };
    }
    return { type: 'timer', fields: [] };
  }

  return { type: null, fields: [] };
}

// Validate IFSC code format: exactly 11 alphanumeric characters
export function validateIFSC(ifsc: string): boolean {
  const ifscRegex = /^[A-Z0-9]{11}$/;
  return ifscRegex.test(ifsc);
}

// Validate phone number: exactly 10 digits
export function validatePhone(phone: string): boolean {
  const phoneRegex = /^[0-9]{10}$/;
  return phoneRegex.test(phone);
}

// Format phone number input: only allow 10 digits
export function formatPhoneInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 10);
}

// Format IFSC input: 11 alphanumeric characters (uppercase)
export function formatIFSCInput(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
}
