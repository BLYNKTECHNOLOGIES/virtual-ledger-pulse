export type BuyOrderStatus = 
  | 'new'
  | 'banking_collected'
  | 'pan_collected'
  | 'added_to_bank'
  | 'paid'
  | 'completed'
  | 'cancelled';

export type PanType = 'pan_provided' | 'pan_not_provided' | 'non_tds';

export interface BuyOrder {
  id: string;
  order_number: string;
  total_amount: number;
  supplier_name: string | null;
  contact_number: string | null;
  pan_number: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  ifsc_code: string | null;
  upi_id: string | null;
  payment_method_type: string | null;
  status: string;
  order_status: BuyOrderStatus;
  notes: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  order_date?: string;
  timer_end_at: string | null;
  order_expires_at: string | null;
  pan_type?: PanType | null;
  total_paid: number;
  tds_applied: boolean;
  tds_amount: number;
  net_payable_amount: number;
  is_safe_fund: boolean;
  is_off_market: boolean;
  fee_percentage: number;
  fee_amount: number;
  net_amount: number;
  quantity: number;
  price_per_unit: number;
  payment_proof_url: string | null;
  product_name: string | null;
  warehouse_name: string | null;
  bank_account_id: string | null;
  // Joined relations
  purchase_payment_method?: any;
  purchase_order_items?: any[];
  created_by_user?: any;
}

export interface OrderPayment {
  id: string;
  order_id: string;
  amount_paid: number;
  screenshot_url: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

// Default order expiry time in minutes
export const DEFAULT_ORDER_EXPIRY_MINUTES = 55;

export interface BuyOrderStatusHistory {
  id: string;
  order_id: string;
  old_status: BuyOrderStatus | null;
  new_status: BuyOrderStatus;
  changed_by: string | null;
  changed_at: string;
  notes: string | null;
}

// Common Indian banks for dropdown
export const COMMON_BANKS = [
  'State Bank of India',
  'HDFC Bank',
  'ICICI Bank',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'Punjab National Bank',
  'Bank of Baroda',
  'Canara Bank',
  'Union Bank of India',
  'Bank of India',
  'Indian Bank',
  'Central Bank of India',
  'IDBI Bank',
  'Yes Bank',
  'IndusInd Bank',
  'Federal Bank',
  'IDFC First Bank',
  'RBL Bank',
  'South Indian Bank',
  'Karur Vysya Bank',
  'Other',
] as const;

export const BUY_ORDER_STATUS_CONFIG: Record<BuyOrderStatus, {
  label: string;
  color: string;
  bgColor: string;
  nextStatus: BuyOrderStatus | null;
  icon: string;
}> = {
  new: {
    label: 'New',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    nextStatus: 'banking_collected',
    icon: '📋',
  },
  banking_collected: {
    label: 'Banking Collected',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    nextStatus: 'pan_collected',
    icon: '🏦',
  },
  pan_collected: {
    label: 'PAN Collected',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
    nextStatus: 'added_to_bank',
    icon: '📄',
  },
  added_to_bank: {
    label: 'Added to Bank',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    nextStatus: 'paid',
    icon: '➕',
  },
  paid: {
    label: 'Paid',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100',
    nextStatus: 'completed',
    icon: '💰',
  },
  completed: {
    label: 'Completed',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    nextStatus: null,
    icon: '✅',
  },
  cancelled: {
    label: 'Cancelled',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    nextStatus: null,
    icon: '❌',
  },
};

export const STATUS_ORDER: BuyOrderStatus[] = [
  'new',
  'banking_collected',
  'pan_collected',
  'added_to_bank',
  'paid',
  'completed',
];

// Calculate payout amounts based on PAN type
export function calculatePayout(amount: number, panType: PanType): {
  deduction: number;
  deductionPercent: number;
  payout: number;
} {
  switch (panType) {
    case 'pan_provided':
      const deduction1 = amount * 0.01;
      return { deduction: deduction1, deductionPercent: 1, payout: amount - deduction1 };
    case 'pan_not_provided':
      const deduction20 = amount * 0.20;
      return { deduction: deduction20, deductionPercent: 20, payout: amount - deduction20 };
    case 'non_tds':
      return { deduction: 0, deductionPercent: 0, payout: amount };
    default:
      return { deduction: 0, deductionPercent: 0, payout: amount };
  }
}
