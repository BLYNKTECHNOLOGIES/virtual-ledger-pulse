import { BuyOrder, PanType } from './buy-order-types';
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
    panCollected: hasPanDetails(order),
  };
}

// Check what fields are missing for a status transition
export function getMissingFieldsForStatus(
  order: BuyOrder,
  targetStatus: string
): { type: 'banking' | 'pan' | 'timer' | null; fields: string[] } {
  if (targetStatus === 'banking_collected') {
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
    // If PAN number already provided (during creation), skip PAN collection
    if (order.pan_number) {
      return { type: null, fields: [] };
    }
    // Otherwise show dialog for TDS options
    return { type: 'pan', fields: ['pan_number'] };
  }

  // For added_to_bank, we need to set a timer
  if (targetStatus === 'added_to_bank') {
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
