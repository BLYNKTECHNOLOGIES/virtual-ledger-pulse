-- Copilot · CP-8: Next step. Functional only, approvers only. Nothing is sent to clients, no AI, no background job, and
-- nothing about orders, payments or releases changes.
-- Six days of chats (16–23 Oct 2026, ~1,150 orders) show that most client messages answer our question (documents, a
-- number, a bank's name, "salary"), so the Copilot now offers the next message of the team's own script: Playbook
-- entries of kind 'step', which approvers own like any reply.
--
-- 1. Step keys            the steps of the script (greeting … thanks) the Copilot knows; the CP-1 keys nothing used go.
-- 2. copilot_learn_keys   one save per press: copilot-learn takes a key (sha-256 of the order, the client message, the
--                         suggestion and the sent text) before saving, so a repeated press or a retry never saves twice;
--                         only the press holding the key (its claim token) finishes or gives it back. Service role only.
-- 3. Clean learning       client wordings that ask nothing (a picture "[image]", a masked number "[phone]") are deleted;
--                         the three copies of "Payment verification before release" that one fast series of approvals
--                         made (their only wording was "[image]") are retired.
-- 4. Steps from replies   six approved replies that are messages of the script become its steps (kind and step key only;
--                         their words, situations and client wordings stay): pay from your own account, the verification
--                         call, mark as paid, we are checking the payment, we are paying, payment sent — please release.
-- 5. Tentative steps      words for the other steps, for approvers to use or approve: greeting, profession, call status,
--                         pick up the call, please pay, payment screenshot, PAN and mobile, TDS with the amount after TDS,
--                         beneficiary, release reminder.
-- 6. Returning clients    tentative replies for clients whose KYC we hold ("Can I pay now?", "How long will it take?",
--                         "Client asks us to hurry"); none asks to pay before verification.
-- 7. Playbook gaps        tentative questions: payment failed or limit, already verified, trading again, the amount after
--                         TDS, "pay from your own account"; more wordings for "Why 1% TDS is deducted".
-- Steps 3–4 change only rows still as they were; steps 5–7 run once (a second run finds the seed batch, changes nothing).

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Step keys (the same list as _shared/copilot-steps.ts STEP_DEFS)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.copilot_playbook_entries drop constraint if exists copilot_playbook_entries_step_key_check;
alter table public.copilot_playbook_entries add constraint copilot_playbook_entries_step_key_check check (step_key in (
  'greeting', 'kyc', 'purpose', 'source_of_funds', 'profession', 'paying_bank', 'own_account', 'verification_call', 'call_wait',
  'pick_up_call', 'please_pay', 'mark_paid', 'verify_payment', 'payment_screenshot', 'buy_details', 'tds_notice', 'paying',
  'beneficiary', 'paid_release', 'release_reminder', 'thanks'));

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 2. One save per press
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.copilot_learn_keys (
  key text primary key check (key ~ '^[0-9a-f]{64}$'),
  user_id uuid not null,
  order_number text not null check (length(order_number) between 1 and 40),
  claim_token uuid not null default gen_random_uuid(),
  result jsonb,
  created_at timestamptz not null default now()
);
-- (A table made by an earlier draft of this change gets its claim token too.)
alter table public.copilot_learn_keys add column if not exists claim_token uuid not null default gen_random_uuid();
comment on table public.copilot_learn_keys is
  'Copilot: one save per press. copilot-learn takes a key (sha-256 of the order, the client message, the suggestion and the sent text) before saving; a repeated press gets the stored answer, an undone or failed save gives the key back. Only the press holding claim_token finishes or gives back a key; an unfinished key is taken over after two minutes. Keys older than 30 days are deleted. Service role only.';
alter table public.copilot_learn_keys enable row level security;
revoke all on table public.copilot_learn_keys from public, anon, authenticated;
grant select, insert, update, delete on table public.copilot_learn_keys to service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Clean learning
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
delete from public.copilot_playbook_questions q
 where q.question_text ~* '^(\s|\[[a-z_]+\]|[[:punct:]])*$';

update public.copilot_playbook_entries set status = 'retired', updated_at = now()
 where id in ('93118516-8749-49d3-a4d0-f80c379d34a5', 'f32f8b59-97b7-40ae-b4f5-78318c8d8bb8', '3cad31b7-f9f9-4963-99e9-9d6a899348f6')
   and kind = 'reply' and status = 'approved' and conflict_open = false
   and reply_en = 'Thank you, sir. We are verifying the payment in our account and will release the USDT once confirmed.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 4. Approved replies that are messages of the script become its steps (words, situations, wordings unchanged)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
update public.copilot_playbook_entries e set kind = 'step', step_key = s.step_key, updated_at = now()
from (values
  ('50f86cfa-237e-4db4-9dc0-9adbd85a0cd8'::uuid, 'own_account'),
  ('cfe4b541-8129-4a65-86c9-ec9608909829'::uuid, 'verification_call'),
  ('05646141-2867-42bb-9c7e-06b646a51e5c'::uuid, 'mark_paid'),
  ('f48e05cd-e780-416e-b840-b29620b6d675'::uuid, 'verify_payment'),
  ('a2f49b40-18b0-4e88-ab70-25729fe635d6'::uuid, 'paying'),
  ('de163ae6-365f-4678-9344-629175eabe48'::uuid, 'paid_release')
) as s(id, step_key)
where e.id = s.id and e.kind = 'reply' and e.status = 'approved';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 5–7. Tentative steps, returning-client replies and Playbook gaps (runs once)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
do $seed$
declare
  v_batch constant text := 'seed-2026-10-24';
  v_days int;
  v_topic uuid;
  v_entry uuid;
  v_ctx text;
  v_n int;
  r record;
  w jsonb;
begin
  if exists (select 1 from public.copilot_playbook_topics where seed_batch = v_batch) then
    raise notice 'Copilot seed % already present; nothing changed', v_batch;
    return;
  end if;
  select coalesce(tentative_days, 60) into v_days from public.copilot_config where id;
  v_days := coalesce(v_days, 60);

  for r in
    select x.*
    from jsonb_to_recordset($json$[
{"step_key":"greeting","title":"Greeting","en":"{greeting}, sir.","hi":"Namaste sir."},
{"step_key":"profession","title":"Profession","sides":["SELL"],
 "en":"May I know your profession, sir?","hi":"Sir, aapka profession kya hai?"},
{"step_key":"call_wait","title":"Call status while the client waits","sides":["SELL"],
 "en":"Thank you for your patience, sir. Please keep your phone free; our KYC team will call you shortly.",
 "hi":"Sir, aapke patience ke liye thank you. Please apna phone free rakhiye, hamari KYC team thodi der mein call karegi."},
{"step_key":"pick_up_call","title":"Please pick up the KYC call","sides":["SELL"],
 "en":"Sir, our KYC team is calling you now. Please pick up the call to complete the verification.",
 "hi":"Sir, hamari KYC team aapko abhi call kar rahi hai. Please pick up the call, verification complete ho jayega."},
{"step_key":"please_pay","title":"Please pay (after the payment details)","sides":["SELL"],"stages":["sell.pay.ready"],
 "en":"Please pay on it, sir, from a bank account in your own name.",
 "hi":"Please pay on it, sir — apne naam ke bank account se hi payment kijiye."},
{"step_key":"payment_screenshot","title":"Payment screenshot","sides":["SELL"],"stages":["sell.pay"],
 "en":"Sir, please share the payment screenshot.","hi":"Sir, please payment ka screenshot share kar dijiye."},
{"step_key":"buy_details","title":"PAN and mobile number","sides":["BUY"],
 "en":"Kindly share your PAN card and mobile number, sir, so that we can process your payment.",
 "hi":"Sir, payment process karne ke liye apna PAN card aur mobile number share kar dijiye."},
{"step_key":"tds_notice","title":"TDS and the amount we will pay","sides":["BUY"],
 "en":"Sir, as per our ad terms, 1% TDS is deducted on this trade under Section 194S, so we will pay you ₹{net_amount}.",
 "hi":"Sir, humare ad terms ke anusaar is trade par Section 194S ke tahat 1% TDS kata jata hai, isliye hum aapko ₹{net_amount} pay karenge."},
{"step_key":"beneficiary","title":"Beneficiary added — first payment after activation","sides":["BUY"],
 "en":"Sir, we have added your account as a beneficiary. Our bank allows the first payment after its activation period, and we will pay as soon as it is over.",
 "hi":"Sir, aapka account beneficiary mein add kar diya hai. Bank pehla payment activation time ke baad hi allow karta hai, time complete hote hi payment kar denge."},
{"step_key":"release_reminder","title":"Release reminder","sides":["BUY"],
 "en":"Sir, kindly check your account and release the USDT; the payment was sent a while ago.",
 "hi":"Sir, kindly account check karke USDT release kar dijiye, payment kuch der pehle bhej diya tha."}
]$json$::jsonb) as x(step_key text, title text, sides jsonb, stages jsonb, en text, hi text)
  loop
    if exists (select 1 from public.copilot_playbook_entries e where e.kind = 'step' and e.step_key = r.step_key and e.status in ('approved', 'tentative')) then
      continue;
    end if;
    insert into public.copilot_playbook_topics (title, seed_batch, created_at, updated_at)
    values (r.title, v_batch, clock_timestamp(), clock_timestamp())
    returning id into v_topic;
    insert into public.copilot_playbook_entries (topic_id, kind, step_key, title, status, source, scope, reply_en, reply_hi,
                                                 expires_at, seed_batch, created_at, updated_at)
    values (v_topic, 'step', r.step_key, r.title, 'tentative', 'seed',
            jsonb_strip_nulls(jsonb_build_object('sides', r.sides, 'stages', r.stages)),
            r.en, r.hi, now() + make_interval(days => v_days), v_batch, clock_timestamp(), clock_timestamp())
    returning id into v_entry;
    insert into public.copilot_inbox_items (kind, question_text, context, entry_id, created_at)
    values ('seed', r.title, jsonb_build_object('seed_batch', v_batch, 'step_key', r.step_key, 'stages', coalesce(r.stages, '[]'::jsonb)),
            v_entry, clock_timestamp());
  end loop;

  for r in
    select x.*
    from jsonb_to_recordset($json$[
{"topic":"Can I pay now?","sides":["SELL"],
 "variants":[{"stages":["sell.kyc.pending","sell.kyc.review","sell.kyc.call"],"client_states":["approved"],
   "en":"Sir, your KYC is already on file with us, so this will be quick. We will share the payment details as soon as your verification is complete.",
   "hi":"Sir, aapka KYC hamare paas pehle se hai, isliye jaldi ho jayega. Verification complete hote hi payment details share kar denge.",
   "example":[{"from":"us","text":"Which bank will you use to pay, sir?"},{"from":"client","text":"sbi"},{"from":"client","text":"Can I pay now?"}]}]},
{"topic":"How long will it take?","sides":["SELL"],
 "variants":[{"stages":["sell.kyc.pending","sell.kyc.review","sell.kyc.call"],"client_states":["approved"],
   "en":"Just a moment, sir. Your KYC is on file with us, so it will not take long; we will share the payment details as soon as your verification is complete.",
   "hi":"Bas ek minute sir. Aapka KYC hamare paas hai, isliye zyada time nahi lagega. Verification complete hote hi payment details share kar denge.",
   "example":[{"from":"us","text":"Which bank will you use to pay, sir?"},{"from":"client","text":"hdfc"},{"from":"client","text":"How much time?"}]}]},
{"topic":"Client asks us to hurry","sides":["SELL"],
 "variants":[{"stages":["sell.kyc.pending","sell.kyc.review","sell.kyc.call"],"client_states":["approved"],
   "en":"Sure, sir. Your KYC is on file with us, so this will be quick. We will share the details here as soon as your verification is complete.",
   "hi":"Sure sir, aapka KYC hamare paas hai, isliye jaldi ho jayega. Verification complete hote hi details yahin share kar denge.",
   "example":[{"from":"us","text":"Which bank will you use to pay, sir?"},{"from":"client","text":"kotak"},{"from":"client","text":"Please do it fast"}]}]},
{"title":"Payment failed or limit reached","sides":["SELL"],
 "questions":[{"t":"Payment failed"},{"t":"My payment is failing"},{"t":"Payment is not going"},{"t":"Transaction declined"},{"t":"UPI limit exceeded"},{"t":"Bank limit reached"},{"t":"Payment fail ho raha hai","l":"hi"},{"t":"Limit khatam ho gayi","l":"hi"},{"t":"Payment nahi ja raha","l":"hi"}],
 "variants":[{"stages":["sell.pay.ready"],
   "en":"No problem, sir. If your UPI limit is reached, please try another UPI app or another bank account in your own name, or try again after your limit resets. If it fails again, please share a screenshot.",
   "hi":"Koi baat nahi sir. Agar UPI limit khatam ho gayi hai to apne naam ke kisi doosre bank account ya UPI app se try kijiye, ya limit reset hone ke baad try kijiye. Phir bhi fail ho to screenshot share kijiye.",
   "example":[{"from":"us","text":"[upi]"},{"from":"us","text":"Please pay on it, sir."},{"from":"client","text":"Payment failed"}]}]},
{"title":"Already verified","sides":["SELL"],
 "questions":[{"t":"I am already verified"},{"t":"I have done KYC with you before"},{"t":"I have traded with you before"},{"t":"Why again?"},{"t":"KYC already done"},{"t":"Mera KYC ho chuka hai","l":"hi"},{"t":"Pehle bhi trade kiya hai","l":"hi"},{"t":"Phir se KYC kyu?","l":"hi"}],
 "variants":[
  {"stages":["sell.kyc.pending","sell.kyc.review","sell.kyc.call"],"client_states":["approved"],
   "en":"Yes, sir, your KYC is on file with us. We will share the payment details as soon as your verification is complete.",
   "hi":"Ji sir, aapka KYC hamare paas hai. Verification complete hote hi payment details share kar denge.",
   "example":[{"from":"us","text":"Which bank will you use to pay, sir?"},{"from":"client","text":"I am already verified"}]},
  {"stages":["sell.kyc.pending","sell.kyc.review","sell.kyc.call"],"client_states":["new","linked"],
   "en":"Sir, we need this verification once for every account with us. Please share the requested details; it takes only a few minutes.",
   "hi":"Sir, har account ke liye yeh verification sirf ek hi baar hota hai. Please maangi gayi details share kar dijiye, bas kuch minute lagte hain.",
   "example":[{"from":"us","text":"May I kindly request you to share your Aadhaar card (front and back) and mobile number."},{"from":"client","text":"I have done KYC before"}]}]},
{"title":"Trading again after the order",
 "questions":[{"t":"Can I buy again?"},{"t":"Can I trade again?"},{"t":"I want to place another order"},{"t":"Can I come to you again?"},{"t":"Next time order kaise karu?","l":"hi"},{"t":"Phir se order kar sakta hoon?","l":"hi"}],
 "variants":[{"stages":["done"],
   "en":"Yes, sir. You can place a new order on our ad any time.",
   "hi":"Ji sir, aap kabhi bhi hamare ad par naya order place kar sakte hain.",
   "example":[{"from":"system","text":"Order completed."},{"from":"client","text":"Can I buy again?"}]}]},
{"title":"How much will I get after TDS?","sides":["BUY"],
 "questions":[{"t":"How much will I get?"},{"t":"How much will you pay me?"},{"t":"What is the final amount?"},{"t":"How much after TDS?"},{"t":"Kitna milega?","l":"hi"},{"t":"Kitne paise aayenge?","l":"hi"},{"t":"TDS ke baad kitna?","l":"hi"}],
 "variants":[
  {"stages":["buy.details","buy.pay.processing","buy.pay.cooling"],
   "en":"Sir, after the 1% TDS of ₹{tds_amount}, we will pay you ₹{net_amount}.",
   "hi":"Sir, ₹{tds_amount} ka 1% TDS katne ke baad hum aapko ₹{net_amount} pay karenge.",
   "example":[{"from":"us","text":"Kindly share your PAN card and mobile number, sir."},{"from":"client","text":"How much will I get?"}]},
  {"stages":["buy.pay.sent"],
   "en":"Sir, after the 1% TDS of ₹{tds_amount}, we have paid you ₹{net_amount}.",
   "hi":"Sir, ₹{tds_amount} ka 1% TDS katne ke baad humne aapko ₹{net_amount} pay kiya hai.",
   "example":[{"from":"system","text":"The order was marked as paid."},{"from":"client","text":"Why did I get less?"}]}]},
{"title":"Pay from your own account, no third party","sides":["BUY"],
 "questions":[{"t":"Third party payments not allowed"},{"t":"Pay from your business account only"},{"t":"Only genuine money please"},{"t":"Fresh money only"},{"t":"No third party payment"},{"t":"Pay from your own account"},{"t":"Apne account se hi payment karna","l":"hi"},{"t":"Third party se payment mat karna","l":"hi"}],
 "variants":[{
   "en":"Sure, sir. We pay only from our own company bank account, never from a third party.",
   "hi":"Sure sir, hum sirf apne company bank account se hi payment karte hain, kisi third party se nahi.",
   "example":[{"from":"us","text":"Kindly share your PAN card and mobile number, sir."},{"from":"client","text":"Third party payments not allowed"}]}]}
]$json$::jsonb) as x(topic text, title text, sides jsonb, questions jsonb, variants jsonb)
  loop
    if r.topic is not null then
      select t.id into v_topic from public.copilot_playbook_topics t
       where t.title = r.topic and exists (select 1 from public.copilot_playbook_entries e where e.topic_id = t.id and e.status <> 'retired')
       order by t.created_at limit 1;
      if v_topic is null then
        raise notice 'Copilot seed: question "%" not found; its returning-client reply was not added', r.topic;
        continue;
      end if;
    else
      insert into public.copilot_playbook_topics (title, seed_batch, created_at, updated_at)
      values (r.title, v_batch, clock_timestamp(), clock_timestamp())
      returning id into v_topic;
      insert into public.copilot_playbook_questions (topic_id, question_text, normalized, language, source, created_at)
      select v_topic, q ->> 't', public.copilot_normalize(q ->> 't'), coalesce(q ->> 'l', 'en'), 'seed', clock_timestamp()
      from jsonb_array_elements(coalesce(r.questions, '[]'::jsonb)) q
      where not exists (select 1 from public.copilot_playbook_questions q2
                         where q2.normalized = public.copilot_normalize(q ->> 't')
                           and exists (select 1 from public.copilot_playbook_entries e2 where e2.topic_id = q2.topic_id and e2.status <> 'retired'))
      on conflict on constraint copilot_playbook_questions_unique do nothing;
    end if;

    for w in select * from jsonb_array_elements(coalesce(r.variants, '[]'::jsonb))
    loop
      insert into public.copilot_playbook_entries (topic_id, kind, step_key, title, status, source, scope, reply_en, reply_hi,
                                                   expires_at, seed_batch, created_at, updated_at)
      values (v_topic, 'reply', null, (select t.title from public.copilot_playbook_topics t where t.id = v_topic), 'tentative', 'seed',
              jsonb_strip_nulls(jsonb_build_object(
                'sides', r.sides,
                'stages', case when coalesce(jsonb_array_length(w -> 'stages'), 0) > 0 then w -> 'stages' end,
                'client_states', case when coalesce(jsonb_array_length(w -> 'client_states'), 0) > 0 then w -> 'client_states' end)),
              w ->> 'en', w ->> 'hi', now() + make_interval(days => v_days), v_batch, clock_timestamp(), clock_timestamp())
      returning id into v_entry;

      if jsonb_typeof(w -> 'example') = 'array' and jsonb_array_length(w -> 'example') > 0 then
        v_n := jsonb_array_length(w -> 'example');
        select concat_ws(E'\n',
                 (select 'situation: ' || s.label from public.copilot_situations s where s.code = (w -> 'stages' ->> 0)),
                 (select string_agg((l.val ->> 'from') || ': ' || (l.val ->> 'text'), E'\n' order by l.ord)
                  from jsonb_array_elements(w -> 'example') with ordinality as l(val, ord)
                  where l.ord < v_n or (l.val ->> 'from') <> 'client'))
          into v_ctx;
        if nullif(btrim(coalesce(v_ctx, '')), '') is not null then
          insert into public.copilot_playbook_examples (entry_id, situation, chat, context_text, source, created_at)
          values (v_entry, w -> 'stages' ->> 0, w -> 'example', v_ctx, 'seed', clock_timestamp());
        end if;
      end if;

      insert into public.copilot_inbox_items (kind, question_text, context, entry_id, created_at)
      values ('seed', coalesce(r.questions -> 0 ->> 't', r.topic),
              jsonb_build_object('seed_batch', v_batch, 'stages', coalesce(w -> 'stages', '[]'::jsonb),
                                 'client_states', coalesce(w -> 'client_states', '[]'::jsonb)),
              v_entry, clock_timestamp());
    end loop;
  end loop;

  insert into public.copilot_playbook_questions (topic_id, question_text, normalized, language, source, created_at)
  select t.id, q.t, public.copilot_normalize(q.t), q.l, 'seed', clock_timestamp()
  from public.copilot_playbook_topics t
  cross join (values ('Why you paid less?', 'en'), ('You paid less', 'en'), ('The amount is short', 'en'), ('Why did you deduct 1%?', 'en'),
                     ('Amount kam aaya', 'hi'), ('Pura amount nahi aaya', 'hi')) as q(t, l)
  where t.title = 'Why 1% TDS is deducted'
    and exists (select 1 from public.copilot_playbook_entries e where e.topic_id = t.id and e.status <> 'retired')
    and not exists (select 1 from public.copilot_playbook_questions q2
                     where q2.normalized = public.copilot_normalize(q.t)
                       and exists (select 1 from public.copilot_playbook_entries e2 where e2.topic_id = q2.topic_id and e2.status <> 'retired'))
  on conflict on constraint copilot_playbook_questions_unique do nothing;
end
$seed$;