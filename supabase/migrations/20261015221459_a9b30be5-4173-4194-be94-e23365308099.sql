-- Copilot v2 · CP-4: situation-aware Playbook. Functional only, approvers only.
-- The same client question needs a different reply in a different situation ("Can I pay now?" before and after
-- KYC), so a Playbook question now has one reply per situation, phrasings belong to the question, and each reply keeps
-- the chats it was used in, so a new chat brings up the reply used in chats like it.
--
-- 1. copilot_situations       what the client is waiting for, as data. Codes are a tree: a reply for "sell.kyc"
--                             covers every KYC step, including steps added later, so approved replies are never lost
--                             when situations are split or added; labels can change, codes never do.
-- 2. copilot_teams            whose number a reply gives ({contact:<team>}); contact numbers belong to a team; approvers
--                             can add teams.
-- 3. copilot_playbook_topics  the questions. Phrasings move from replies to questions (shared by every situation
--                             reply); each existing reply becomes its own question (same id), nothing is lost. Replies get
--                             "stages" in scope and out-of-date flags for a language copy left behind by an edit.
-- 4. copilot_playbook_examples the chat before a reply each time it is sent or approved (masked, latest 12 per reply).
-- 5. copilot_situation_marks  an approver's correction of a chat's situation (+ copilot_set_order_situation).
-- 6. copilot_match_playbook   best phrasing per question, then every live reply with fits, specificity and how closely
--                             this chat resembles its example chats.
-- 7. copilot_learn_apply      adds "widen" and "variant", keeps the example chat; phrasings join the question unless
--                             already there or nearly identical. copilot_undo_learning knows the new actions.
-- 8. Phrasings and examples   copilot_add_question by question; pending lists and embedding writes by question.
-- 9. copilot_stats            questions, out-of-date copies, situation corrections; coverage counts replies that applied.
-- 10. Access                  approvers read; writes that need checks go through functions.
-- 11. House style             Hinglish rules for Hindi replies, the teams, numbers only when asked (only when the style
--                             was never edited).
-- 12. Seed re-cut             the untouched tentative seed is replaced by questions with situation replies, each with a
--                             typical example chat; every approved, edited, used or retired reply stays as it is.
-- 13. Out-of-date copies      flags copies already left behind by edits made before this change.

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Situations
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.copilot_situations (
  code text primary key check (code ~ '^[a-z]+(\.[a-z_]+)*$'),
  side text check (side in ('BUY', 'SELL')),
  label text not null check (length(btrim(label)) between 1 and 60),
  description text not null check (length(btrim(description)) between 1 and 300),
  detectable boolean not null default true,
  sort int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.copilot_situations is
  'Copilot situations: what the client is waiting for. Codes are a tree (a reply for sell.kyc covers sell.kyc.call and any step added later). detectable = set by the chat detector; group codes only scope replies.';

insert into public.copilot_situations (code, side, label, description, detectable, sort) values
  ('sell.kyc', 'SELL', 'KYC and verification', 'Any step before the client is verified: documents, our checks or the KYC team''s verification call', false, 10),
  ('sell.kyc.pending', 'SELL', 'KYC pending', 'We asked for KYC documents or details; the client has not shared them yet', true, 11),
  ('sell.kyc.review', 'SELL', 'Checking KYC', 'The client shared the documents or details; we are checking them', true, 12),
  ('sell.kyc.call', 'SELL', 'Verification call', 'One-time verification call by our KYC team', true, 13),
  ('sell.pay', 'SELL', 'Payment', 'Any step after verification: the client pays, then we check the payment', false, 20),
  ('sell.pay.ready', 'SELL', 'Client can pay', 'Verified or no KYC needed; payment details shared or shown in the order; waiting for the client''s payment', true, 21),
  ('sell.pay.checking', 'SELL', 'Checking payment', 'The client marked the order as paid; we are checking the money', true, 22),
  ('buy.details', 'BUY', 'Details pending', 'We asked the client for PAN, mobile number or bank details; not shared yet', true, 30),
  ('buy.pay', 'BUY', 'Payment', 'Any step of our payment to the client', false, 40),
  ('buy.pay.processing', 'BUY', 'We are paying', 'We are processing the payment to the client', true, 41),
  ('buy.pay.cooling', 'BUY', 'Beneficiary activation', 'We added the client''s bank account; the bank allows the first payment after a waiting period', true, 42),
  ('buy.pay.sent', 'BUY', 'Waiting for release', 'We marked the order as paid; waiting for the client to release the USDT', true, 43),
  ('done', null, 'Completed', 'The order is completed', true, 90),
  ('cancelled', null, 'Cancelled', 'The order was cancelled', true, 91),
  ('appeal', null, 'In appeal', 'The order is under appeal on Binance', true, 92);

-- A reply limited to p_scope_code applies in p_code: the same code, or a step inside it.
create or replace function public.copilot_situation_covers(p_scope_code text, p_code text)
returns boolean
language sql immutable
set search_path = public
as $$
  select p_code is not null and p_scope_code is not null
     and (p_code = p_scope_code or left(p_code, length(p_scope_code) + 1) = p_scope_code || '.')
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Teams: whose number a reply gives ({contact:<team>}). Contact numbers belong to a team; approvers can add
--    teams. (No contact numbers were saved yet when this ran.)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.copilot_teams (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{0,23}$'),
  label text not null check (length(btrim(label)) between 1 and 40),
  description text not null default '' check (length(description) <= 300),
  sort int not null default 100,
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
comment on table public.copilot_teams is 'Company teams whose numbers Copilot replies may give, as {contact:<code>}.';
insert into public.copilot_teams (code, label, description, sort) values
  ('kyc', 'KYC team', 'KYC and the one-time verification call for new clients', 10),
  ('rm', 'Relationship team', 'Looks after clients whose KYC is done', 20),
  ('support', 'Support', 'Help with anything else', 30);
insert into public.copilot_teams (code, label, description, sort, active)
select 'other', 'Other', '', 90, true where exists (select 1 from public.copilot_contacts where purpose = 'other');
do $teams$
declare
  v_name text;
begin
  select c.conname into v_name
  from pg_constraint c
  where c.conrelid = 'public.copilot_contacts'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%purpose%';
  if v_name is not null then
    execute format('alter table public.copilot_contacts drop constraint %I', v_name);
  end if;
end
$teams$;
alter table public.copilot_contacts
  add constraint copilot_contacts_team_fkey foreign key (purpose) references public.copilot_teams (code) on update cascade;
comment on column public.copilot_contacts.purpose is 'The team (copilot_teams.code) this number belongs to.';
create trigger copilot_teams_touch before update on public.copilot_teams
  for each row execute function public.copilot_touch_updated();

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Questions (topics). Each existing reply becomes its own question with the same id.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.copilot_playbook_topics (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 160),
  seed_batch text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
comment on table public.copilot_playbook_topics is
  'Copilot Playbook questions: phrasings belong here and are shared by the question''s replies (one per situation).';

-- Replies: the question they answer, and out-of-date flags for a language copy left behind by an edit.
alter table public.copilot_playbook_entries
  add column topic_id uuid references public.copilot_playbook_topics (id) on delete restrict,
  add column reply_en_stale boolean not null default false,
  add column reply_hi_stale boolean not null default false;
create index copilot_playbook_entries_topic_idx on public.copilot_playbook_entries (topic_id);

-- "stages" (situation codes) joins the scope keys.
create or replace function public.copilot_scope_valid(p_scope jsonb)
returns boolean
language sql immutable
set search_path = public
as $$
  select jsonb_typeof(p_scope) = 'object'
     and not exists (
       select 1 from jsonb_each(p_scope) e
       where e.key not in ('sides', 'categories', 'account_ids', 'statuses', 'client_states', 'stages')
          or jsonb_typeof(e.value) <> 'array'
          or exists (select 1
                     from jsonb_array_elements(case when jsonb_typeof(e.value) = 'array' then e.value else '[]'::jsonb end) v
                     where jsonb_typeof(v) <> 'string'))
$$;

-- Versioning: reply wording, scope, status, note and risk are a new version. Use counts, the question link, the
-- title copy (the question's title is the one shown) and the language flags are not, and do not move updated_at.
-- A language copy edited alone leaves the other one out of date until it is rewritten or confirmed. Not when the
-- edited copy was written by the AI (it is a translation of the other, so correcting it changes no meaning) or was
-- itself out of date (rewriting it only brings it up to date). A flag the same update sets on purpose is kept
-- ("Still right", or a restored version's own flags).
create or replace function public.copilot_entries_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_en_set boolean;
  v_hi_set boolean;
begin
  if new.status <> 'tentative' then
    new.expires_at := null;
  end if;
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := coalesce(new.updated_by, new.created_by);
    new.reply_en_stale := coalesce(new.reply_en_stale, false) and new.reply_en is not null;
    new.reply_hi_stale := coalesce(new.reply_hi_stale, false) and new.reply_hi is not null;
  else
    v_en_set := new.reply_en_stale is distinct from old.reply_en_stale;
    v_hi_set := new.reply_hi_stale is distinct from old.reply_hi_stale;
    if new.reply_en is distinct from old.reply_en then
      if not v_en_set then new.reply_en_stale := false; end if;
      if old.reply_en is not null and not old.reply_en_stale and not old.reply_en_auto and not v_hi_set
         and new.reply_hi is not distinct from old.reply_hi and new.reply_hi is not null then
        new.reply_hi_stale := true;
      end if;
    end if;
    if new.reply_hi is distinct from old.reply_hi then
      if not v_hi_set then new.reply_hi_stale := false; end if;
      if old.reply_hi is not null and not old.reply_hi_stale and not old.reply_hi_auto and not v_en_set
         and new.reply_en is not distinct from old.reply_en and new.reply_en is not null then
        new.reply_en_stale := true;
      end if;
    end if;
    if new.reply_en is null then new.reply_en_stale := false; end if;
    if new.reply_hi is null then new.reply_hi_stale := false; end if;
    if (new.status, new.scope, new.reply_en, new.reply_hi, new.internal_note, new.risk, new.kind,
        new.step_key, new.expires_at, new.reply_en_auto, new.reply_hi_auto)
       is distinct from
       (old.status, old.scope, old.reply_en, old.reply_hi, old.internal_note, old.risk, old.kind,
        old.step_key, old.expires_at, old.reply_en_auto, old.reply_hi_auto) then
      new.version := old.version + 1;
      new.updated_at := now();
      new.updated_by := coalesce(auth.uid(), new.updated_by);
    else
      new.version := old.version;
      new.updated_at := old.updated_at;
      new.updated_by := case
        when (new.reply_en_stale, new.reply_hi_stale) is distinct from (old.reply_en_stale, old.reply_hi_stale)
          then coalesce(auth.uid(), new.updated_by)
        else old.updated_by end;
    end if;
  end if;
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved') then
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_by := coalesce(new.approved_by, new.updated_by);
  end if;
  return new;
end;
$$;

-- Each version keeps its own out-of-date flags too, so restoring a version restores them.
create or replace function public.copilot_entries_after_write()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.version <> old.version then
    insert into public.copilot_playbook_versions (entry_id, version, snapshot, changed_by)
    values (new.id, new.version,
            jsonb_build_object(
              'title', new.title, 'status', new.status, 'kind', new.kind, 'step_key', new.step_key,
              'scope', new.scope, 'reply_en', new.reply_en, 'reply_hi', new.reply_hi,
              'reply_en_auto', new.reply_en_auto, 'reply_hi_auto', new.reply_hi_auto,
              'reply_en_stale', new.reply_en_stale, 'reply_hi_stale', new.reply_hi_stale,
              'internal_note', new.internal_note, 'risk', new.risk, 'expires_at', new.expires_at),
            new.updated_by)
    on conflict (entry_id, version) do nothing;
  end if;
  return null;
end;
$$;

-- Backfill: one question per existing reply (same id), phrasings follow.
insert into public.copilot_playbook_topics (id, title, seed_batch, created_by, created_at, updated_by, updated_at)
select e.id, e.title, e.seed_batch, e.created_by, e.created_at, e.updated_by, e.updated_at
from public.copilot_playbook_entries e;
update public.copilot_playbook_entries set topic_id = id where topic_id is null;
alter table public.copilot_playbook_entries alter column topic_id set not null;

alter table public.copilot_playbook_questions add column topic_id uuid references public.copilot_playbook_topics (id) on delete cascade;
update public.copilot_playbook_questions set topic_id = entry_id where topic_id is null;
alter table public.copilot_playbook_questions alter column topic_id set not null;
alter table public.copilot_playbook_questions alter column entry_id drop not null;
do $fk$
declare
  v_name text;
begin
  -- A phrasing now outlives the reply it was learned with.
  select c.conname into v_name
  from pg_constraint c
  where c.conrelid = 'public.copilot_playbook_questions'::regclass and c.contype = 'f'
    and c.confrelid = 'public.copilot_playbook_entries'::regclass;
  if v_name is not null then
    execute format('alter table public.copilot_playbook_questions drop constraint %I', v_name);
  end if;
end
$fk$;
alter table public.copilot_playbook_questions
  add constraint copilot_playbook_questions_entry_id_fkey foreign key (entry_id)
  references public.copilot_playbook_entries (id) on delete set null;
alter table public.copilot_playbook_questions drop constraint copilot_playbook_questions_unique;
alter table public.copilot_playbook_questions add constraint copilot_playbook_questions_unique unique (topic_id, normalized);
create index copilot_playbook_questions_topic_idx on public.copilot_playbook_questions (topic_id);
comment on table public.copilot_playbook_questions is
  'Client phrasings of each Playbook question (personal numbers masked); entry_id = the reply it was learned with.';

-- Renaming a question renames its replies' title copy (not a new version of the replies).
create or replace function public.copilot_topics_after_title()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update public.copilot_playbook_entries set title = new.title where topic_id = new.id and title is distinct from new.title;
  return null;
end;
$$;
create trigger copilot_topics_title after update of title on public.copilot_playbook_topics
  for each row when (old.title is distinct from new.title) execute function public.copilot_topics_after_title();
create trigger copilot_topics_touch before update on public.copilot_playbook_topics
  for each row execute function public.copilot_touch_updated();

-- Learning events: two new actions.
do $ev$
declare
  v_name text;
begin
  select c.conname into v_name
  from pg_constraint c
  where c.conrelid = 'public.copilot_learning_events'::regclass and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%action%';
  if v_name is not null then
    execute format('alter table public.copilot_learning_events drop constraint %I', v_name);
  end if;
end
$ev$;
alter table public.copilot_learning_events add constraint copilot_learning_events_action_check
  check (action in ('created', 'merged', 'promoted', 'updated', 'conflict', 'replaced', 'widened', 'variant'));

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 4. Example chats: the chat before a reply, each time it is sent or approved (masked; the latest 12 per reply)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.copilot_playbook_examples (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.copilot_playbook_entries (id) on delete cascade,
  situation text,
  chat jsonb not null check (jsonb_typeof(chat) = 'array'),
  context_text text not null check (length(btrim(context_text)) between 1 and 2000),
  context_embedding vector(1536),
  embedding_model text,
  source text not null check (source in ('seed', 'chat')),
  order_number text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index copilot_playbook_examples_entry_idx on public.copilot_playbook_examples (entry_id, created_at desc);
comment on table public.copilot_playbook_examples is
  'Chats a Playbook reply was used in (masked): new chats are compared with them, so a reply comes up again in chats like these.';
alter table public.copilot_learning_events
  add column example_id uuid references public.copilot_playbook_examples (id) on delete set null;
alter table public.copilot_requests add column context_embedding vector(1536);
comment on column public.copilot_requests.context_embedding is 'Embedding of the chat before the question (compared with example chats).';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 5. Situation marks: an approver's correction of one chat's situation (latest wins; code null = detected again)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.copilot_situation_marks (
  id uuid primary key default gen_random_uuid(),
  order_number text not null check (order_number ~ '^[0-9A-Za-z_-]{6,40}$'),
  side text check (side in ('BUY', 'SELL')),
  detected_code text,
  code text references public.copilot_situations (code),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index copilot_situation_marks_order_idx on public.copilot_situation_marks (order_number, created_at desc);
comment on table public.copilot_situation_marks is
  'Approvers'' corrections of a chat''s situation; the detector''s answer is kept for comparison (detection quality).';

create or replace function public.copilot_set_order_situation(p_order_number text, p_side text, p_code text, p_detected text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sit public.copilot_situations%rowtype;
  v_id uuid;
  v_at timestamptz;
begin
  if not public.copilot_is_approver(v_uid) then
    raise exception 'Only Copilot approvers can change a chat''s situation' using errcode = '42501';
  end if;
  if p_order_number is null or p_order_number !~ '^[0-9A-Za-z_-]{6,40}$' then
    raise exception 'Invalid order number' using errcode = '22023';
  end if;
  if p_side is null or p_side not in ('BUY', 'SELL') then
    raise exception 'Unknown side' using errcode = '22023';
  end if;
  if p_code is not null then
    select * into v_sit from public.copilot_situations where code = p_code;
    if not found or not v_sit.active or not v_sit.detectable or (v_sit.side is not null and v_sit.side <> p_side)
       or p_code in ('done', 'cancelled', 'appeal', 'sell.pay.checking', 'buy.pay.sent') then
      raise exception 'This situation cannot be set for this order' using errcode = '22023';
    end if;
  end if;
  insert into public.copilot_situation_marks (order_number, side, detected_code, code, created_by)
  values (p_order_number, p_side,
          case when exists (select 1 from public.copilot_situations s where s.code = p_detected) then p_detected end,
          p_code, v_uid)
  returning id, created_at into v_id, v_at;
  return jsonb_build_object('id', v_id, 'order_number', p_order_number, 'code', p_code, 'at', v_at);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 6. Matching (server only): best phrasing per question, then every live reply of the top questions, each with
--    fits (applies to this order now), specificity (0 any situation, 2 a group such as sell.kyc, 3 one step;
--    -1 when it does not fit) and context_similarity (how closely this chat resembles the chats the reply was used
--    in). The caller offers the most specific fitting reply per question, the one used in the most similar chat first.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
drop function public.copilot_match_playbook(jsonb, text, text, uuid, text, text, boolean, boolean, real, int);
create function public.copilot_match_playbook(
  p_embeddings jsonb,
  p_side text,
  p_category text,
  p_account_id uuid,
  p_status text,
  p_client_state text,
  p_include_tentative boolean,
  p_include_conflicts boolean,
  p_min_similarity real default 0,
  p_limit int default 5,
  p_stage text default null,
  p_context_embedding jsonb default null
)
returns table (
  entry_id uuid, topic_id uuid, question_id uuid, question_text text, input_index int, similarity double precision,
  status text, kind text, step_key text, title text, scope jsonb, reply_en text, reply_hi text,
  reply_en_auto boolean, reply_hi_auto boolean, reply_en_stale boolean, reply_hi_stale boolean,
  risk text, internal_note text, conflict_open boolean, version int, use_count int, fits boolean, specificity int,
  context_similarity double precision
)
language sql stable security definer
set search_path = public
as $$
  with emb as (
    select (e.ord - 1)::int as input_index, public.copilot_to_vector(e.val) as v
    from jsonb_array_elements(case when jsonb_typeof(p_embeddings) = 'array' then p_embeddings else '[]'::jsonb end)
         with ordinality as e(val, ord)
    order by e.ord
    limit 4
  ),
  cv as (
    select public.copilot_to_vector(p_context_embedding) as v
  ),
  live as (
    select e.*
    from public.copilot_playbook_entries e
    where (e.status = 'approved'
           or (p_include_tentative and e.status = 'tentative' and (e.expires_at is null or e.expires_at > now())))
      and (p_include_conflicts or not e.conflict_open)
  ),
  best as (
    select distinct on (q.topic_id)
           q.topic_id, q.id as question_id, q.question_text, emb.input_index,
           1 - (q.embedding <=> emb.v) as similarity
    from public.copilot_playbook_questions q
    cross join emb
    where q.embedding is not null and emb.v is not null
      and exists (select 1 from live l where l.topic_id = q.topic_id)
    order by q.topic_id, q.embedding <=> emb.v
  ),
  ranked as (
    select b.*
    from best b
    where b.similarity >= coalesce(p_min_similarity, 0)
    order by b.similarity desc
    limit greatest(1, least(coalesce(p_limit, 5), 20))
  ),
  v as (
    select l.id, l.topic_id, t.question_id, t.question_text, t.input_index, t.similarity,
           l.status, l.kind, l.step_key, tp.title, l.scope, l.reply_en, l.reply_hi,
           l.reply_en_auto, l.reply_hi_auto, l.reply_en_stale, l.reply_hi_stale,
           l.risk, l.internal_note, l.conflict_open, l.version, l.use_count,
           (    (coalesce(jsonb_array_length(l.scope -> 'sides'), 0) = 0 or l.scope -> 'sides' ? coalesce(p_side, ''))
            and (coalesce(jsonb_array_length(l.scope -> 'categories'), 0) = 0 or l.scope -> 'categories' ? coalesce(p_category, ''))
            and (coalesce(jsonb_array_length(l.scope -> 'account_ids'), 0) = 0 or l.scope -> 'account_ids' ? coalesce(p_account_id::text, ''))
            and (coalesce(jsonb_array_length(l.scope -> 'statuses'), 0) = 0 or l.scope -> 'statuses' ? coalesce(p_status, ''))
            and (coalesce(jsonb_array_length(l.scope -> 'client_states'), 0) = 0 or l.scope -> 'client_states' ? coalesce(p_client_state, ''))
           ) as base_fit,
           coalesce(jsonb_array_length(l.scope -> 'stages'), 0) = 0 as any_stage,
           coalesce((select max(cardinality(string_to_array(s.code, '.')))
                     from jsonb_array_elements_text(case when jsonb_typeof(l.scope -> 'stages') = 'array' then l.scope -> 'stages' else '[]'::jsonb end) as s(code)
                     where public.copilot_situation_covers(s.code, p_stage)), 0) as stage_depth,
           (select max(1 - (x.context_embedding <=> cv.v))
              from public.copilot_playbook_examples x, cv
             where x.entry_id = l.id and x.context_embedding is not null and cv.v is not null) as context_similarity
    from live l
    join ranked t on t.topic_id = l.topic_id
    join public.copilot_playbook_topics tp on tp.id = l.topic_id
  ),
  r as (
    select v.*, (v.base_fit and (v.any_stage or v.stage_depth > 0)) as fits_now
    from v
  )
  select r.id, r.topic_id, r.question_id, r.question_text, r.input_index, r.similarity,
         r.status, r.kind, r.step_key, r.title, r.scope, r.reply_en, r.reply_hi,
         r.reply_en_auto, r.reply_hi_auto, r.reply_en_stale, r.reply_hi_stale,
         r.risk, r.internal_note, r.conflict_open, r.version, r.use_count,
         r.fits_now, case when r.fits_now then r.stage_depth else -1 end, r.context_similarity
  from r
  order by r.similarity desc, r.topic_id, r.fits_now desc, (case when r.fits_now then r.stage_depth else -1 end) desc, r.id
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 7. Learning (server only; the edge function verifies the caller and passes the user id)
-- p_relation (decided by the edge function):
--   'new'      no question matches: a new question with this reply
--   'merge'    same meaning as p_target_entry_id, which applies now; keep its wording (add the phrasing, fill a
--              missing language)
--   'update'   same meaning; the new wording replaces the reply's wording in that language
--   'widen'    same meaning as p_target_entry_id, which was limited to other situations: p_stage joins them
--   'variant'  same question (p_target_topic_id, or the question of p_target_entry_id), different answer for
--              this situation: a new reply in that question (its scope comes in p_scope)
--   'conflict' a reply that applies now answers differently -> conflict for an approved reply;
--              a tentative reply is simply replaced by the approver's answer
-- A tentative target that is merged, updated or widened becomes approved ("promoted").
-- The client's wording (p_question_text) joins the question unless it is already there or nearly identical.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
drop function public.copilot_learn_apply(uuid, text, text, uuid, text, jsonb, text, text, text, text, text, jsonb, text, text, text, uuid, uuid, uuid, boolean, jsonb);
create function public.copilot_learn_apply(
  p_user_id uuid,
  p_cause text,
  p_relation text,
  p_target_entry_id uuid,
  p_question_text text,
  p_question_embedding jsonb,
  p_question_language text,
  p_reply_language text,
  p_reply_text text,
  p_reply_other text,
  p_title text,
  p_scope jsonb,
  p_kind text default 'reply',
  p_step_key text default null,
  p_order_number text default null,
  p_account_id uuid default null,
  p_request_id uuid default null,
  p_draft_call_id uuid default null,
  p_draft_edited boolean default null,
  p_context jsonb default '{}'::jsonb,
  p_target_topic_id uuid default null,
  p_stage text default null,
  p_example_chat jsonb default null,
  p_example_text text default null,
  p_example_embedding jsonb default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_src text := case p_cause when 'sent' then 'chat_sent' when 'approved' then 'chat_approved' when 'saved' then 'chat_saved' end;
  v_lang text := p_reply_language;
  v_reply text := nullif(btrim(coalesce(p_reply_text, '')), '');
  v_other text := nullif(btrim(coalesce(p_reply_other, '')), '');
  v_qtext text := left(nullif(btrim(coalesce(p_question_text, '')), ''), 1000);
  v_stage text := nullif(btrim(coalesce(p_stage, '')), '');
  v_scope jsonb := coalesce(p_scope, '{}'::jsonb);
  v_emb vector(1536);
  v_model text;
  v_target public.copilot_playbook_entries%rowtype;
  v_topic_id uuid;
  v_entry_id uuid;
  v_question_id uuid;
  v_event_id uuid;
  v_inbox_id uuid;
  v_action text;
  v_before jsonb;
  v_keep boolean;
  v_stages jsonb;
  v_phrasing text := 'none';
  v_example_id uuid;
  v_example_emb vector(1536);
begin
  if not public.copilot_is_approver(p_user_id) then
    raise exception 'Only Copilot approvers can teach the Playbook' using errcode = '42501';
  end if;
  if v_src is null then raise exception 'Unknown cause %', p_cause using errcode = '22023'; end if;
  if p_relation is null or p_relation not in ('new', 'merge', 'update', 'widen', 'variant', 'conflict') then
    raise exception 'Unknown relation %', p_relation using errcode = '22023';
  end if;
  if v_reply is null then raise exception 'Reply text is required' using errcode = '22023'; end if;
  if v_lang is null or v_lang not in ('en', 'hi') or coalesce(p_question_language, 'en') not in ('en', 'hi') then
    raise exception 'Unknown language' using errcode = '22023';
  end if;
  if not public.copilot_scope_valid(v_scope) then raise exception 'Invalid scope' using errcode = '22023'; end if;
  -- An unknown situation code never fails a save; it is simply not used.
  if v_stage is not null and not exists (select 1 from public.copilot_situations s where s.code = v_stage) then
    v_stage := null;
  end if;

  v_emb := public.copilot_to_vector(p_question_embedding);
  if v_emb is null and p_request_id is not null then
    select r.question_embedding into v_emb from public.copilot_requests r
     where r.id = p_request_id and public.copilot_normalize(r.question_text) = public.copilot_normalize(v_qtext);
  end if;
  select c.embedding_model into v_model from public.copilot_config c where c.id;

  if p_relation in ('merge', 'update', 'widen', 'conflict') or (p_relation = 'variant' and p_target_entry_id is not null) then
    select * into v_target from public.copilot_playbook_entries where id = p_target_entry_id for update;
    if not found or v_target.status = 'retired' then
      raise exception 'Target entry not found' using errcode = 'P0002';
    end if;
    v_before := to_jsonb(v_target);
    v_topic_id := v_target.topic_id;
  end if;
  if p_relation = 'variant' then
    v_topic_id := coalesce(v_topic_id, p_target_topic_id);
    if v_topic_id is null or not exists (select 1 from public.copilot_playbook_topics t where t.id = v_topic_id) then
      raise exception 'Question not found' using errcode = 'P0002';
    end if;
  end if;

  if p_relation in ('merge', 'update', 'widen') then
    v_entry_id := v_target.id;
    v_keep := (p_relation <> 'update');
    if v_target.status = 'tentative' then
      v_action := 'promoted';
    elsif p_relation = 'update' and public.copilot_normalize(case when v_lang = 'en' then v_target.reply_en else v_target.reply_hi end)
                                    is distinct from public.copilot_normalize(v_reply) then
      v_action := 'updated';
    elsif p_relation = 'widen' then
      v_action := 'widened';
      v_keep := true;
    else
      v_action := 'merged';
      v_keep := true;
    end if;

    -- widen: this situation joins the reply's situations (only when it lists any and misses this one)
    v_stages := case when jsonb_typeof(v_target.scope -> 'stages') = 'array' then v_target.scope -> 'stages' else '[]'::jsonb end;
    if p_relation = 'widen' and v_stage is not null and jsonb_array_length(v_stages) > 0
       and not exists (select 1 from jsonb_array_elements_text(v_stages) s(code) where public.copilot_situation_covers(s.code, v_stage)) then
      v_stages := v_stages || to_jsonb(v_stage);
    end if;

    if v_keep then
      -- keep the reply's wording; a human-sent text replaces only an empty or machine-translated slot
      update public.copilot_playbook_entries set
        reply_en = case when v_lang = 'en' then (case when reply_en is null or reply_en_auto then v_reply else reply_en end)
                        else coalesce(reply_en, v_other) end,
        reply_en_auto = case when v_lang = 'en' then (case when reply_en is null or reply_en_auto then false else reply_en_auto end)
                             else (case when reply_en is null then v_other is not null else reply_en_auto end) end,
        reply_hi = case when v_lang = 'hi' then (case when reply_hi is null or reply_hi_auto then v_reply else reply_hi end)
                        else coalesce(reply_hi, v_other) end,
        reply_hi_auto = case when v_lang = 'hi' then (case when reply_hi is null or reply_hi_auto then false else reply_hi_auto end)
                             else (case when reply_hi is null then v_other is not null else reply_hi_auto end) end,
        scope = case when p_relation = 'widen' and jsonb_array_length(v_stages) > 0 then jsonb_set(scope, '{stages}', v_stages) else scope end,
        status = 'approved',
        approved_by = case when status = 'approved' then approved_by else p_user_id end,
        updated_by = p_user_id
      where id = v_entry_id;
    else
      -- the new wording replaces the reply's wording; the other language follows unless written by a person
      update public.copilot_playbook_entries set
        reply_en = case when v_lang = 'en' then v_reply
                        when v_other is not null and (reply_en is null or reply_en_auto) then v_other else reply_en end,
        reply_en_auto = case when v_lang = 'en' then false
                             when v_other is not null and (reply_en is null or reply_en_auto) then true else reply_en_auto end,
        reply_hi = case when v_lang = 'hi' then v_reply
                        when v_other is not null and (reply_hi is null or reply_hi_auto) then v_other else reply_hi end,
        reply_hi_auto = case when v_lang = 'hi' then false
                             when v_other is not null and (reply_hi is null or reply_hi_auto) then true else reply_hi_auto end,
        status = 'approved',
        approved_by = case when status = 'approved' then approved_by else p_user_id end,
        updated_by = p_user_id
      where id = v_entry_id;
    end if;

    if v_action = 'promoted' then
      update public.copilot_inbox_items set status = 'resolved', resolved_by = p_user_id, resolved_at = now(),
             resolution = 'promoted_in_chat'
       where kind = 'seed' and entry_id = v_target.id and status = 'open'
      returning id into v_inbox_id;
    end if;

  else
    -- a new approved reply: a new question, a reply for this situation, a conflicting answer, or the approver's
    -- answer replacing a tentative reply
    if p_relation = 'new' then
      insert into public.copilot_playbook_topics (title, created_by, updated_by)
      values (left(coalesce(nullif(btrim(p_title), ''), left(coalesce(v_qtext, v_reply), 80)), 160), p_user_id, p_user_id)
      returning id into v_topic_id;
    end if;
    insert into public.copilot_playbook_entries (
      topic_id, kind, step_key, title, status, source, scope, reply_en, reply_hi, reply_en_auto, reply_hi_auto,
      conflict_open, approved_by, approved_at, created_by, updated_by, source_order_number)
    values (
      v_topic_id, coalesce(p_kind, 'reply'), p_step_key,
      (select t.title from public.copilot_playbook_topics t where t.id = v_topic_id),
      'approved', v_src, v_scope,
      case when v_lang = 'en' then v_reply else v_other end,
      case when v_lang = 'hi' then v_reply else v_other end,
      v_lang <> 'en' and v_other is not null,
      v_lang <> 'hi' and v_other is not null,
      p_relation = 'conflict' and v_target.status = 'approved',
      p_user_id, now(), p_user_id, p_user_id, p_order_number)
    returning id into v_entry_id;

    if p_relation = 'new' then
      v_action := 'created';
    elsif p_relation = 'variant' then
      v_action := 'variant';
    elsif v_target.status = 'tentative' then
      v_action := 'replaced';
      update public.copilot_playbook_entries set status = 'retired', updated_by = p_user_id where id = v_target.id;
      update public.copilot_inbox_items set status = 'resolved', resolved_by = p_user_id, resolved_at = now(),
             resolution = 'replaced_in_chat'
       where kind = 'seed' and entry_id = v_target.id and status = 'open'
      returning id into v_inbox_id;
    else
      v_action := 'conflict';
      update public.copilot_playbook_entries set conflict_open = true, updated_by = p_user_id where id = v_target.id;
      insert into public.copilot_inbox_items (kind, order_number, exchange_account_id, question_text, context,
                                              entry_id, other_entry_id, created_by)
      values ('conflict', p_order_number, p_account_id, v_qtext, coalesce(p_context, '{}'::jsonb),
              v_entry_id, v_target.id, p_user_id)
      returning id into v_inbox_id;
    end if;
  end if;

  -- The client's wording joins the question, unless it is already there or nearly identical to a phrasing.
  if v_qtext is not null then
    if exists (select 1 from public.copilot_playbook_questions q
                where q.topic_id = v_topic_id and q.normalized = public.copilot_normalize(v_qtext)) then
      v_phrasing := 'known';
    elsif v_emb is not null and exists (select 1 from public.copilot_playbook_questions q
                                         where q.topic_id = v_topic_id and q.embedding is not null
                                           and 1 - (q.embedding <=> v_emb) >= 0.95) then
      v_phrasing := 'similar';
    else
      insert into public.copilot_playbook_questions (topic_id, entry_id, question_text, normalized, language, embedding,
                                                     embedding_model, source, created_by)
      values (v_topic_id, v_entry_id, v_qtext, public.copilot_normalize(v_qtext), coalesce(p_question_language, 'en'), v_emb,
              case when v_emb is not null then v_model end, 'chat', p_user_id)
      on conflict on constraint copilot_playbook_questions_unique do nothing
      returning id into v_question_id;
      v_phrasing := case when v_question_id is null then 'known' else 'added' end;
    end if;
  end if;

  -- The chat this reply was used in becomes one of its examples (the latest 12 are kept).
  if jsonb_typeof(p_example_chat) = 'array' and jsonb_array_length(p_example_chat) > 0
     and nullif(btrim(coalesce(p_example_text, '')), '') is not null then
    v_example_emb := public.copilot_to_vector(p_example_embedding);
    insert into public.copilot_playbook_examples (entry_id, situation, chat, context_text, context_embedding, embedding_model,
                                                  source, order_number, created_by, created_at)
    values (v_entry_id, v_stage, p_example_chat, left(btrim(p_example_text), 2000), v_example_emb,
            case when v_example_emb is not null then v_model end, 'chat', p_order_number, p_user_id, clock_timestamp())
    returning id into v_example_id;
    delete from public.copilot_playbook_examples x
     where x.entry_id = v_entry_id and x.id <> v_example_id
       and x.id in (select y.id from public.copilot_playbook_examples y where y.entry_id = v_entry_id and y.id <> v_example_id
                    order by y.created_at desc, y.id desc offset 11);
  end if;

  if p_cause = 'sent' then
    update public.copilot_playbook_entries set use_count = use_count + 1, last_used_at = now() where id = v_entry_id;
  end if;

  if p_draft_call_id is not null then
    update public.copilot_ai_calls set
      feedback = case when p_cause = 'sent' then 'used' else 'approved' end,
      feedback_edited = coalesce(p_draft_edited, feedback_edited),
      feedback_by = p_user_id, feedback_at = now()
    where id = p_draft_call_id and feedback is distinct from 'used';
  end if;

  insert into public.copilot_learning_events (user_id, action, cause, entry_id, other_entry_id, question_id, inbox_item_id,
                                              order_number, exchange_account_id, request_id, draft_call_id,
                                              before_state, after_state, example_id)
  values (p_user_id, v_action, p_cause, v_entry_id,
          case when v_action in ('conflict', 'replaced') then v_target.id end,
          v_question_id, v_inbox_id, p_order_number, p_account_id, p_request_id, p_draft_call_id, v_before,
          (select to_jsonb(e) from public.copilot_playbook_entries e where e.id = v_entry_id), v_example_id)
  returning id into v_event_id;

  return jsonb_build_object(
    'event_id', v_event_id, 'action', v_action, 'entry_id', v_entry_id, 'topic_id', v_topic_id,
    'title', (select t.title from public.copilot_playbook_topics t where t.id = v_topic_id),
    'other_entry_id', case when v_action in ('conflict', 'replaced') then v_target.id end,
    'inbox_item_id', v_inbox_id, 'phrasing', v_phrasing, 'example_id', v_example_id,
    'stages', (select e.scope -> 'stages' from public.copilot_playbook_entries e where e.id = v_entry_id));
end;
$$;

-- Undo a learning event (any approver, within 24 hours, only while it is the latest change to the reply).
create or replace function public.copilot_undo_learning(p_user_id uuid, p_event_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_ev public.copilot_learning_events%rowtype;
  v_entry public.copilot_playbook_entries%rowtype;
  v_b jsonb;
  v_changed text := 'This entry changed after that save; edit it on the Playbook page instead';
begin
  if not public.copilot_is_approver(p_user_id) then
    raise exception 'Only Copilot approvers can undo' using errcode = '42501';
  end if;
  select * into v_ev from public.copilot_learning_events where id = p_event_id for update;
  if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;
  if v_ev.undone_at is not null then
    return jsonb_build_object('event_id', p_event_id, 'undone', false, 'reason', 'already_undone');
  end if;
  if v_ev.created_at < now() - interval '24 hours' then
    raise exception 'Undo is possible for 24 hours; edit the entry on the Playbook page instead' using errcode = '22023';
  end if;

  select * into v_entry from public.copilot_playbook_entries where id = v_ev.entry_id for update;
  if not found then raise exception 'The entry no longer exists' using errcode = 'P0002'; end if;
  if v_entry.version <> (v_ev.after_state ->> 'version')::int then
    raise exception '%', v_changed using errcode = '22023';
  end if;
  if exists (select 1 from public.copilot_learning_events l
              where l.seq > v_ev.seq and l.undone_at is null
                and (l.entry_id in (v_ev.entry_id, v_ev.other_entry_id)
                     or l.other_entry_id in (v_ev.entry_id, v_ev.other_entry_id))) then
    raise exception '%', v_changed using errcode = '22023';
  end if;

  -- The phrasing and the example chat this save added go with it.
  if v_ev.question_id is not null then
    delete from public.copilot_playbook_questions where id = v_ev.question_id;
  end if;
  if v_ev.example_id is not null then
    delete from public.copilot_playbook_examples where id = v_ev.example_id;
  end if;

  if v_ev.action in ('created', 'variant') then
    delete from public.copilot_playbook_entries where id = v_ev.entry_id;
    if v_ev.action = 'created' then
      delete from public.copilot_playbook_topics t
       where t.id = v_entry.topic_id and not exists (select 1 from public.copilot_playbook_entries e where e.topic_id = t.id);
    end if;

  elsif v_ev.action = 'conflict' then
    if not exists (select 1 from public.copilot_inbox_items where id = v_ev.inbox_item_id and status = 'open') then
      raise exception 'This conflict was already resolved in the inbox' using errcode = '22023';
    end if;
    delete from public.copilot_inbox_items where id = v_ev.inbox_item_id;
    delete from public.copilot_playbook_entries where id = v_ev.entry_id;
    update public.copilot_playbook_entries e set conflict_open = exists (
             select 1 from public.copilot_inbox_items i
             where i.kind = 'conflict' and i.status = 'open' and (i.entry_id = e.id or i.other_entry_id = e.id)),
           updated_by = p_user_id
     where e.id = v_ev.other_entry_id;

  elsif v_ev.action = 'replaced' then
    v_b := v_ev.before_state;
    delete from public.copilot_playbook_entries where id = v_ev.entry_id;
    update public.copilot_playbook_entries set
      status = v_b ->> 'status', expires_at = (v_b ->> 'expires_at')::timestamptz, updated_by = p_user_id
    where id = v_ev.other_entry_id and status = 'retired';
    if v_ev.inbox_item_id is not null then
      update public.copilot_inbox_items set status = 'open', resolved_by = null, resolved_at = null, resolution = null
       where id = v_ev.inbox_item_id and resolution = 'replaced_in_chat';
    end if;

  else
    -- merged, promoted, updated, widened: back to the reply as it was
    v_b := v_ev.before_state;
    if (v_b ->> 'version') is distinct from (v_ev.after_state ->> 'version') then
      update public.copilot_playbook_entries set
        status = v_b ->> 'status',
        expires_at = (v_b ->> 'expires_at')::timestamptz,
        approved_by = (v_b ->> 'approved_by')::uuid,
        approved_at = (v_b ->> 'approved_at')::timestamptz,
        reply_en = v_b ->> 'reply_en', reply_hi = v_b ->> 'reply_hi',
        reply_en_auto = (v_b ->> 'reply_en_auto')::boolean, reply_hi_auto = (v_b ->> 'reply_hi_auto')::boolean,
        scope = coalesce(v_b -> 'scope', scope),
        updated_by = p_user_id
      where id = v_ev.entry_id;
      -- the language flags go back too (the trigger may have marked a copy out of date)
      update public.copilot_playbook_entries set
        reply_en_stale = coalesce((v_b ->> 'reply_en_stale')::boolean, false),
        reply_hi_stale = coalesce((v_b ->> 'reply_hi_stale')::boolean, false)
      where id = v_ev.entry_id;
    end if;
    if v_ev.action = 'promoted' and v_ev.inbox_item_id is not null then
      update public.copilot_inbox_items set status = 'open', resolved_by = null, resolved_at = null, resolution = null
       where id = v_ev.inbox_item_id and resolution = 'promoted_in_chat';
    end if;
  end if;

  if v_ev.cause = 'sent' and v_ev.action in ('merged', 'promoted', 'updated', 'widened') then
    update public.copilot_playbook_entries set use_count = greatest(use_count - 1, 0) where id = v_ev.entry_id;
  end if;
  if v_ev.cause = 'approved' and v_ev.draft_call_id is not null then
    update public.copilot_ai_calls set feedback = null, feedback_edited = null, feedback_by = null, feedback_at = null
     where id = v_ev.draft_call_id and feedback = 'approved';
  end if;

  update public.copilot_learning_events set undone_at = now(), undone_by = p_user_id where id = p_event_id;
  return jsonb_build_object('event_id', p_event_id, 'undone', true, 'action', v_ev.action);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 8. Phrasings and example chats by question
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
drop function public.copilot_add_question(uuid, text, text);
create function public.copilot_add_question(
  p_topic_id uuid default null, p_text text default null, p_language text default 'en', p_entry_id uuid default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_text text := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
  v_topic uuid := p_topic_id;
  v_id uuid;
begin
  if not public.copilot_is_approver(v_uid) then
    raise exception 'Only Copilot approvers can change the Playbook' using errcode = '42501';
  end if;
  if length(v_text) < 2 or length(v_text) > 300 then
    raise exception 'Write the question in 2 to 300 characters' using errcode = '22023';
  end if;
  if v_topic is null and p_entry_id is not null then
    select e.topic_id into v_topic from public.copilot_playbook_entries e where e.id = p_entry_id;
  end if;
  if v_topic is null or not exists (select 1 from public.copilot_playbook_topics t where t.id = v_topic) then
    raise exception 'Playbook question not found' using errcode = 'P0002';
  end if;
  insert into public.copilot_playbook_questions (topic_id, entry_id, question_text, normalized, language, source, created_by)
  values (v_topic, p_entry_id, v_text, public.copilot_normalize(v_text), case when p_language = 'hi' then 'hi' else 'en' end,
          'manual', v_uid)
  on conflict on constraint copilot_playbook_questions_unique do nothing
  returning id into v_id;
  return v_id; -- null when the question already has this phrasing
end;
$$;

create or replace function public.copilot_pending_questions(p_limit int default 100)
returns table (id uuid, question_text text)
language sql stable security definer
set search_path = public
as $$
  select q.id, q.question_text
  from public.copilot_playbook_questions q
  where q.embedding is null
    and exists (select 1 from public.copilot_playbook_entries e where e.topic_id = q.topic_id and e.status <> 'retired')
  order by q.created_at, q.id
  limit greatest(1, least(coalesce(p_limit, 100), 200))
$$;

-- Example chats still to embed (seeded), and storing their embeddings (server only).
create or replace function public.copilot_pending_examples(p_limit int default 100)
returns table (id uuid, context_text text)
language sql stable security definer
set search_path = public
as $$
  select x.id, x.context_text
  from public.copilot_playbook_examples x
  join public.copilot_playbook_entries e on e.id = x.entry_id
  where x.context_embedding is null and e.status <> 'retired'
  order by x.created_at, x.id
  limit greatest(1, least(coalesce(p_limit, 100), 200))
$$;

create or replace function public.copilot_set_example_embeddings(p_items jsonb, p_model text)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_n int;
begin
  update public.copilot_playbook_examples x
     set context_embedding = public.copilot_to_vector(i.v), embedding_model = p_model
    from jsonb_to_recordset(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) as i(id uuid, v jsonb)
   where x.id = i.id and x.context_embedding is null and i.v is not null and jsonb_typeof(i.v) = 'array';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 9. Stats: questions, out-of-date copies, situation corrections; coverage counts only replies that applied
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
        'uses', coalesce(sum(e.use_count) filter (where e.status <> 'retired'), 0),
        'questions', (select count(*) from public.copilot_playbook_topics t
                      where exists (select 1 from public.copilot_playbook_entries x where x.topic_id = t.id and x.status <> 'retired')),
        'outdated_copies', count(*) filter (where e.status <> 'retired' and (e.reply_en_stale or e.reply_hi_stale)))
      from public.copilot_playbook_entries e),
    'coverage', (
      select jsonb_build_object(
        'questions', count(*),
        'approved', count(*) filter (where exists (
          select 1 from jsonb_array_elements(coalesce(r.matches, '[]'::jsonb)) m
          where m ->> 'status' = 'approved' and coalesce((m ->> 'conflict')::boolean, false) = false
            and coalesce((m ->> 'fits')::boolean, true)
            and coalesce((m ->> 'similarity')::double precision, 0) >= c.match_threshold)),
        'tentative', count(*) filter (where exists (
          select 1 from jsonb_array_elements(coalesce(r.matches, '[]'::jsonb)) m
          where m ->> 'status' = 'tentative' and coalesce((m ->> 'fits')::boolean, true)
            and coalesce((m ->> 'similarity')::double precision, 0) >= c.match_threshold)))
      from public.copilot_requests r
      where r.mode = 'suggest' and r.created_at >= v_since and r.question_text is not null),
    'situations', jsonb_build_object(
      'checked', (select count(*) from public.copilot_requests r
                  where r.mode = 'suggest' and r.created_at >= v_since and r.context ? 'situation'),
      'corrected', (select count(*) from public.copilot_situation_marks m where m.created_at >= v_since and m.code is not null),
      'changes', coalesce((
        select jsonb_agg(jsonb_build_object('detected', x.detected_code, 'set', x.code, 'n', x.n) order by x.n desc)
        from (
          select m.detected_code, m.code, count(*) as n
          from public.copilot_situation_marks m
          where m.created_at >= v_since and m.code is not null
          group by 1, 2
          order by 3 desc
          limit 20) x), '[]'::jsonb)),
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
          'entry_id', l.entry_id, 'title', coalesce(t.title, e.title), 'order_number', l.order_number,
          'undone', l.undone_at is not null) as j
        from public.copilot_learning_events l
        left join public.copilot_playbook_entries e on e.id = l.entry_id
        left join public.copilot_playbook_topics t on t.id = e.topic_id
        order by l.created_at desc
        limit 30) x), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 10. Access: approvers read; writes that need checks go through the functions above
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.copilot_teams enable row level security;
alter table public.copilot_playbook_examples enable row level security;
create policy copilot_teams_approver_select on public.copilot_teams
  for select to authenticated using (public.copilot_is_approver(auth.uid()));
create policy copilot_teams_approver_insert on public.copilot_teams
  for insert to authenticated with check (public.copilot_is_approver(auth.uid()));
create policy copilot_teams_approver_update on public.copilot_teams
  for update to authenticated using (public.copilot_is_approver(auth.uid()))
  with check (public.copilot_is_approver(auth.uid()));
create policy copilot_examples_approver_select on public.copilot_playbook_examples
  for select to authenticated using (public.copilot_is_approver(auth.uid()));
revoke all on table public.copilot_teams, public.copilot_playbook_examples from anon;
revoke delete, truncate on table public.copilot_teams from authenticated;
revoke insert, update, delete, truncate on table public.copilot_playbook_examples from authenticated;
revoke all on function public.copilot_pending_examples(int) from public, anon, authenticated;
revoke all on function public.copilot_set_example_embeddings(jsonb, text) from public, anon, authenticated;
grant execute on function public.copilot_pending_examples(int) to service_role;
grant execute on function public.copilot_set_example_embeddings(jsonb, text) to service_role;
alter table public.copilot_situations enable row level security;
alter table public.copilot_playbook_topics enable row level security;
alter table public.copilot_situation_marks enable row level security;
create policy copilot_situations_approver_select on public.copilot_situations
  for select to authenticated using (public.copilot_is_approver(auth.uid()));
create policy copilot_topics_approver_select on public.copilot_playbook_topics
  for select to authenticated using (public.copilot_is_approver(auth.uid()));
create policy copilot_topics_approver_update on public.copilot_playbook_topics
  for update to authenticated using (public.copilot_is_approver(auth.uid()))
  with check (public.copilot_is_approver(auth.uid()));
create policy copilot_situation_marks_approver_select on public.copilot_situation_marks
  for select to authenticated using (public.copilot_is_approver(auth.uid()));
revoke all on table public.copilot_situations, public.copilot_playbook_topics, public.copilot_situation_marks from anon;
revoke insert, update, delete, truncate on table public.copilot_situations from authenticated;
revoke insert, delete, truncate on table public.copilot_playbook_topics from authenticated;
revoke insert, update, delete, truncate on table public.copilot_situation_marks from authenticated;

revoke all on function public.copilot_match_playbook(jsonb, text, text, uuid, text, text, boolean, boolean, real, int, text, jsonb) from public, anon, authenticated;
grant execute on function public.copilot_match_playbook(jsonb, text, text, uuid, text, text, boolean, boolean, real, int, text, jsonb) to service_role;
revoke all on function public.copilot_learn_apply(uuid, text, text, uuid, text, jsonb, text, text, text, text, text, jsonb, text, text, text, uuid, uuid, uuid, boolean, jsonb, uuid, text, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.copilot_learn_apply(uuid, text, text, uuid, text, jsonb, text, text, text, text, text, jsonb, text, text, text, uuid, uuid, uuid, boolean, jsonb, uuid, text, jsonb, text, jsonb) to service_role;
revoke all on function public.copilot_add_question(uuid, text, text, uuid) from public, anon;
grant execute on function public.copilot_add_question(uuid, text, text, uuid) to authenticated, service_role;
revoke all on function public.copilot_set_order_situation(text, text, text, text) from public, anon;
grant execute on function public.copilot_set_order_situation(text, text, text, text) to authenticated, service_role;
revoke all on function public.copilot_situation_covers(text, text) from public, anon;
grant execute on function public.copilot_situation_covers(text, text) to authenticated, service_role;
revoke all on function public.copilot_topics_after_title() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 11. House style: Hinglish rules, the teams, numbers only when asked (only when the style was never edited)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
update public.copilot_config
   set house_style = $style$House style for replies to clients in Binance P2P order chats:
- Professional and crisp: one or two short sentences, about 200 characters. Longer only when explaining a policy such as TDS.
- Address the client as "sir" (or "ma'am" when told to). No slang, no SMS spellings, no ALL CAPS, no emojis, no exclamation marks.
- Use correct terms: Aadhaar, PAN, UPI ID, UTR, "mark as paid".
- Never promise to release crypto before the payment is verified in our account.
- Never suggest trading, paying or receiving payment outside Binance.
- Never type amounts, UPI IDs, account numbers, UTRs or phone numbers yourself. Use the placeholders you are given; for a company contact write {contact:rm}, {contact:kyc} or {contact:support}.
- Do not copy the operators' wording; write it fresh in this style.
- If the answer depends on a company policy you were not given, write your best proposal and mark it as new policy.
Hindi replies:
- Hinglish in English letters, the way a polite desk executive chats: short and direct, with the everyday English words people use mixed in (payment, verification, details, account, bank, KYC, order, release, check, confirm, share, wait, minute, process, update).
- Use the respectful "aap" form and keep "sir" or "ma'am". No bookish Hindi: "please" not "kripya", "thank you" not "dhanyavaad", "contact" not "sampark", "as per" not "anusaar", "under" not "ke tahat", "complete" not "poora", "wait" not "pratiksha", "safe" not "surakshit".
- For example: "Sir, verification complete hote hi payment details share kar denge." "Sir, aapka payment process ho raha hai, bas kuch minute."
Teams and numbers:
- The KYC team does KYC and the one-time verification call for new clients. Once a client's KYC is done, the client deals only with the relationship team. Support helps with anything else.
- Give a team's number only when the client asks for one (for example "which number will call me for KYC?"); never offer it otherwise.$style$
 where id and md5(house_style) = '48b620c947f6a08e18610c178fc34f8e';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 12. Seed re-cut by situation (runs once; a later run finds the batch and does nothing)
-- Untouched tentative replies of the first seed (never approved, edited, used, retired or learned from) are
-- replaced. Kept replies stay exactly as they are; a kept reply's question becomes the new question's home, and a
-- question with a single reply is not seeded again over a kept one. Questions get their embeddings the
-- next time an approver opens a chat or adds a phrasing.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
do $seed$
declare
  v_old constant text := 'seed-2026-10-15';
  v_batch constant text := 'seed-2026-10-16';
  v_days int;
  v_topic uuid;
  v_entry uuid;
  v_kept uuid[];
  v_old_topics uuid[];
  v_moved uuid[];
  v_sides jsonb;
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

  -- 1. The untouched first seed goes (with its inbox items and seeded phrasings). Phrasings an approver added to
  --    one of its questions stay until they move to the question that replaces it (below).
  create temp table _cp4_drop on commit drop as
    select e.id, e.topic_id, e.title
    from public.copilot_playbook_entries e
    where e.seed_batch = v_old and e.status = 'tentative' and e.version = 1 and e.use_count = 0
      and not exists (select 1 from public.copilot_learning_events l where l.entry_id = e.id or l.other_entry_id = e.id);
  delete from public.copilot_inbox_items i where i.entry_id in (select id from _cp4_drop) or i.other_entry_id in (select id from _cp4_drop);
  delete from public.copilot_playbook_entries e where e.id in (select id from _cp4_drop);
  delete from public.copilot_playbook_topics t
   where t.id in (select topic_id from _cp4_drop)
     and not exists (select 1 from public.copilot_playbook_entries e where e.topic_id = t.id)
     and not exists (select 1 from public.copilot_playbook_questions q where q.topic_id = t.id and q.source <> 'seed');

  -- 2. Questions with situation replies, each reply with a typical example chat.
  for r in
    select x.*
    from jsonb_to_recordset($json$[
{"title":"Can I pay now?","sides":["SELL"],"supersedes":["Can I pay now? — payment details after verification"],
 "questions":[{"t":"Can I pay now?"},{"t":"Shall I pay?"},{"t":"Should I pay?"},{"t":"Can I make the payment?"},{"t":"Where should I pay?"},{"t":"How do I pay?"},{"t":"Please share the payment details"},{"t":"Send your UPI ID"},{"t":"Pay kar du?","l":"hi"},{"t":"Payment kahan karu?","l":"hi"},{"t":"UPI ID bhejo","l":"hi"},{"t":"Payment kar sakta hoon?","l":"hi"}],
 "variants":[
  {"stages":["sell.kyc.pending"],
   "en":"Sir, please share the requested KYC details first. We will share the payment details as soon as your verification is complete.",
   "hi":"Sir, pehle requested KYC details share kar dijiye. Verification complete hote hi payment details share kar denge.",
   "example":[{"from":"us","text":"May I kindly request you to share your Aadhaar card (front and back) and mobile number."},{"from":"client","text":"Can I pay now?"}]},
  {"stages":["sell.kyc.review","sell.kyc.call"],
   "en":"Please wait a moment, sir. We will share the payment details as soon as your verification is complete.",
   "hi":"Sir, thoda wait kijiye. Verification complete hote hi payment details share kar denge.",
   "example":[{"from":"client","text":"[image]"},{"from":"us","text":"Sir, one time verification is needed. Please allow us a minute, our team will connect with you soon."},{"from":"client","text":"Shall I pay now?"}]},
  {"stages":["sell.pay.ready"],
   "en":"Yes, sir. Please pay to the payment details shared in this order, from a bank account in your own name.",
   "hi":"Ji sir, order mein di gayi payment details par payment kar dijiye. Payment apne naam ke bank account se hi kijiye.",
   "example":[{"from":"system","text":"We confirmed the client's additional KYC on Binance."},{"from":"us","text":"[upi]"},{"from":"client","text":"Can I pay now?"}]}]},
{"title":"How long will it take?","supersedes":["How long? — verification in progress","How long? — we are paying you"],
 "questions":[{"t":"How much time will it take?"},{"t":"How long?"},{"t":"How much time?"},{"t":"How long do I need to wait?"},{"t":"What happened?"},{"t":"Any update?"},{"t":"Is there any problem?"},{"t":"Why is it taking so long?"},{"t":"Kitna time lagega?","l":"hi"},{"t":"Kya hua?","l":"hi"},{"t":"Kitni der lagegi?","l":"hi"},{"t":"Kab tak hoga?","l":"hi"}],
 "variants":[
  {"stages":["sell.kyc.pending"],
   "en":"Sir, verification takes only a few minutes once we receive all the requested details. Please share them to proceed.",
   "hi":"Sir, saari details milte hi verification mein bas kuch minute lagte hain. Please details share kar dijiye.",
   "example":[{"from":"us","text":"May I kindly request you to share your Aadhaar card (front and back) and mobile number."},{"from":"client","text":"How much time will it take?"}]},
  {"stages":["sell.kyc.review"],
   "en":"Please allow us a few minutes to verify your details, sir. We will proceed as soon as it is complete.",
   "hi":"Sir, aapki details check ho rahi hain. Bas kuch minute dijiye, complete hote hi aage process karenge.",
   "example":[{"from":"us","text":"May I know your source of funds? Business or salary."},{"from":"client","text":"Business"},{"from":"client","text":"How long?"}]},
  {"stages":["sell.kyc.call"],"client_states":["new","linked"],
   "en":"Sir, our KYC team will connect with you shortly for the one-time verification. We will proceed as soon as it is complete.",
   "hi":"Sir, hamari KYC team thodi der mein one-time verification ke liye aapse connect karegi. Verification complete hote hi aage process karenge.",
   "example":[{"from":"us","text":"Sir, one time verification is needed. Please allow us a minute, our team will connect with you soon."},{"from":"client","text":"ok"},{"from":"client","text":"How much time?"}]},
  {"stages":["sell.pay.ready"],
   "en":"Sir, please complete the payment to the details shared. Once the payment is verified in our account, we will release the USDT.",
   "hi":"Sir, shared details par payment complete kar dijiye. Payment confirm hote hi USDT release kar denge.",
   "example":[{"from":"us","text":"[upi]"},{"from":"us","text":"Please pay on it, sir."},{"from":"client","text":"How long will it take after I pay?"}]},
  {"stages":["sell.pay.checking"],
   "en":"Thank you, sir. We are checking the payment in our account and will release the USDT once it is confirmed.",
   "hi":"Thank you sir. Payment check kar rahe hain, confirm hote hi USDT release kar denge.",
   "example":[{"from":"system","text":"The order was marked as paid."},{"from":"client","text":"[image]"},{"from":"client","text":"How much time?"}]},
  {"stages":["buy.details"],
   "en":"Sir, please share the requested details so that we can process your payment.",
   "hi":"Sir, please requested details share kar dijiye, taaki hum aapka payment process kar sakein.",
   "example":[{"from":"us","text":"Kindly share your PAN card and mobile number, sir."},{"from":"client","text":"How long will it take?"}]},
  {"stages":["buy.pay.processing"],
   "en":"Your payment is in progress, sir. Please allow us a few minutes.",
   "hi":"Sir, aapka payment process ho raha hai. Bas kuch minute dijiye.",
   "example":[{"from":"us","text":"Paying on your given details, sir."},{"from":"client","text":"How much time?"}]},
  {"stages":["buy.pay.cooling"],
   "en":"Sir, we have added your account as a beneficiary. Our bank allows the first payment only after its activation period, and we will pay as soon as it is over.",
   "hi":"Sir, aapka account beneficiary mein add ho gaya hai. Bank pehla payment activation time ke baad hi allow karta hai, time complete hote hi payment kar denge.",
   "example":[{"from":"us","text":"We have added your account as a beneficiary. We'll be able to make the payment after 30 minutes."},{"from":"client","text":"How long?"}]},
  {"stages":["buy.pay.sent"],
   "en":"We have sent the payment, sir. Please check your bank account and release the USDT once you have received it.",
   "hi":"Sir, payment bhej diya hai. Please bank account check karke, payment milte hi USDT release kar dijiye.",
   "example":[{"from":"system","text":"The order was marked as paid."},{"from":"us","text":"Payment done sir, please check and release."},{"from":"client","text":"How much time will it take to reflect?"}]}]},
{"title":"Payment done — please release","sides":["SELL"],"supersedes":["Client marked paid — we are checking the payment"],
 "questions":[{"t":"Payment done"},{"t":"I have paid"},{"t":"Paid, please release"},{"t":"Please release"},{"t":"Release my USDT"},{"t":"Done, please check"},{"t":"Payment kar diya","l":"hi"},{"t":"Release kar do","l":"hi"},{"t":"Paise bhej diye","l":"hi"}],
 "variants":[
  {"stages":["sell.pay.checking"],
   "en":"Thank you, sir. We are checking the payment in our account and will release the USDT once it is confirmed.",
   "hi":"Thank you sir. Payment check kar rahe hain, confirm hote hi USDT release kar denge.",
   "example":[{"from":"system","text":"The order was marked as paid."},{"from":"client","text":"Payment done, please release."}]},
  {"stages":["sell.pay.ready"],
   "en":"Thank you, sir. Please mark the order as paid on Binance. We will release the USDT once the payment is verified in our account.",
   "hi":"Thank you sir. Please Binance par order ko paid mark kar dijiye. Payment confirm hote hi USDT release kar denge.",
   "example":[{"from":"us","text":"[upi]"},{"from":"client","text":"I have paid."}]}]},
{"title":"Have you paid?","sides":["BUY"],"supersedes":["We marked paid — please check and release"],
 "questions":[{"t":"Have you paid?"},{"t":"Payment done?"},{"t":"Did you send the money?"},{"t":"Is the payment sent?"},{"t":"Have you sent it?"},{"t":"Is it done?"},{"t":"Payment ho gaya?","l":"hi"},{"t":"Paise bhej diye?","l":"hi"},{"t":"Payment bheja kya?","l":"hi"}],
 "variants":[
  {"stages":["buy.pay.sent"],
   "en":"We have sent the payment, sir. Please check your bank account and release the USDT once you have received it.",
   "hi":"Sir, payment bhej diya hai. Please bank account check karke, payment milte hi USDT release kar dijiye.",
   "example":[{"from":"system","text":"The order was marked as paid."},{"from":"us","text":"[image]"},{"from":"client","text":"Have you paid?"}]},
  {"stages":["buy.pay.processing"],
   "en":"Not yet, sir. Your payment is in progress, and we will update you here as soon as it is sent.",
   "hi":"Abhi nahi sir, payment process ho raha hai. Bhejte hi yahan update kar denge.",
   "example":[{"from":"us","text":"Paying on your given details, sir."},{"from":"client","text":"Payment done?"}]},
  {"stages":["buy.pay.cooling"],
   "en":"Not yet, sir. Our bank allows the first payment to a newly added beneficiary only after its activation period. We will pay as soon as it is over.",
   "hi":"Abhi nahi sir. Naye beneficiary ko bank pehla payment activation time ke baad hi allow karta hai, time complete hote hi payment kar denge.",
   "example":[{"from":"us","text":"We have added your account as a beneficiary. We'll be able to make the payment after 30 minutes."},{"from":"client","text":"Have you sent the money?"}]},
  {"stages":["buy.details"],
   "en":"Not yet, sir. Please share the requested details first so that we can process the payment.",
   "hi":"Abhi nahi sir. Pehle requested details share kar dijiye, taaki payment process kar sakein.",
   "example":[{"from":"us","text":"Kindly share your PAN card and mobile number, sir."},{"from":"client","text":"Have you paid?"}]}]},
{"title":"Our payment not received yet","sides":["BUY"],"supersedes":["Our payment not received yet"],
 "questions":[{"t":"Not received"},{"t":"Payment not received"},{"t":"I have not received the money"},{"t":"Amount not credited"},{"t":"Still not received"},{"t":"Paisa nahi aaya","l":"hi"},{"t":"Payment nahi mila","l":"hi"}],
 "variants":[
  {"stages":["buy.pay.sent"],
   "en":"We have sent the payment from our side, sir. Some bank transfers take a little longer to reflect, so please check again in a few minutes.",
   "hi":"Sir, hamari taraf se payment bhej diya hai. Kabhi kabhi bank transfer reflect hone mein thoda time lagta hai, please kuch minute baad check kar lijiye.",
   "example":[{"from":"system","text":"The order was marked as paid."},{"from":"us","text":"Payment done sir, please check and release."},{"from":"client","text":"Not received yet."}]},
  {"stages":["buy.pay.processing","buy.pay.cooling","buy.details"],
   "en":"Sir, we have not sent the payment yet. It is in progress, and we will update you here as soon as it is sent.",
   "hi":"Sir, payment abhi bheja nahi gaya hai, process mein hai. Bhejte hi yahan update kar denge.",
   "example":[{"from":"us","text":"Paying on your given details, sir."},{"from":"client","text":"Payment not received."}]}]},
{"title":"Why 1% TDS is deducted","sides":["BUY"],"supersedes":["Why 1% TDS is deducted"],
 "questions":[{"t":"Why is the amount less?"},{"t":"Why did you deduct TDS?"},{"t":"Why TDS?"},{"t":"Will you deduct TDS?"},{"t":"There should be no deduction on P2P"},{"t":"Why did I get less money?"},{"t":"How much TDS will you deduct?"},{"t":"TDS kyu kata?","l":"hi"},{"t":"Kam paise kyu aaye?","l":"hi"}],
 "variants":[
  {"en":"Sir, as per our ad terms, 1% TDS is deducted on this trade under Section 194S of the Income Tax Act and deposited against your PAN. You can claim the credit while filing your ITR.",
   "hi":"Sir, ad terms ke as per is trade par Income Tax Act ke Section 194S ke under 1% TDS deduct hota hai aur aapke PAN par deposit hota hai. ITR file karte time aap iska credit claim kar sakte hain.",
   "example":[{"from":"us","text":"Payment done sir, please check and release."},{"from":"client","text":"Why is the amount less?"}]}]},
{"title":"TDS proof or certificate","sides":["BUY"],"supersedes":["TDS proof or certificate"],
 "note":"Check with finance whether we also issue TDS certificates on request.",
 "questions":[{"t":"Can you share TDS proof?"},{"t":"I need the TDS certificate"},{"t":"Did you pay the TDS?"},{"t":"Send the TDS receipt"},{"t":"Where can I see the TDS?"},{"t":"TDS certificate kab milega?","l":"hi"}],
 "variants":[
  {"en":"Sir, the TDS is deposited against your PAN after the quarter ends. It will then show in your Form 26AS on the income tax portal.",
   "hi":"Sir, quarter end hone ke baad TDS aapke PAN par deposit hota hai. Uske baad yeh income tax portal par aapke Form 26AS mein dikh jayega.",
   "example":[{"from":"us","text":"Payment done sir, please check and release."},{"from":"client","text":"Can you share the TDS proof?"}]}]},
{"title":"Are you there?","supersedes":["Are you there?"],
 "questions":[{"t":"Are you there?"},{"t":"Are you online?"},{"t":"Hello, are you there?"},{"t":"Anyone there?"},{"t":"Hello?"},{"t":"R u there?"},{"t":"Koi hai?","l":"hi"},{"t":"Sir aap ho?","l":"hi"}],
 "variants":[
  {"en":"Yes, sir, we are here and looking into your order.",
   "hi":"Ji sir, hum yahin hain, aapka order hi dekh rahe hain."}]},
{"title":"Client asks us to hurry","supersedes":["Client asks us to hurry"],
 "questions":[{"t":"Please do it fast"},{"t":"Please hurry"},{"t":"I need it urgently"},{"t":"It's urgent"},{"t":"Time is running out"},{"t":"Jaldi karo","l":"hi"},{"t":"Jaldi kijiye please","l":"hi"}],
 "variants":[
  {"en":"Sure, sir. We are on it and will complete your order as quickly as possible.",
   "hi":"Sure sir, hum aapka order hi dekh rahe hain, jitna jaldi ho sake complete kar denge.",
   "example":[{"from":"us","text":"Paying on your given details, sir."},{"from":"client","text":"Please do it fast."}]},
  {"stages":["sell.kyc.pending","buy.details"],
   "en":"Sure, sir. Please share the requested details, and we will complete your order quickly.",
   "hi":"Sure sir, bas requested details share kar dijiye, order jaldi complete kar denge.",
   "example":[{"from":"us","text":"May I kindly request you to share your Aadhaar card (front and back) and mobile number."},{"from":"client","text":"Please hurry, I need it urgently."}]}]},
{"title":"KYC documents — Aadhaar and mobile number","kind":"step","step_key":"kyc","sides":["SELL"],"supersedes":["KYC documents — Aadhaar and mobile number"],
 "questions":[{"t":"What documents do you need?"},{"t":"Which documents should I share?"},{"t":"What details do you need from me?"},{"t":"Kya documents chahiye?","l":"hi"},{"t":"KYC ke liye kya bhejna hai?","l":"hi"}],
 "variants":[
  {"en":"To proceed, please share your Aadhaar card (front and back) and your mobile number, sir.",
   "hi":"Sir, aage process karne ke liye apna Aadhaar card (front aur back) aur mobile number share kar dijiye.",
   "example":[{"from":"us","text":"Good evening, sir."},{"from":"client","text":"What documents do you need?"}]}]},
{"title":"Why we ask for KYC","supersedes":["Why we ask for KYC"],
 "note":"KYC or VKYC may be asked again on purpose; never tell a client that KYC can be skipped.",
 "questions":[{"t":"Why do you need my Aadhaar?"},{"t":"Why KYC?"},{"t":"Why do you need my documents?"},{"t":"I already did KYC on Binance"},{"t":"Why do you need my mobile number?"},{"t":"KYC kyu chahiye?","l":"hi"},{"t":"Binance par KYC ho chuka hai","l":"hi"}],
 "variants":[
  {"en":"Sir, we verify every client's identity as part of our compliance process. It keeps the trade safe for both sides.",
   "hi":"Sir, compliance ke liye hum har client ki KYC verify karte hain. Isse trade dono side ke liye safe rehta hai.",
   "example":[{"from":"us","text":"May I kindly request you to share your Aadhaar card (front and back) and mobile number."},{"from":"client","text":"Why do you need my Aadhaar? I already did KYC on Binance."}]}]},
{"title":"Purpose of buying USDT","kind":"step","step_key":"purpose","sides":["SELL"],"supersedes":["Purpose of buying USDT"],
 "questions":[],
 "variants":[{"en":"May I know the purpose of buying USDT, sir?","hi":"Sir, aap USDT kis purpose ke liye le rahe hain?"}]},
{"title":"Source of funds","kind":"step","step_key":"source_of_funds","sides":["SELL"],"supersedes":["Source of funds"],
 "questions":[],
 "variants":[{"en":"May I know your source of funds, sir — salary, business or something else?","hi":"Sir, aapke funds ka source kya hai — salary, business ya kuch aur?"}]},
{"title":"Which bank will you pay from?","kind":"step","step_key":"paying_bank","sides":["SELL"],"supersedes":["Which bank will you pay from?"],
 "questions":[],
 "variants":[{"stages":["sell.kyc","sell.pay.ready"],"en":"Which bank will you use to pay, sir?","hi":"Sir, aap kis bank se payment karenge?"}]},
{"title":"Client names the bank they will pay from","sides":["SELL"],"supersedes":["Client names the bank they will pay from"],
 "questions":[{"t":"I will pay from HDFC"},{"t":"I will be paying from Kotak"},{"t":"I will use SBI"},{"t":"Paying from ICICI Bank"},{"t":"I pay from the same bank that is registered with you"},{"t":"HDFC se pay karunga","l":"hi"}],
 "variants":[{"stages":["sell.kyc","sell.pay.ready"],
   "en":"Thank you, sir. Please make sure the payment comes from a bank account in your own name.",
   "hi":"Thank you sir. Bas dhyan rakhiye ki payment aapke apne naam ke bank account se hi ho.",
   "example":[{"from":"us","text":"Kindly let me know from which bank you are going to pay."},{"from":"client","text":"I will pay from HDFC."}]}]},
{"title":"One-time verification by our KYC team","sides":["SELL"],"supersedes":["One-time verification by our relationship manager"],
 "note":"The one-time verification is done by the KYC team, not the relationship team.",
 "questions":[{"t":"What verification?"},{"t":"Why do I need verification?"},{"t":"Who will call me?"},{"t":"When will the verification call come?"},{"t":"Verification kab hoga?","l":"hi"}],
 "variants":[{"stages":["sell.kyc.review","sell.kyc.call"],"client_states":["new","linked"],
   "en":"A one-time verification is needed, sir. Our KYC team will connect with you shortly.",
   "hi":"Sir, ek baar verification zaroori hai. Hamari KYC team thodi der mein aapse connect karegi.",
   "example":[{"from":"us","text":"Sir, one time verification is needed. Please allow us a minute, our team will connect with you soon."},{"from":"client","text":"What verification?"}]}]},
{"title":"Our contact number","supersedes":["Our support contact number"],
 "note":"Give a number only when the client asks for one. A client whose KYC is done deals with the relationship team; a new client in verification with the KYC team.",
 "questions":[{"t":"What is your contact number?"},{"t":"Can I call you?"},{"t":"Give me your number"},{"t":"How can I contact you?"},{"t":"Contact number please"},{"t":"Number do","l":"hi"},{"t":"Aapka number kya hai?","l":"hi"}],
 "variants":[
  {"client_states":["approved"],
   "en":"Sir, you can reach our relationship team at {contact:rm}.",
   "hi":"Sir, aap hamari relationship team se {contact:rm} par contact kar sakte hain.",
   "example":[{"from":"client","text":"Hello"},{"from":"client","text":"What is your contact number?"}]},
  {"stages":["sell.kyc"],"client_states":["new","linked"],
   "en":"Sir, our KYC team will contact you for the verification. You can also reach them at {contact:kyc}.",
   "hi":"Sir, verification ke liye hamari KYC team aapse contact karegi. Aap unse {contact:kyc} par bhi baat kar sakte hain.",
   "example":[{"from":"us","text":"May I kindly request you to share your Aadhaar card (front and back) and mobile number."},{"from":"client","text":"Give me your number."}]},
  {"client_states":["new","linked"],
   "en":"Sir, you can reach our support team at {contact:support}.",
   "hi":"Sir, aap hamari support team se {contact:support} par contact kar sakte hain.",
   "example":[{"from":"us","text":"Paying on your given details, sir."},{"from":"client","text":"Can I call you?"}]}]},
{"title":"KYC call number","supersedes":["KYC call number"],
 "note":"Shared only when the client asks which number will call.",
 "questions":[{"t":"Which number will call for KYC?"},{"t":"Number for video KYC"},{"t":"Who will do my video KYC?"},{"t":"From which number will you call me?"},{"t":"KYC call kis number se aayega?","l":"hi"}],
 "variants":[
  {"sides":["SELL"],"stages":["sell.kyc"],"client_states":["new","linked"],
   "en":"Sir, our KYC team will call you for the verification. You can also reach them at {contact:kyc}.",
   "hi":"Sir, verification ke liye hamari KYC team aapko call karegi. Aap unse {contact:kyc} par bhi contact kar sakte hain.",
   "example":[{"from":"us","text":"Sir, one time verification is needed. Please allow us a minute, our team will connect with you soon."},{"from":"client","text":"Which number will call for KYC?"}]},
  {"client_states":["approved"],
   "en":"Sir, our relationship team will call you. You can also reach them at {contact:rm}.",
   "hi":"Sir, hamari relationship team aapko call karegi. Aap unse {contact:rm} par bhi contact kar sakte hain.",
   "example":[{"from":"us","text":"Sir, a quick verification call is needed."},{"from":"client","text":"From which number will you call me?"}]}]},
{"title":"Thank you after the order","kind":"step","step_key":"thanks","supersedes":["Thank you after the order"],
 "questions":[{"t":"Thank you"},{"t":"Thanks"},{"t":"Received, thanks"},{"t":"Got it, thank you"},{"t":"Shukriya","l":"hi"},{"t":"Dhanyavaad","l":"hi"}],
 "variants":[{"stages":["done"],
   "en":"Thank you for trading with us, sir. We would appreciate your positive feedback.",
   "hi":"Hamare saath trade karne ke liye thank you sir. Positive feedback zaroor dijiye.",
   "example":[{"from":"system","text":"Order completed."},{"from":"client","text":"Thanks"}]}]},
{"title":"Client wants to cancel","sides":["SELL"],"supersedes":["Client wants to cancel"],
 "questions":[{"t":"Sorry, I made an error and need to cancel"},{"t":"I want to cancel the order"},{"t":"Please cancel"},{"t":"Cancel the order"},{"t":"Order cancel karna hai","l":"hi"},{"t":"Cancel kar do","l":"hi"}],
 "variants":[{"stages":["sell.kyc","sell.pay.ready"],
   "en":"No problem, sir. Please cancel the order from your side and do not make any payment for it.",
   "hi":"Koi baat nahi sir, order apni side se cancel kar dijiye aur iske liye koi payment mat kijiye."}]},
{"title":"Payment from someone else's account","sides":["SELL"],"risk":"red","supersedes":["Payment from someone else's account"],
 "questions":[{"t":"Can I pay from my friend's account?"},{"t":"Can my brother pay for me?"},{"t":"Can I pay from my wife's account?"},{"t":"My father will pay"},{"t":"Papa ke account se pay kar du?","l":"hi"},{"t":"Dost ke account se payment kar sakta hoon?","l":"hi"}],
 "variants":[{"en":"Sir, we accept payment only from a bank account in your own name. Please do not pay from anyone else's account.",
   "hi":"Sir, hum sirf aapke apne naam ke bank account se hi payment lete hain. Please kisi aur ke account se payment mat kijiye.",
   "example":[{"from":"us","text":"Kindly let me know from which bank you are going to pay."},{"from":"client","text":"Can I pay from my friend's account?"}]}]},
{"title":"Test transfer of ₹1 received","sides":["BUY"],"supersedes":["Test transfer of ₹1 received"],
 "questions":[{"t":"Received 1 rupee"},{"t":"Got ₹1"},{"t":"1 rs received"},{"t":"Test amount received"},{"t":"1 rupaya aaya","l":"hi"}],
 "variants":[{"stages":["buy.pay"],
   "en":"Thank you for confirming, sir. We are sending the remaining amount now.",
   "hi":"Confirm karne ke liye thank you sir. Baaki amount abhi bhej rahe hain.",
   "example":[{"from":"us","text":"We are sending ₹1 first to check the account, sir."},{"from":"client","text":"Received 1 rupee."}]}]}
]$json$::jsonb) as x(title text, sides jsonb, kind text, step_key text, risk text, note text,
                                                         supersedes jsonb, questions jsonb, variants jsonb)
  loop
    -- Replies of the first seed that someone approved, edited, used or retired stay; their question is the home.
    select array_agg(e.id order by e.created_at, e.id) into v_kept
    from public.copilot_playbook_entries e
    where e.seed_batch = v_old
      and e.title in (select jsonb_array_elements_text(coalesce(r.supersedes, '[]'::jsonb)));

    if v_kept is null then
      insert into public.copilot_playbook_topics (title, seed_batch, created_at, updated_at)
      values (r.title, v_batch, clock_timestamp(), clock_timestamp())
      returning id into v_topic;
    else
      select e.topic_id into v_topic from public.copilot_playbook_entries e where e.id = v_kept[1];
      update public.copilot_playbook_topics set title = r.title, seed_batch = v_batch where id = v_topic;
      select array_agg(distinct e.topic_id) into v_old_topics
      from public.copilot_playbook_entries e where e.id = any (v_kept) and e.topic_id <> v_topic;
      if v_old_topics is not null then
        insert into public.copilot_playbook_questions (topic_id, entry_id, question_text, normalized, language, embedding,
                                                       embedding_model, source, created_by, created_at)
        select v_topic, q.entry_id, q.question_text, q.normalized, q.language, q.embedding, q.embedding_model, q.source,
               q.created_by, q.created_at
        from public.copilot_playbook_questions q
        where q.topic_id = any (v_old_topics)
        on conflict on constraint copilot_playbook_questions_unique do nothing;
        update public.copilot_playbook_entries set topic_id = v_topic where id = any (v_kept) and topic_id <> v_topic;
        delete from public.copilot_playbook_topics t
         where t.id = any (v_old_topics) and not exists (select 1 from public.copilot_playbook_entries e where e.topic_id = t.id);
      end if;
    end if;

    -- Phrasings approvers added to a replaced first-seed question join this one.
    select array_agg(distinct d.topic_id) into v_moved
    from _cp4_drop d
    where d.title in (select jsonb_array_elements_text(coalesce(r.supersedes, '[]'::jsonb)))
      and d.topic_id <> v_topic
      and exists (select 1 from public.copilot_playbook_topics t where t.id = d.topic_id);
    if v_moved is not null then
      insert into public.copilot_playbook_questions (topic_id, entry_id, question_text, normalized, language, embedding,
                                                     embedding_model, source, created_by, created_at)
      select v_topic, null, q.question_text, q.normalized, q.language, q.embedding, q.embedding_model, q.source,
             q.created_by, q.created_at
      from public.copilot_playbook_questions q
      where q.topic_id = any (v_moved) and q.source <> 'seed'
      on conflict on constraint copilot_playbook_questions_unique do nothing;
      delete from public.copilot_playbook_topics t
       where t.id = any (v_moved) and not exists (select 1 from public.copilot_playbook_entries e where e.topic_id = t.id);
    end if;

    insert into public.copilot_playbook_questions (topic_id, question_text, normalized, language, source, created_at)
    select v_topic, q ->> 't', public.copilot_normalize(q ->> 't'), coalesce(q ->> 'l', 'en'), 'seed', clock_timestamp()
    from jsonb_array_elements(coalesce(r.questions, '[]'::jsonb)) q
    on conflict on constraint copilot_playbook_questions_unique do nothing;

    for w in select * from jsonb_array_elements(coalesce(r.variants, '[]'::jsonb))
    loop
      -- A question with a single reply is not seeded again over a reply someone kept.
      if v_kept is not null and jsonb_array_length(r.variants) = 1 then
        continue;
      end if;
      -- Side from the reply, the question, or the situations the reply is for.
      v_sides := coalesce(w -> 'sides', r.sides, case
        when coalesce(jsonb_array_length(w -> 'stages'), 0) > 0
             and not exists (select 1 from jsonb_array_elements_text(w -> 'stages') s where s not like 'sell.%') then '["SELL"]'::jsonb
        when coalesce(jsonb_array_length(w -> 'stages'), 0) > 0
             and not exists (select 1 from jsonb_array_elements_text(w -> 'stages') s where s not like 'buy.%') then '["BUY"]'::jsonb
        end);
      insert into public.copilot_playbook_entries (topic_id, kind, step_key, title, status, source, scope, reply_en, reply_hi,
                                                   internal_note, risk, expires_at, seed_batch, created_at, updated_at)
      values (v_topic, coalesce(r.kind, 'reply'), r.step_key, r.title, 'tentative', 'seed',
              jsonb_strip_nulls(jsonb_build_object(
                'sides', v_sides,
                'stages', case when coalesce(jsonb_array_length(w -> 'stages'), 0) > 0 then w -> 'stages' end,
                'client_states', case when coalesce(jsonb_array_length(w -> 'client_states'), 0) > 0 then w -> 'client_states' end)),
              w ->> 'en', w ->> 'hi', coalesce(w ->> 'note', r.note), coalesce(r.risk, 'none'),
              now() + make_interval(days => v_days), v_batch, clock_timestamp(), clock_timestamp())
      returning id into v_entry;

      -- The typical chat for this reply: shown when reviewing it, and compared with real chats.
      if jsonb_typeof(w -> 'example') = 'array' and jsonb_array_length(w -> 'example') > 0 then
        v_n := jsonb_array_length(w -> 'example');
        select concat_ws(E'\n',
                 (select 'situation: ' || x.label from public.copilot_situations x where x.code = (w -> 'stages' ->> 0)),
                 (select string_agg((l.val ->> 'from') || ': ' || (l.val ->> 'text'), E'\n' order by l.ord)
                  from jsonb_array_elements(w -> 'example') with ordinality as l(val, ord)
                  where l.ord < v_n or (l.val ->> 'from') <> 'client'))
          into v_ctx;
        if nullif(btrim(coalesce(v_ctx, '')), '') is not null then
          insert into public.copilot_playbook_examples (entry_id, situation, chat, context_text, source, created_at)
          values (v_entry, w -> 'stages' ->> 0, w -> 'example', v_ctx, 'seed', clock_timestamp());
        end if;
      end if;

      -- clock_timestamp(): each item gets its own time, so the inbox keeps the seed's order.
      insert into public.copilot_inbox_items (kind, question_text, context, entry_id, created_at)
      values ('seed', r.questions -> 0 ->> 't',
              jsonb_build_object('seed_batch', v_batch, 'stages', coalesce(w -> 'stages', '[]'::jsonb)),
              v_entry, clock_timestamp());
    end loop;
  end loop;
end
$seed$;

-- 13. Out-of-date copies already left behind by edits made before this change (an English edit after the Hindi was
--     written, or the other way round).
update public.copilot_playbook_entries e set
  reply_hi_stale = e.reply_hi is not null and v1.reply_hi is not distinct from e.reply_hi and v1.reply_en is distinct from e.reply_en,
  reply_en_stale = e.reply_en is not null and v1.reply_en is not distinct from e.reply_en and v1.reply_hi is distinct from e.reply_hi
from (
  select v.entry_id, v.snapshot ->> 'reply_en' as reply_en, v.snapshot ->> 'reply_hi' as reply_hi
  from public.copilot_playbook_versions v
  where v.version = 1
) v1
where v1.entry_id = e.id and e.version > 1 and e.source = 'seed'
  and (v1.reply_en is distinct from e.reply_en or v1.reply_hi is distinct from e.reply_hi);
