-- Copilot v2 · CP-3: Playbook page (inbox, entries, stats) and the one-time tentative seed.
-- Functional only, approvers only. Adds functions and new Playbook rows; changes no existing data.
--
-- 1. copilot_add_question     approvers add a client phrasing to an entry (normalised here; embedded on next use)
-- 2. copilot_pending_questions / copilot_set_question_embeddings
--                             server only: phrasings without an embedding are embedded by copilot-draft the next
--                             time an approver opens a chat (one batched call, a fraction of a rupee)
-- 3. copilot_inbox_decide     approve or reject a tentative seed from the inbox
--    copilot_set_entry_status approve, retire or restore an entry from the Playbook page or the chat; closes the
--                             entry's open inbox items in the same step (a retired side settles its conflict)
-- 4. copilot_stats            Playbook, coverage, model comparison, spend and recent saves for the Playbook page
-- 5. One-time tentative seed  23 replies for the most common client questions of the last 90 days and the
--                             standard steps. Tentative: approvers only, never operators, expire after
--                             tentative_days unless used (sending one approves it) or replaced.

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Add a phrasing
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.copilot_add_question(p_entry_id uuid, p_text text, p_language text default 'en')
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_text text := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
  v_id uuid;
begin
  if not public.copilot_is_approver(v_uid) then
    raise exception 'Only Copilot approvers can change the Playbook' using errcode = '42501';
  end if;
  if length(v_text) < 2 or length(v_text) > 300 then
    raise exception 'Write the question in 2 to 300 characters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.copilot_playbook_entries where id = p_entry_id) then
    raise exception 'Playbook entry not found' using errcode = 'P0002';
  end if;
  insert into public.copilot_playbook_questions (entry_id, question_text, normalized, language, source, created_by)
  values (p_entry_id, v_text, public.copilot_normalize(v_text), case when p_language = 'hi' then 'hi' else 'en' end,
          'manual', v_uid)
  on conflict on constraint copilot_playbook_questions_unique do nothing
  returning id into v_id;
  return v_id; -- null when the entry already has this phrasing
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Phrasings still to embed (server only)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.copilot_pending_questions(p_limit int default 100)
returns table (id uuid, question_text text)
language sql stable security definer
set search_path = public
as $$
  select q.id, q.question_text
  from public.copilot_playbook_questions q
  join public.copilot_playbook_entries e on e.id = q.entry_id
  where q.embedding is null and e.status <> 'retired'
  order by q.created_at, q.id
  limit greatest(1, least(coalesce(p_limit, 100), 200))
$$;

