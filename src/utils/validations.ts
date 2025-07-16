
import { supabase } from "@/integrations/supabase/client";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export async function validateBankAccountBalance(bankAccountId: string, debitAmount: number): Promise<void> {
  const { data: bankAccount, error } = await supabase
    .from('bank_accounts')
    .select('balance, account_name')
    .eq('id', bankAccountId)
    .single();

  if (error) throw error;

  if (bankAccount.balance < debitAmount) {
    throw new ValidationError(`Bank account balance cannot be negative. Available: ₹${bankAccount.balance.toFixed(2)}, Required: ₹${debitAmount.toFixed(2)} in account: ${bankAccount.account_name}`);
  }
}

export async function validatePaymentLimit(paymentMethodId: string, amount: number): Promise<void> {
  const { data: paymentMethod, error } = await supabase
    .from('purchase_payment_methods')
    .select('current_usage, payment_limit, bank_account_name')
    .eq('id', paymentMethodId)
    .single();

  if (error) throw error;

  const newUsage = (paymentMethod.current_usage || 0) + amount;
  
  if (newUsage > paymentMethod.payment_limit) {
    throw new ValidationError(`Payment limit cannot be exceeded. Current usage: ₹${paymentMethod.current_usage?.toFixed(2) || '0.00'}, Limit: ₹${paymentMethod.payment_limit.toFixed(2)}, Attempted: ₹${amount.toFixed(2)} for ${paymentMethod.bank_account_name}`);
  }
}

export async function validateProductStock(productId: string, warehouseId: string, requiredQuantity: number): Promise<void> {
  // Get current stock from warehouse movements
  const { data: movements, error } = await supabase
    .from('warehouse_stock_movements')
    .select('movement_type, quantity, products(name, code)')
    .eq('product_id', productId)
    .eq('warehouse_id', warehouseId);

  if (error) throw error;

  let currentStock = 0;
  movements?.forEach(movement => {
    if (movement.movement_type === 'IN' || movement.movement_type === 'ADJUSTMENT') {
      currentStock += movement.quantity;
    } else if (movement.movement_type === 'OUT' || movement.movement_type === 'TRANSFER') {
      currentStock -= movement.quantity;
    }
  });

  if (currentStock < requiredQuantity) {
    const productName = movements?.[0]?.products?.name || 'Unknown Product';
    throw new ValidationError(`Stock quantity cannot be negative. Available: ${currentStock}, Required: ${requiredQuantity} for product: ${productName}`);
  }
}

export async function validatePaymentMethodUsage(paymentMethodId: string, amount: number): Promise<void> {
  const { data: paymentMethod, error } = await supabase
    .from('purchase_payment_methods')
    .select('current_usage, payment_limit, bank_account_name')
    .eq('id', paymentMethodId)
    .single();

  if (error) throw error;

  const newUsage = (paymentMethod.current_usage || 0) + amount;
  
  if (newUsage > paymentMethod.payment_limit) {
    throw new ValidationError(`Payment method limit exceeded. Current usage: ₹${paymentMethod.current_usage?.toFixed(2) || '0.00'}, Limit: ₹${paymentMethod.payment_limit.toFixed(2)}, Attempted: ₹${amount.toFixed(2)} for ${paymentMethod.bank_account_name}`);
  }
}
