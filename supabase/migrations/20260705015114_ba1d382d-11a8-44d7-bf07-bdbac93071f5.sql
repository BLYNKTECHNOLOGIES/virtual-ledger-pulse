
ALTER TABLE public.p2p_quick_replies ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.p2p_quick_replies ALTER COLUMN user_id SET DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_p2p_quick_replies_user_id ON public.p2p_quick_replies(user_id);

DROP POLICY IF EXISTS "Authenticated users can manage p2p_quick_replies" ON public.p2p_quick_replies;
DROP POLICY IF EXISTS "Authenticated users can read p2p_quick_replies" ON public.p2p_quick_replies;

CREATE POLICY "Users read own quick replies"
  ON public.p2p_quick_replies FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own quick replies"
  ON public.p2p_quick_replies FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own quick replies"
  ON public.p2p_quick_replies FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own quick replies"
  ON public.p2p_quick_replies FOR DELETE TO authenticated
  USING (user_id = auth.uid());