create or replace function public.copilot_set_question_embeddings(p_items jsonb, p_model text)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_n int;
begin
  update public.copilot_playbook_questions q
     set embedding = public.copilot_to_vector(i.v), embedding_model = p_model
    from jsonb_to_recordset(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) as i(id uuid, v jsonb)
   where q.id = i.id and q.embedding is null and i.v is not null and jsonb_typeof(i.v) = 'array';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Inbox: approve or reject a tentative seed (conflicts use copilot_resolve_conflict)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.copilot_inbox_decide(p_item_id uuid, p_decision text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.copilot_inbox_items%rowtype;
  v_status text;
begin
  if not public.copilot_is_approver(v_uid) then
    raise exception 'Only Copilot approvers can handle the Playbook inbox' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'Unknown decision %', p_decision using errcode = '22023';
  end if;
  -- Lock the entry before the item, the same order copilot_learn_apply uses, so the two never deadlock.
  perform 1 from public.copilot_playbook_entries
   where id = (select entry_id from public.copilot_inbox_items where id = p_item_id) for update;
  select * into v_item from public.copilot_inbox_items where id = p_item_id for update;
  if not found or v_item.status <> 'open' then
    raise exception 'This item was already handled' using errcode = 'P0002';
  end if;
  if v_item.kind <> 'seed' then
    raise exception 'Resolve a conflict by keeping the new, the existing or both answers' using errcode = '22023';
  end if;

  -- Only a still-tentative entry changes; one already approved by use in a chat (or retired) is left as it is.
  update public.copilot_playbook_entries
     set status = case when p_decision = 'approve' then 'approved' else 'retired' end, updated_by = v_uid
   where id = v_item.entry_id and status = 'tentative';
  select status into v_status from public.copilot_playbook_entries where id = v_item.entry_id;

  update public.copilot_inbox_items
     set status = case when p_decision = 'approve' then 'resolved' else 'dismissed' end,
         resolved_by = v_uid, resolved_at = now(),
         resolution = case when p_decision = 'approve' then 'approved_in_inbox' else 'rejected_in_inbox' end
   where id = p_item_id;
  return jsonb_build_object('item_id', p_item_id, 'decision', p_decision, 'entry_status', v_status);
end;
$$;

-- Approve, retire or restore one entry (Playbook page, chat edit dialog). Its open inbox items close in the same
-- step: a seed item follows the decision, and retiring one side of a conflict keeps the other side.
create or replace function public.copilot_set_entry_status(p_entry_id uuid, p_status text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old text;
  v_closed int := 0;
  v_n int;
  v_ids uuid[] := array[p_entry_id];
  v_item record;
begin
  if not public.copilot_is_approver(v_uid) then
    raise exception 'Only Copilot approvers can change the Playbook' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('approved', 'retired') then
    raise exception 'Unknown status %', p_status using errcode = '22023';
  end if;
  select status into v_old from public.copilot_playbook_entries where id = p_entry_id for update;
  if not found then
    raise exception 'Playbook entry not found' using errcode = 'P0002';
  end if;
  if v_old = p_status then
    return jsonb_build_object('entry_id', p_entry_id, 'status', p_status, 'changed', false, 'closed_items', 0);
  end if;

  update public.copilot_playbook_entries set status = p_status, updated_by = v_uid where id = p_entry_id;

  update public.copilot_inbox_items
     set status = case when p_status = 'approved' then 'resolved' else 'dismissed' end,
         resolved_by = v_uid, resolved_at = now(),
         resolution = case when p_status = 'approved' then 'approved_on_page' else 'retired_on_page' end
   where kind = 'seed' and entry_id = p_entry_id and status = 'open';
  get diagnostics v_n = row_count;
  v_closed := v_n;

  if p_status = 'retired' then
    for v_item in
      select id, entry_id, other_entry_id from public.copilot_inbox_items
       where kind = 'conflict' and status = 'open' and (entry_id = p_entry_id or other_entry_id = p_entry_id)
       for update
    loop
      update public.copilot_inbox_items
         set status = 'resolved', resolved_by = v_uid, resolved_at = now(),
             resolution = case when v_item.entry_id = p_entry_id then 'kept_old' else 'kept_new' end
       where id = v_item.id;
      v_closed := v_closed + 1;
      v_ids := v_ids || v_item.entry_id || v_item.other_entry_id;
    end loop;
    update public.copilot_playbook_entries e set conflict_open = exists (
             select 1 from public.copilot_inbox_items i
             where i.kind = 'conflict' and i.status = 'open' and (i.entry_id = e.id or i.other_entry_id = e.id)),
           updated_by = v_uid
     where e.id = any (v_ids) and e.conflict_open is distinct from exists (
             select 1 from public.copilot_inbox_items i
             where i.kind = 'conflict' and i.status = 'open' and (i.entry_id = e.id or i.other_entry_id = e.id));
  end if;
  return jsonb_build_object('entry_id', p_entry_id, 'status', p_status, 'changed', true, 'closed_items', v_closed);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 4. Stats for the Playbook page
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.copilot_stats(p_days int default 30)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_days int := greatest(1, least(coalesce(p_days, 30), 180));
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 180)));
  v_month timestamptz := date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  c public.copilot_config%rowtype;
  v_out jsonb;
