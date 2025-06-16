
export interface PurchasePaymentMethod {
  id: string;
  type: "UPI" | "Bank Transfer";
  bank_account_id: string;
  bank_accounts?: {
    account_name: string;
    bank_name: string;
    account_number: string;
    balance: number;
  };
  payment_limit: number;
  frequency: "24 hours" | "Daily" | "48 hours" | "Custom";
  custom_frequency?: string;
  current_usage: number;
  last_reset: string;
  is_active: boolean;
}

export interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string;
  IFSC: string;
  balance: number;
  status: string;
}

export interface PurchaseMethodFormData {
  type: "UPI" | "Bank Transfer";
  bank_account_id: string;
  payment_limit: string;
  frequency: "24 hours" | "Daily" | "48 hours" | "Custom";
  custom_frequency: string;
  is_active: boolean;
}
