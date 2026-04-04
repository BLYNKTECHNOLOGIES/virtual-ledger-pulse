CREATE OR REPLACE FUNCTION public.create_pending_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  payment_method_data RECORD;
  v_old_is_gateway BOOLEAN := false;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.sales_payment_method_id IS NOT NULL 
     AND OLD.sales_payment_method_id IS DISTINCT FROM NEW.sales_payment_method_id THEN
    SELECT COALESCE(payment_gateway, false)
    INTO v_old_is_gateway
    FROM sales_payment_methods
    WHERE id = OLD.sales_payment_method_id;

    IF v_old_is_gateway THEN
      DELETE FROM public.pending_settlements WHERE sales_order_id = NEW.id;
    END IF;
  END IF;

  IF NEW.payment_status = 'COMPLETED' AND NEW.settlement_status = 'PENDING' 
     AND NEW.sales_payment_method_id IS NOT NULL THEN

    SELECT 
      spm.id,
      spm.payment_gateway,
      spm.settlement_cycle,
      spm.settlement_days,
      spm.bank_account_id,
      ba.account_name,
      ba.bank_name
    INTO payment_method_data
    FROM sales_payment_methods spm
    LEFT JOIN bank_accounts ba ON spm.bank_account_id = ba.id
    WHERE spm.id = NEW.sales_payment_method_id;

    IF payment_method_data.payment_gateway = true THEN
      INSERT INTO public.pending_settlements (
        sales_order_id, order_number, client_name, total_amount,
        settlement_amount, order_date, payment_method_id, bank_account_id,
        settlement_cycle, settlement_days, expected_settlement_date, status, created_at
      ) VALUES (
        NEW.id, NEW.order_number, NEW.client_name, NEW.total_amount,
        NEW.total_amount, NEW.order_date::date, NEW.sales_payment_method_id,
        payment_method_data.bank_account_id,
        COALESCE(payment_method_data.settlement_cycle, 'T+1 Day'),
        payment_method_data.settlement_days,
        CASE 
          WHEN payment_method_data.settlement_days > 0 THEN 
            (NEW.order_date::date + INTERVAL '1 day' * payment_method_data.settlement_days)::date
          ELSE 
            (NEW.order_date::date + INTERVAL '1 day')::date
        END,
        'PENDING', now()
      )
      ON CONFLICT (sales_order_id, payment_method_id) DO UPDATE SET
        bank_account_id = EXCLUDED.bank_account_id,
        total_amount = EXCLUDED.total_amount,
        settlement_amount = EXCLUDED.settlement_amount,
        settlement_cycle = EXCLUDED.settlement_cycle,
        settlement_days = EXCLUDED.settlement_days,
        expected_settlement_date = EXCLUDED.expected_settlement_date,
        updated_at = now();
    ELSE
      DELETE FROM public.pending_settlements WHERE sales_order_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;