begin
  if not public.copilot_is_approver(v_uid) then
    raise exception 'Only Copilot approvers can see Copilot stats' using errcode = '42501';
  end if;
  select * into c from public.copilot_config where id;

  select jsonb_build_object(
    'days', v_days,
    'entries', (
      select jsonb_build_object(
        'approved', count(*) filter (where e.status = 'approved'),
        'tentative', count(*) filter (where e.status = 'tentative' and (e.expires_at is null or e.expires_at > now())),
        'expired', count(*) filter (where e.status = 'tentative' and e.expires_at <= now()),
        'retired', count(*) filter (where e.status = 'retired'),
        'conflicts', (select count(*) from public.copilot_inbox_items i where i.kind = 'conflict' and i.status = 'open'),
        'uses', coalesce(sum(e.use_count) filter (where e.status <> 'retired'), 0))
      from public.copilot_playbook_entries e),
    'coverage', (
      select jsonb_build_object(
        'questions', count(*),
        'approved', count(*) filter (where exists (
          select 1 from jsonb_array_elements(coalesce(r.matches, '[]'::jsonb)) m
          where m ->> 'status' = 'approved' and coalesce((m ->> 'conflict')::boolean, false) = false
            and coalesce((m ->> 'similarity')::double precision, 0) >= c.match_threshold)),
        'tentative', count(*) filter (where exists (
          select 1 from jsonb_array_elements(coalesce(r.matches, '[]'::jsonb)) m
          where m ->> 'status' = 'tentative' and coalesce((m ->> 'similarity')::double precision, 0) >= c.match_threshold)))
      from public.copilot_requests r
      where r.mode = 'suggest' and r.created_at >= v_since and r.question_text is not null),
    'models', coalesce((
      select jsonb_agg(m order by m ->> 'model')
      from (
        select jsonb_build_object(
          'model', a.model,
          'drafts', count(*),
          'held_back', count(*) filter (where a.status = 'blocked'),
          'new_policy', count(*) filter (where a.new_policy),
          'used', count(*) filter (where a.feedback = 'used'),
          'approved', count(*) filter (where a.feedback = 'approved'),
          'unedited', count(*) filter (where a.feedback in ('used', 'approved') and a.feedback_edited is false),
          'rejected', count(*) filter (where a.feedback = 'rejected'),
          'avg_latency_ms', round(avg(a.latency_ms)),
          'cost_inr', round(coalesce(sum(a.cost_inr), 0), 2)) as m
        from public.copilot_ai_calls a
        where a.purpose in ('draft', 'redraft') and a.status in ('ok', 'blocked') and a.created_at >= v_since
        group by a.model) s), '[]'::jsonb),
    'model_errors', (
      select count(*) from public.copilot_ai_calls a
      where a.purpose in ('draft', 'redraft') and a.status = 'error' and a.created_at >= v_since),
    'spend', jsonb_build_object(
      'month_inr', round(public.copilot_month_spend_inr(), 2),
      'limit_inr', c.monthly_budget_inr,
      'alert_pcts', to_jsonb(c.budget_alert_pcts),
      'by_day', coalesce((
        select jsonb_agg(jsonb_build_object('day', d.day, 'inr', round(d.inr, 2)) order by d.day)
        from (
          select (a.created_at at time zone 'Asia/Kolkata')::date as day, sum(a.cost_inr) as inr
          from public.copilot_ai_calls a
          where a.created_at >= v_month
          group by 1) d), '[]'::jsonb),
      'by_purpose', coalesce((
        select jsonb_object_agg(p.purpose, round(p.inr, 2))
        from (
          select a.purpose, sum(a.cost_inr) as inr
          from public.copilot_ai_calls a
          where a.created_at >= v_month
          group by 1) p), '{}'::jsonb)),
    'learning', jsonb_build_object(
      'by_action', coalesce((
        select jsonb_object_agg(x.action, x.n)
        from (
          select l.action, count(*) as n
          from public.copilot_learning_events l
          where l.created_at >= v_since and l.undone_at is null
          group by 1) x), '{}'::jsonb),
      'undone', (
        select count(*) from public.copilot_learning_events l
        where l.created_at >= v_since and l.undone_at is not null)),
    'recent', coalesce((
      select jsonb_agg(x.j order by x.at desc)
      from (
        select l.created_at as at, jsonb_build_object(
          'id', l.id, 'at', l.created_at, 'user_id', l.user_id, 'action', l.action, 'cause', l.cause,
          'entry_id', l.entry_id, 'title', e.title, 'order_number', l.order_number,
          'undone', l.undone_at is not null) as j
        from public.copilot_learning_events l
        left join public.copilot_playbook_entries e on e.id = l.entry_id
        order by l.created_at desc
        limit 30) x), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Access
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.copilot_add_question(uuid, text, text) from public, anon;
revoke all on function public.copilot_inbox_decide(uuid, text) from public, anon;
revoke all on function public.copilot_set_entry_status(uuid, text) from public, anon;
revoke all on function public.copilot_stats(int) from public, anon;
grant execute on function public.copilot_add_question(uuid, text, text) to authenticated, service_role;
grant execute on function public.copilot_inbox_decide(uuid, text) to authenticated, service_role;
grant execute on function public.copilot_set_entry_status(uuid, text) to authenticated, service_role;
grant execute on function public.copilot_stats(int) to authenticated, service_role;
revoke all on function public.copilot_pending_questions(int) from public, anon, authenticated;
revoke all on function public.copilot_set_question_embeddings(jsonb, text) from public, anon, authenticated;
grant execute on function public.copilot_pending_questions(int) to service_role;
grant execute on function public.copilot_set_question_embeddings(jsonb, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 5. One-time tentative seed (runs once; a later run finds the batch and does nothing)
-- Written fresh in the house style from the most common client questions of the last 90 days (operators'
-- wording is not copied). Scope uses the server's side and status codes. Questions get their embeddings
-- the next time an approver opens a chat.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
do $seed$
declare
  v_batch constant text := 'seed-2026-10-15';
  v_days int;
  v_entry uuid;
  r record;
begin
  if exists (select 1 from public.copilot_playbook_entries where seed_batch = v_batch) then
    raise notice 'Copilot seed % already present; nothing added', v_batch;
    return;
  end if;
  select coalesce(tentative_days, 60) into v_days from public.copilot_config where id;
  v_days := coalesce(v_days, 60);

  for r in
    select x.*
    from jsonb_to_recordset($json$[
{"title":"Can I pay now? — payment details after verification","scope":{"sides":["SELL"],"statuses":["TRADING"]},
 "reply_en":"Please wait a moment, sir. We will share the payment details as soon as your verification is complete.",
 "reply_hi":"Kripya thoda intezaar karein, sir. Verification poora hote hi hum payment details share kar denge.",
 "note":"If the client is already verified, share the payment details instead.",
 "questions":[{"t":"Can I pay now?"},{"t":"Shall I pay?"},{"t":"Should I pay?"},{"t":"Can I make the payment?"},{"t":"Where should I pay?"},{"t":"How do I pay?"},{"t":"Please share the payment details"},{"t":"Send your UPI ID"},{"t":"Pay kar du?","l":"hi"},{"t":"Payment kahan karu?","l":"hi"},{"t":"UPI ID bhejo","l":"hi"}]},
{"title":"How long? — verification in progress","scope":{"sides":["SELL"],"statuses":["TRADING"]},
 "reply_en":"Please allow us a few minutes for verification, sir. We will proceed as soon as it is complete.",
 "reply_hi":"Verification ke liye kripya kuch minute dein, sir. Poora hote hi hum aage badhenge.",
 "questions":[{"t":"How much time will it take?"},{"t":"How long?"},{"t":"How much time?"},{"t":"How long do I need to wait?"},{"t":"What happened?"},{"t":"Any update?"},{"t":"Is there any problem?"},{"t":"Kitna time lagega?","l":"hi"},{"t":"Kya hua?","l":"hi"},{"t":"Kitni der lagegi?","l":"hi"}]},
{"title":"Client marked paid — we are checking the payment","scope":{"sides":["SELL"],"statuses":["BUYER_PAYED"]},
 "reply_en":"Thank you, sir. We are checking the payment in our account and will release the USDT once it is confirmed.",
 "reply_hi":"Dhanyavaad, sir. Hum apne account mein payment check kar rahe hain aur confirm hote hi USDT release kar denge.",
 "questions":[{"t":"Payment done"},{"t":"I have paid"},{"t":"Paid, please release"},{"t":"Please release"},{"t":"Release my USDT"},{"t":"Is it done?"},{"t":"How much time?"},{"t":"How long will it take?"},{"t":"Payment kar diya","l":"hi"},{"t":"Release kar do","l":"hi"},{"t":"Kitna time lagega?","l":"hi"}]},
{"title":"How long? — we are paying you","scope":{"sides":["BUY"],"statuses":["TRADING"]},
 "reply_en":"Your payment is in progress, sir. Please allow us a few minutes.",
 "reply_hi":"Aapka payment process ho raha hai, sir. Kripya kuch minute dein.",
 "questions":[{"t":"How much time?"},{"t":"How long will it take?"},{"t":"When will I get the payment?"},{"t":"Is it done?"},{"t":"What happened?"},{"t":"Any update?"},{"t":"Kitna time lagega?","l":"hi"},{"t":"Payment kab aayega?","l":"hi"},{"t":"Kya hua?","l":"hi"},{"t":"Paisa kab milega?","l":"hi"}]},
{"title":"We marked paid — please check and release","scope":{"sides":["BUY"],"statuses":["BUYER_PAYED"]},
 "reply_en":"We have sent the payment, sir. Please check your bank account and release the USDT once you have received it.",
 "reply_hi":"Humne payment bhej diya hai, sir. Kripya apna bank account check karein aur payment milne par USDT release karein.",
 "questions":[{"t":"Is it done?"},{"t":"Have you paid?"},{"t":"Payment done?"},{"t":"Did you send the money?"},{"t":"How much time?"},{"t":"Payment ho gaya?","l":"hi"},{"t":"Paise bhej diye?","l":"hi"}]},
{"title":"Our payment not received yet","scope":{"sides":["BUY"],"statuses":["BUYER_PAYED"]},
 "reply_en":"We have sent the payment from our side, sir. Some bank transfers take a little longer to reflect, so please check again in a few minutes.",
 "reply_hi":"Humari taraf se payment bhej diya gaya hai, sir. Kuch bank transfer reflect hone mein thoda samay lete hain, isliye kripya kuch minute baad dobara check karein.",
 "questions":[{"t":"Not received"},{"t":"Payment not received"},{"t":"I have not received the money"},{"t":"Amount not credited"},{"t":"Still not received"},{"t":"Paisa nahi aaya","l":"hi"},{"t":"Payment nahi mila","l":"hi"}]},
{"title":"Why 1% TDS is deducted","scope":{"sides":["BUY"]},
 "reply_en":"Sir, as mentioned in our ad terms, 1% TDS is deducted on this trade under the Income Tax Act and deposited against your PAN. You can claim it when you file your income tax return.",
 "reply_hi":"Sir, humare ad terms ke anusaar is trade par Income Tax Act ke tahat 1% TDS kata jata hai aur aapke PAN par jama kiya jata hai. Income tax return file karte samay aap ise claim kar sakte hain.",
 "questions":[{"t":"Why is the amount less?"},{"t":"Why did you deduct TDS?"},{"t":"Why TDS?"},{"t":"Will you deduct TDS?"},{"t":"There should be no deduction on P2P"},{"t":"Why did I get less money?"},{"t":"How much TDS will you deduct?"},{"t":"TDS kyu kata?","l":"hi"},{"t":"Kam paise kyu aaye?","l":"hi"}]},
{"title":"TDS proof or certificate","scope":{"sides":["BUY"]},
 "reply_en":"Sir, the TDS is deposited against your PAN after the quarter ends. It will then show in your Form 26AS on the income tax portal.",
 "reply_hi":"Sir, quarter khatam hone ke baad TDS aapke PAN par jama ho jata hai. Uske baad yeh income tax portal par aapke Form 26AS mein dikhega.",
 "note":"Check with finance whether we also issue TDS certificates on request.",
 "questions":[{"t":"Can you share TDS proof?"},{"t":"I need the TDS certificate"},{"t":"Did you pay the TDS?"},{"t":"Send the TDS receipt"},{"t":"Where can I see the TDS?"},{"t":"TDS certificate kab milega?","l":"hi"}]},
{"title":"Are you there?","scope":{},
 "reply_en":"Yes, sir, we are here and looking into your order.",
 "reply_hi":"Ji sir, hum yahin hain aur aapka order dekh rahe hain.",
 "questions":[{"t":"Are you there?"},{"t":"Are you online?"},{"t":"Hello, are you there?"},{"t":"Anyone there?"},{"t":"Hello?"},{"t":"R u there?"},{"t":"Koi hai?","l":"hi"},{"t":"Sir aap ho?","l":"hi"}]},
{"title":"Client asks us to hurry","scope":{},
 "reply_en":"Sure, sir. We are on it and will complete your order as quickly as possible.",
 "reply_hi":"Zaroor, sir. Hum is par kaam kar rahe hain aur aapka order jald se jald poora karenge.",
 "questions":[{"t":"Please do it fast"},{"t":"Please hurry"},{"t":"I need it urgently"},{"t":"It's urgent"},{"t":"Time is running out"},{"t":"Jaldi karo","l":"hi"},{"t":"Jaldi kijiye please","l":"hi"}]},
{"title":"KYC documents — Aadhaar and mobile number","kind":"step","step_key":"kyc","scope":{"sides":["SELL"]},
 "reply_en":"To proceed, please share your Aadhaar card (front and back) and your mobile number, sir.",
 "reply_hi":"Aage badhne ke liye kripya apna Aadhaar card (front aur back) aur mobile number share karein, sir.",
 "questions":[{"t":"What documents do you need?"},{"t":"Which documents should I share?"},{"t":"What details do you need from me?"},{"t":"Kya documents chahiye?","l":"hi"},{"t":"KYC ke liye kya bhejna hai?","l":"hi"}]},
{"title":"Why we ask for KYC","scope":{},
 "reply_en":"Sir, we verify every client's identity as part of our compliance process. It keeps the trade safe for both sides.",
 "reply_hi":"Sir, compliance process ke tahat hum har client ki pehchaan verify karte hain. Isse trade dono taraf ke liye surakshit rehta hai.",
 "note":"KYC or VKYC may be asked again on purpose; never tell a client that KYC can be skipped.",
 "questions":[{"t":"Why do you need my Aadhaar?"},{"t":"Why KYC?"},{"t":"Why do you need my documents?"},{"t":"I already did KYC on Binance"},{"t":"Why do you need my mobile number?"},{"t":"KYC kyu chahiye?","l":"hi"},{"t":"Binance par KYC ho chuka hai","l":"hi"}]},
{"title":"Purpose of buying USDT","kind":"step","step_key":"purpose","scope":{"sides":["SELL"]},
 "reply_en":"May I know the purpose of buying USDT, sir?",
 "reply_hi":"Kripya bataiye, sir, aap USDT kis purpose se khareed rahe hain?",
 "questions":[]},
{"title":"Source of funds","kind":"step","step_key":"source_of_funds","scope":{"sides":["SELL"]},
 "reply_en":"May I know your source of funds, sir — salary, business or something else?",
 "reply_hi":"Kripya bataiye, sir, aapke funds ka source kya hai — salary, business ya kuch aur?",
 "questions":[]},
{"title":"Which bank will you pay from?","kind":"step","step_key":"paying_bank","scope":{"sides":["SELL"],"statuses":["TRADING"]},
 "reply_en":"Which bank will you use to pay, sir?",
 "reply_hi":"Aap kis bank se payment karenge, sir?",
 "questions":[]},
{"title":"Client names the bank they will pay from","scope":{"sides":["SELL"],"statuses":["TRADING"]},
 "reply_en":"Thank you, sir. Please make sure the payment comes from a bank account in your own name.",
 "reply_hi":"Dhanyavaad, sir. Kripya dhyan rakhein ki payment aapke apne naam ke bank account se hi ho.",
 "questions":[{"t":"I will pay from HDFC"},{"t":"I will be paying from Kotak"},{"t":"I will use SBI"},{"t":"Paying from ICICI Bank"},{"t":"I pay from the same bank that is registered with you"},{"t":"HDFC se pay karunga","l":"hi"}]},
{"title":"One-time verification by our relationship manager","scope":{"sides":["SELL"]},
 "reply_en":"A one-time verification is needed, sir. Our relationship manager will connect with you shortly.",
 "reply_hi":"Sir, ek baar verification zaroori hai. Humare relationship manager aapse jald hi sampark karenge.",
 "questions":[{"t":"What verification?"},{"t":"Why do I need verification?"},{"t":"Who will call me?"},{"t":"When will the RM call?"},{"t":"Verification kab hoga?","l":"hi"}]},
{"title":"Our support contact number","scope":{},
 "reply_en":"Sir, you can reach our support team at {contact:support}.",
 "reply_hi":"Sir, aap humari support team se {contact:support} par sampark kar sakte hain.",
 "questions":[{"t":"What is your contact number?"},{"t":"Can I call you?"},{"t":"Give me your number"},{"t":"How can I contact you?"},{"t":"Contact number please"},{"t":"Number do","l":"hi"},{"t":"Aapka number kya hai?","l":"hi"}]},
{"title":"KYC call number","scope":{"sides":["SELL"]},
 "reply_en":"Sir, our KYC team will call you for the verification. You can also reach them at {contact:kyc}.",
 "reply_hi":"Sir, verification ke liye humari KYC team aapko call karegi. Aap unse {contact:kyc} par bhi sampark kar sakte hain.",
 "questions":[{"t":"Which number will call for KYC?"},{"t":"Number for video KYC"},{"t":"Who will do my video KYC?"},{"t":"KYC call kis number se aayega?","l":"hi"}]},
{"title":"Thank you after the order","kind":"step","step_key":"thanks","scope":{"statuses":["COMPLETED"]},
 "reply_en":"Thank you for trading with us, sir. We would appreciate your positive feedback.",
 "reply_hi":"Humare saath trade karne ke liye dhanyavaad, sir. Kripya positive feedback zaroor dein.",
 "questions":[{"t":"Thank you"},{"t":"Thanks"},{"t":"Received, thanks"},{"t":"Got it, thank you"},{"t":"Shukriya","l":"hi"},{"t":"Dhanyavaad","l":"hi"}]},
{"title":"Client wants to cancel","scope":{"sides":["SELL"],"statuses":["TRADING"]},
 "reply_en":"No problem, sir. Please cancel the order from your side and do not make any payment for it.",
 "reply_hi":"Koi baat nahi, sir. Kripya order apni taraf se cancel kar dein aur iske liye koi payment na karein.",
 "questions":[{"t":"Sorry, I made an error and need to cancel"},{"t":"I want to cancel the order"},{"t":"Please cancel"},{"t":"Cancel the order"},{"t":"Order cancel karna hai","l":"hi"},{"t":"Cancel kar do","l":"hi"}]},
{"title":"Payment from someone else's account","scope":{"sides":["SELL"]},"risk":"red",
 "reply_en":"Sir, we accept payment only from a bank account in your own name. Please do not pay from anyone else's account.",
 "reply_hi":"Sir, hum sirf aapke apne naam ke bank account se hi payment lete hain. Kripya kisi aur ke account se payment na karein.",
 "questions":[{"t":"Can I pay from my friend's account?"},{"t":"Can my brother pay for me?"},{"t":"Can I pay from my wife's account?"},{"t":"My father will pay"},{"t":"Papa ke account se pay kar du?","l":"hi"},{"t":"Dost ke account se payment kar sakta hoon?","l":"hi"}]},
{"title":"Test transfer of ₹1 received","scope":{"sides":["BUY"]},
 "reply_en":"Thank you for confirming, sir. We are sending the remaining amount now.",
 "reply_hi":"Confirm karne ke liye dhanyavaad, sir. Hum baaki amount abhi bhej rahe hain.",
 "questions":[{"t":"Received 1 rupee"},{"t":"Got ₹1"},{"t":"1 rs received"},{"t":"Test amount received"},{"t":"1 rupaya aaya","l":"hi"}]}
]$json$::jsonb) as x(title text, kind text, step_key text, scope jsonb, risk text, reply_en text, reply_hi text,
                     note text, questions jsonb)
  loop
    insert into public.copilot_playbook_entries (kind, step_key, title, status, source, scope, reply_en, reply_hi,
                                                 internal_note, risk, expires_at, seed_batch, created_at, updated_at)
    values (coalesce(r.kind, 'reply'), r.step_key, r.title, 'tentative', 'seed', coalesce(r.scope, '{}'::jsonb),
            r.reply_en, r.reply_hi, r.note, coalesce(r.risk, 'none'), now() + make_interval(days => v_days), v_batch,
            clock_timestamp(), clock_timestamp())
    returning id into v_entry;

    insert into public.copilot_playbook_questions (entry_id, question_text, normalized, language, source)
    select v_entry, q ->> 't', public.copilot_normalize(q ->> 't'), coalesce(q ->> 'l', 'en'), 'seed'
    from jsonb_array_elements(coalesce(r.questions, '[]'::jsonb)) q
    on conflict on constraint copilot_playbook_questions_unique do nothing;

    -- clock_timestamp(): each item gets its own time, so the inbox keeps the seed's order.
    insert into public.copilot_inbox_items (kind, question_text, context, entry_id, created_at)
    values ('seed', r.questions -> 0 ->> 't', jsonb_build_object('seed_batch', v_batch), v_entry, clock_timestamp());
  end loop;
end
$seed$;