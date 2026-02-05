
# Multiple Bank Payments in Manual Purchase Entry

## Summary
Add a "Multiple Payments" checkbox to the Manual Purchase Entry dialog that, when enabled, allows distributing the total payable amount across multiple bank accounts within a single purchase order.

---

## Current State
- Manual Purchase Entry accepts a single `deduction_bank_account_id`
- Payment deduction is handled atomically via the `create_manual_purchase_complete_v2` RPC
- The RPC validates bank balance and creates one `EXPENSE` bank transaction
- `purchase_order_payments` table exists (used for workflow payments) but lacks `bank_account_id` column

---

## Implementation Plan

### 1. Database Changes

**New table: `purchase_order_payment_splits`**
```text
┌────────────────────────────────────────────────┐
│  purchase_order_payment_splits                 │
├────────────────────────────────────────────────┤
│  id               UUID (PK)                    │
│  purchase_order_id UUID (FK -> purchase_orders)│
│  bank_account_id  UUID (FK -> bank_accounts)   │
│  amount           NUMERIC NOT NULL             │
│  created_at       TIMESTAMPTZ                  │
│  created_by       UUID                         │
└────────────────────────────────────────────────┘
```

**New RPC: `create_manual_purchase_with_split_payments`**
- Accepts existing parameters plus a JSONB array: `p_payment_splits`
- Each split item: `{ bank_account_id: UUID, amount: NUMERIC }`
- Validates:
  - Sum of split amounts equals net payable amount (after TDS)
  - Each bank account has sufficient balance
- For each split:
  - Inserts an `EXPENSE` record in `bank_transactions`
  - Inserts a record in `purchase_order_payment_splits`
- Returns the same JSON response structure

### 2. UI Changes (ManualPurchaseEntryDialog.tsx)

**New State Variables:**
```typescript
const [isMultiplePayments, setIsMultiplePayments] = useState(false);
const [paymentSplits, setPaymentSplits] = useState<Array<{
  bank_account_id: string;
  amount: string;
}>>([{ bank_account_id: '', amount: '' }]);
```

**Checkbox Addition:**
- Place above the Bank Account field in the "Wallet and Bank Account" row
- Label: "Multiple Payments"
- Small, unobtrusive styling

**Conditional Rendering Logic:**
- When unchecked: Show current single bank account dropdown (no change)
- When checked:
  - Hide single bank dropdown
  - Show dynamic payment rows with:
    - Amount input field
    - Bank Account dropdown (active accounts only)
    - Plus (+) button to add row
    - Minus (-) button to remove row (min 1 row)

**Real-Time Validation Display:**
```text
┌─────────────────────────────────────────────────────────┐
│  Net Payable: ₹50,000.00                                │
│  Allocated: ₹45,000.00                                  │
│  Remaining: ₹5,000.00 (must be ₹0.00 to submit)         │
└─────────────────────────────────────────────────────────┘
```
- Green checkmark when sum matches exactly
- Error styling when mismatch

### 3. Submission Logic

**Validation:**
```typescript
if (isMultiplePayments) {
  const totalAllocated = paymentSplits.reduce((sum, s) => 
    sum + (parseFloat(s.amount) || 0), 0);
  
  if (Math.abs(totalAllocated - netPayable) > 0.01) {
    // Block submission with toast
  }
  
  // Validate all rows have bank selected
  // Validate no duplicate banks (optional)
}
```

**RPC Call Decision:**
```typescript
if (isMultiplePayments && paymentSplits.length > 1) {
  // Call new RPC: create_manual_purchase_with_split_payments
} else {
  // Call existing RPC: create_manual_purchase_complete_v2
}
```

### 4. Transaction Summary Update

When multiple payments enabled, the Transaction Summary card will show:
```text
┌─────────────────────────────────────────────────────────┐
│  Transaction Summary                                    │
├─────────────────────────────────────────────────────────┤
│  Order Amount:           ₹50,000.00                     │
│  TDS Deducted (1%):      -₹500.00                       │
│  Bank Deductions:                                       │
│    • ICICI Blynk:        -₹30,000.00                    │
│    • HDFC Current:       -₹19,500.00                    │
│  ─────────────────────────────────────────────────      │
│  Total Bank Deduction:   -₹49,500.00                    │
└─────────────────────────────────────────────────────────┘
```

