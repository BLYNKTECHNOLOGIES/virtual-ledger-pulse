CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission public.app_permission)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = _user_id
      AND rp.permission = _permission
  )
$$;

ALTER TABLE public.account_investigations
ADD COLUMN IF NOT EXISTS bank_case_id uuid REFERENCES public.bank_cases(id) ON DELETE SET NULL;

UPDATE public.account_investigations ai
SET bank_case_id = bc.id
FROM public.bank_cases bc
WHERE ai.bank_case_id IS NULL
  AND ai.bank_account_id = bc.bank_account_id
  AND bc.created_at >= ai.created_at - interval '1 day'
  AND bc.created_at <= ai.created_at + interval '1 day';

UPDATE public.account_investigations
SET status = CASE
  WHEN status = 'ACTIVE' THEN 'OPEN'
  WHEN status = 'COMPLETED' THEN 'RESOLVED'
  ELSE status
END
WHERE status IN ('ACTIVE', 'COMPLETED');

CREATE OR REPLACE FUNCTION public.sync_bank_case_investigation_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case_status text;
  v_investigation_status text;
BEGIN
  IF NEW.bank_case_id IS NULL OR NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT CASE NEW.status
    WHEN 'OPEN' THEN 'OPEN'
    WHEN 'UNDER_INVESTIGATION' THEN 'OPEN'
    WHEN 'PENDING_APPROVAL' THEN 'OPEN'
    WHEN 'RESOLVED' THEN 'RESOLVED'
    WHEN 'CLOSED' THEN 'CLOSED'
    ELSE NEW.status
  END INTO v_case_status;

  SELECT CASE NEW.status
    WHEN 'OPEN' THEN 'UNDER_INVESTIGATION'
    WHEN 'UNDER_INVESTIGATION' THEN 'UNDER_INVESTIGATION'
    WHEN 'PENDING_APPROVAL' THEN 'PENDING_APPROVAL'
    WHEN 'RESOLVED' THEN 'COMPLETED'
    WHEN 'CLOSED' THEN 'COMPLETED'
    ELSE NEW.status
  END INTO v_investigation_status;

  UPDATE public.bank_cases
  SET status = v_case_status,
      investigation_status = v_investigation_status,
      updated_at = now()
  WHERE id = NEW.bank_case_id
    AND (status IS DISTINCT FROM v_case_status
      OR investigation_status IS DISTINCT FROM v_investigation_status);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS account_investigations_sync_bank_case ON public.account_investigations;
CREATE TRIGGER account_investigations_sync_bank_case
AFTER UPDATE OF status ON public.account_investigations
FOR EACH ROW
EXECUTE FUNCTION public.sync_bank_case_investigation_status();

DROP POLICY IF EXISTS authenticated_all_bank_cases ON public.bank_cases;
CREATE POLICY compliance_view_bank_cases
  ON public.bank_cases
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'compliance_view')
         OR public.has_permission(auth.uid(), 'compliance_manage')
         OR public.has_permission(auth.uid(), 'compliance_approve'));
CREATE POLICY compliance_manage_bank_cases
  ON public.bank_cases
  FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), 'compliance_manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'compliance_manage'));

DROP POLICY IF EXISTS authenticated_all_account_investigations ON public.account_investigations;
CREATE POLICY compliance_view_account_investigations
  ON public.account_investigations
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'compliance_view')
         OR public.has_permission(auth.uid(), 'compliance_manage')
         OR public.has_permission(auth.uid(), 'compliance_approve'));
CREATE POLICY compliance_manage_account_investigations
  ON public.account_investigations
  FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), 'compliance_manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'compliance_manage'));

DROP POLICY IF EXISTS authenticated_all_investigation_approvals ON public.investigation_approvals;
CREATE POLICY compliance_view_investigation_approvals
  ON public.investigation_approvals
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'compliance_view')
         OR public.has_permission(auth.uid(), 'compliance_manage')
         OR public.has_permission(auth.uid(), 'compliance_approve'));
CREATE POLICY compliance_manage_investigation_approvals
  ON public.investigation_approvals
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'compliance_manage'));
CREATE POLICY compliance_approve_investigation_approvals
  ON public.investigation_approvals
  FOR UPDATE
  TO authenticated
  USING (public.has_permission(auth.uid(), 'compliance_approve')
         AND submitted_by IS DISTINCT FROM auth.uid()::text)
  WITH CHECK (public.has_permission(auth.uid(), 'compliance_approve'));

DROP POLICY IF EXISTS authenticated_all_legal_actions ON public.legal_actions;
CREATE POLICY compliance_view_legal_actions
  ON public.legal_actions
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'compliance_view')
         OR public.has_permission(auth.uid(), 'compliance_manage'));
CREATE POLICY compliance_manage_legal_actions
  ON public.legal_actions
  FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), 'compliance_manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'compliance_manage'));

DROP POLICY IF EXISTS authenticated_all_compliance_documents ON public.compliance_documents;
CREATE POLICY compliance_view_compliance_documents
  ON public.compliance_documents
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'compliance_view')
         OR public.has_permission(auth.uid(), 'compliance_manage'));
CREATE POLICY compliance_manage_compliance_documents
  ON public.compliance_documents
  FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), 'compliance_manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'compliance_manage'));

DROP POLICY IF EXISTS authenticated_all_lien_cases ON public.lien_cases;
CREATE POLICY compliance_view_lien_cases
  ON public.lien_cases
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'compliance_view')
         OR public.has_permission(auth.uid(), 'compliance_manage')
         OR public.has_permission(auth.uid(), 'compliance_approve'));
CREATE POLICY compliance_manage_lien_cases
  ON public.lien_cases
  FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), 'compliance_manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'compliance_manage'));

DROP POLICY IF EXISTS authenticated_all_subsidiaries ON public.subsidiaries;
CREATE POLICY compliance_view_subsidiaries
  ON public.subsidiaries
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'compliance_view')
         OR public.has_permission(auth.uid(), 'compliance_manage'));
CREATE POLICY compliance_manage_subsidiaries
  ON public.subsidiaries
  FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), 'compliance_manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'compliance_manage'));

DROP POLICY IF EXISTS authenticated_all_bank_communications ON public.bank_communications;
CREATE POLICY compliance_view_bank_communications
  ON public.bank_communications
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'compliance_view')
         OR public.has_permission(auth.uid(), 'compliance_manage'));
CREATE POLICY compliance_manage_bank_communications
  ON public.bank_communications
  FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), 'compliance_manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'compliance_manage'));
