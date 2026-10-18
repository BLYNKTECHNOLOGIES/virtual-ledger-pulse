-- Copilot · CP-7: Rephrase ("write it your way, the Copilot words it"). Functional only.
-- While typing in an order chat, approvers and the operators an approver picks get their own words back as a proper
-- reply: the same meaning and decision, nothing added (the server checks every rewrite). Nothing is sent
-- automatically. Operators get only this: no Playbook suggestions, no AI drafts. A rephrased reply an approver sends is
-- saved like a sent suggestion, with the typed words as its reason; one an operator sends waits in the Playbook inbox
-- for an approver to save or dismiss (nothing an operator sends becomes policy on its own).
--
-- 1. copilot_config             who besides the approvers may rephrase; automatic after a pause or only on request; a
--                               daily allowance per person; the model; a second call that checks every rewrite.
-- 2. copilot_ai_calls           purpose "rephrase"; the typed words (masked) kept with the call; a per-person index for
--                               the daily allowance.
-- 3. copilot_inbox_items        kind "operator_reply": an operator's rephrased reply waiting for an approver (one per
--                               order and reply).
-- 4. copilot_playbook_examples  the typed words behind a saved reply (masked): why it was answered this way in that chat.
-- 5. copilot_can_rephrase       an approver, or picked by an approver and able to read order chats.
-- 6. copilot_my_access          whether the signed-in user may rephrase, and the automatic setting; approvers also get
--                               this month's use (the second checks' cost included).
-- 7. copilot_dismiss_operator_replies  approvers dismiss an operator's reply, or every open one older than some days.

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Settings
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.copilot_config
  add column rephrase_user_ids uuid[] not null default '{}'::uuid[]
    check (cardinality(rephrase_user_ids) <= 200),
  add column rephrase_auto boolean not null default true,
  add column rephrase_daily_limit int not null default 200
    check (rephrase_daily_limit between 10 and 2000),
  add column rephrase_model text not null default 'google/gemini-3-flash-preview'
    check (rephrase_model ~ '^[a-z0-9-]+/[a-z0-9.-]+$'),
  add column rephrase_verify boolean not null default true;
comment on column public.copilot_config.rephrase_user_ids is
  'Operators who may rephrase in order chats (approvers always may). They get rephrasing only.';
comment on column public.copilot_config.rephrase_auto is
  'true: a rewrite is offered after a short pause in typing; false: only when the person asks for one.';
comment on column public.copilot_config.rephrase_daily_limit is
  'Rewrites per person per day (IST), approvers included.';
comment on column public.copilot_config.rephrase_model is 'Lovable AI Gateway model used for rewrites.';
comment on column public.copilot_config.rephrase_verify is
  'true: a second AI call (utility_model) reads every rewrite against the typed words before it is offered; anything it finds, or no answer, and nothing is offered.';
-- Start with the model already used for saving and translation.
update public.copilot_config set rephrase_model = utility_model
 where id and utility_model ~ '^[a-z0-9-]+/[a-z0-9.-]+$';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 2. AI calls
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.copilot_ai_calls drop constraint if exists copilot_ai_calls_purpose_check;
alter table public.copilot_ai_calls add constraint copilot_ai_calls_purpose_check
  check (purpose in ('draft', 'redraft', 'embed', 'judge', 'translate', 'seed', 'rephrase'));
alter table public.copilot_ai_calls
  add column input_text text check (input_text is null or length(input_text) <= 1000);
comment on column public.copilot_ai_calls.input_text is 'Rephrase: the words typed (masked).';
create index copilot_ai_calls_rephrase_user_idx on public.copilot_ai_calls (user_id, created_at desc)
  where purpose = 'rephrase';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Inbox: operators' rephrased replies
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.copilot_inbox_items drop constraint if exists copilot_inbox_items_kind_check;
alter table public.copilot_inbox_items add constraint copilot_inbox_items_kind_check
  check (kind in ('conflict', 'seed', 'operator_question', 'operator_reply'));
-- The same reply sent twice in one order is one item while it is open.
create unique index copilot_inbox_items_operator_reply_key on public.copilot_inbox_items
  (order_number, (context ->> 'reply_key'))
  where kind = 'operator_reply' and status = 'open';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 4. The reason behind a saved reply
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.copilot_playbook_examples
  add column note text check (note is null or length(note) <= 600);