---

## Technical Details

### Database Migration SQL
```sql
-- Create split payments tracking table
CREATE TABLE public.purchase_order_payment_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.purchase_order_payment_splits ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Allow authenticated read" ON public.purchase_order_payment_splits
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert" ON public.purchase_order_payment_splits
  FOR INSERT TO authenticated WITH CHECK (true);

-- New RPC function
CREATE OR REPLACE FUNCTION public.create_manual_purchase_with_split_payments(
  -- Same params as v2...
  p_payment_splits JSONB  -- Array of {bank_account_id, amount}
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_split JSONB;
  v_bank_id UUID;
  v_split_amount NUMERIC;
  v_bank_balance NUMERIC;
  v_total_splits NUMERIC := 0;
  -- ... other vars from v2
BEGIN
  -- Validate total splits = net payable
  FOR v_split IN SELECT * FROM jsonb_array_elements(p_payment_splits) LOOP
    v_total_splits := v_total_splits + (v_split->>'amount')::NUMERIC;
  END LOOP;
  
  IF ABS(v_total_splits - v_net_payable_amount) > 0.01 THEN
    RAISE EXCEPTION 'Split payment total (%) does not match net payable (%)', 
      v_total_splits, v_net_payable_amount;
  END IF;

  -- Validate each bank has sufficient balance
  FOR v_split IN SELECT * FROM jsonb_array_elements(p_payment_splits) LOOP
    v_bank_id := (v_split->>'bank_account_id')::UUID;
    v_split_amount := (v_split->>'amount')::NUMERIC;
    
    SELECT balance INTO v_bank_balance 
    FROM bank_accounts WHERE id = v_bank_id AND status = 'ACTIVE';
    
    IF v_bank_balance < v_split_amount THEN
      RAISE EXCEPTION 'Insufficient balance in bank account';
    END IF;
  END LOOP;

  -- Create purchase order (same as v2)
  -- ...

  -- Create bank transactions for each split
  FOR v_split IN SELECT * FROM jsonb_array_elements(p_payment_splits) LOOP
    INSERT INTO bank_transactions (
      bank_account_id, transaction_type, amount, ...
    ) VALUES (
      (v_split->>'bank_account_id')::UUID, 'EXPENSE', 
      (v_split->>'amount')::NUMERIC, ...
    );
    
    INSERT INTO purchase_order_payment_splits (
      purchase_order_id, bank_account_id, amount, created_by
    ) VALUES (
      v_purchase_order_id, (v_split->>'bank_account_id')::UUID,
      (v_split->>'amount')::NUMERIC, p_created_by
    );
  END LOOP;

  -- Rest same as v2...
END;
$function$;
```

### Component Changes

**New imports needed:**
- `Plus`, `Minus` from lucide-react
- `Checkbox` from UI components

**Layout structure when multiple payments enabled:**
```typescript
{isMultiplePayments && (
  <div className="space-y-2">
    <div className="flex justify-between items-center">
      <Label>Payment Distribution *</Label>
      <div className="text-sm">
        {/* Validation status indicator */}
      </div>
    </div>
    
    {paymentSplits.map((split, index) => (
      <div key={index} className="flex gap-2 items-start">
        <Input 
          type="number"
          value={split.amount}
          placeholder="Amount"
          className="w-32"
        />
        <Select value={split.bank_account_id}>
          {/* Bank options */}
        </Select>
        <Button onClick={() => removeSplit(index)}>
          <Minus />
        </Button>
      </div>
    ))}
    
    <Button onClick={addSplit}>
      <Plus /> Add Bank
    </Button>
  </div>
)}
```

---

## Files to be Modified/Created

| File | Action |
|------|--------|
| `supabase/migrations/[timestamp]_split_payments.sql` | Create table + RPC |
| `src/integrations/supabase/types.ts` | Auto-updated |
| `src/components/purchase/ManualPurchaseEntryDialog.tsx` | Add checkbox, multi-row UI, validation |

---

## Constraints Honored
- No modification to purchase workflow or approval flow
- No changes to reporting structure
- Existing single-payment flow unchanged when checkbox unchecked
- All bank debits mapped to same purchase order ID
- No additional purchase orders created
