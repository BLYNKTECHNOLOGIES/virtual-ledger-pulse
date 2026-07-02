-- Shared master list of credit sub-ledgers (persons)
CREATE TABLE public.credit_sub_ledgers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Case-insensitive unique name
CREATE UNIQUE INDEX credit_sub_ledgers_name_lower_idx ON public.credit_sub_ledgers (lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_sub_ledgers TO authenticated;
GRANT ALL ON public.credit_sub_ledgers TO service_role;

ALTER TABLE public.credit_sub_ledgers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view sub-ledgers"
  ON public.credit_sub_ledgers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create sub-ledgers"
  ON public.credit_sub_ledgers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update sub-ledgers"
  ON public.credit_sub_ledgers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete non-system sub-ledgers"
  ON public.credit_sub_ledgers FOR DELETE TO authenticated USING (is_system = false);

-- updated_at trigger (reuse existing function if present)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_credit_sub_ledgers_updated_at
  BEFORE UPDATE ON public.credit_sub_ledgers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Protect the system "Unidentified" row from rename/delete
CREATE OR REPLACE FUNCTION public.protect_system_sub_ledger()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    IF OLD.is_system THEN
      RAISE EXCEPTION 'The system sub-ledger cannot be deleted';
    END IF;
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF OLD.is_system AND (NEW.name <> OLD.name OR NEW.is_system = false) THEN
      RAISE EXCEPTION 'The system sub-ledger cannot be renamed or unmarked';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER protect_system_sub_ledger_trg
  BEFORE UPDATE OR DELETE ON public.credit_sub_ledgers
  FOR EACH ROW EXECUTE FUNCTION public.protect_system_sub_ledger();

-- Seed the Unidentified system sub-ledger
INSERT INTO public.credit_sub_ledgers (name, is_system, notes)
VALUES ('Unidentified', true, 'System sub-ledger holding legacy/unassigned credit balance');

-- Link bank transactions to a sub-ledger (nullable; only meaningful for CREDIT accounts)
ALTER TABLE public.bank_transactions
  ADD COLUMN sub_ledger_id uuid REFERENCES public.credit_sub_ledgers(id);

CREATE INDEX bank_transactions_sub_ledger_id_idx ON public.bank_transactions (sub_ledger_id);