comment on column public.copilot_playbook_examples.note is
  'What the desk typed before the reply was rephrased (masked): the reason behind this reply in this chat.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 5. Who may rephrase: approvers, and the operators an approver picked who can read order chats
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.copilot_can_rephrase(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select p_user_id is not null and (
    public.copilot_is_approver(p_user_id)
    or (
      exists (select 1 from public.copilot_config c where c.id and p_user_id = any (c.rephrase_user_ids))
      and (   public.has_terminal_permission(p_user_id, 'terminal_orders_view'::public.terminal_permission)
           or public.has_terminal_permission(p_user_id, 'terminal_orders_chat'::public.terminal_permission)
           or public.has_terminal_permission(p_user_id, 'terminal_orders_manage'::public.terminal_permission))))
$$;
revoke all on function public.copilot_can_rephrase(uuid) from public, anon, authenticated;
grant execute on function public.copilot_can_rephrase(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 6. What the signed-in user may do (feeds the screen)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.copilot_my_access()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select case when public.copilot_is_approver(auth.uid()) then
    jsonb_build_object(
      'is_approver', true,
      'operators_enabled', c.operators_enabled,
      'hindi_switch_after', c.hindi_switch_after,
      'budget', jsonb_build_object(
        'limit_inr', c.monthly_budget_inr,
        'spent_inr', round(public.copilot_month_spend_inr(), 2),
        'alert_pcts', to_jsonb(c.budget_alert_pcts)),
      'approved_entries', (select count(*) from public.copilot_playbook_entries e where e.status = 'approved'),
      'open_inbox', (select count(*) from public.copilot_inbox_items i where i.status = 'open'),
      'can_rephrase', true,
      'rephrase_auto', c.rephrase_auto,
      'rephrase_month', (
        select jsonb_build_object(
          'calls', count(*) filter (where a.purpose = 'rephrase'),
          'used', count(*) filter (where a.purpose = 'rephrase' and a.feedback = 'used'),
          'people', count(distinct a.user_id) filter (where a.purpose = 'rephrase'),
          'spent_inr', round(coalesce(sum(a.cost_inr), 0), 2))
        from public.copilot_ai_calls a
        where (a.purpose = 'rephrase' or (a.purpose = 'judge' and a.variant = 'rephrase_check'))
          and a.created_at >= (date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')))
  else
    jsonb_build_object(
      'is_approver', false,
      'operators_enabled', c.operators_enabled,
      'can_rephrase', public.copilot_can_rephrase(auth.uid()),
      'rephrase_auto', c.rephrase_auto)
  end
  from public.copilot_config c
  where c.id
$$;
revoke all on function public.copilot_my_access() from public, anon;
grant execute on function public.copilot_my_access() to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 7. Dismissing operators' replies: approvers only, by the server's clock, operator replies only
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.copilot_dismiss_operator_replies(p_item_id uuid default null, p_older_than_days int default null)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n int;
begin
  if not public.copilot_is_approver(v_uid) then
    raise exception 'Only Copilot approvers can dismiss replies' using errcode = '42501';
  end if;
  if (p_item_id is null) = (p_older_than_days is null) then
    raise exception 'Give one reply, or a number of days' using errcode = '22023';
  end if;
  if p_older_than_days is not null and (p_older_than_days < 1 or p_older_than_days > 365) then
    raise exception 'Days must be between 1 and 365' using errcode = '22023';
  end if;
  update public.copilot_inbox_items
     set status = 'dismissed', resolved_by = v_uid, resolved_at = now(), resolution = 'dismissed'
   where kind = 'operator_reply' and status = 'open'
     and (p_item_id is null or id = p_item_id)
     and (p_older_than_days is null or created_at < now() - make_interval(days => p_older_than_days));
  get diagnostics v_n = row_count;
  return v_n;
end
$$;
revoke all on function public.copilot_dismiss_operator_replies(uuid, int) from public, anon;
grant execute on function public.copilot_dismiss_operator_replies(uuid, int) to authenticated, service_role;