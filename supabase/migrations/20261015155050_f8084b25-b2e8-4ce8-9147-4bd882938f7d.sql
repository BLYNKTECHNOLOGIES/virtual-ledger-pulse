-- =====================================================================================================
-- Copilot v2 (Playbook) — C1 foundations
-- Settings, Playbook (entries, question phrasings, versions), learning events with Undo, inbox, company
-- contact numbers, request log and AI call log (cost, drafts, feedback), matching and learning functions,
-- access rules. New objects only: the old copilot_* tables and edge functions stay until the new chat
-- panel replaces them; only the hourly exemplar job (copilot-train-hourly) is stopped here.
-- =====================================================================================================

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Settings (one row). Approvers see AI drafts; their sends/approvals teach the Playbook.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.copilot_config (
  id boolean primary key default true check (id),
  approver_ids uuid[] not null check (cardinality(approver_ids) >= 1),
  operators_enabled boolean not null default false,
  draft_models text[] not null default array['openai/gpt-6-astra', 'google/gemini-4-argon']
    check (cardinality(draft_models) between 1 and 2),
  utility_model text not null default 'google/gemini-3-flash-preview',
  embedding_model text not null default 'openai/text-embedding-3-small',
  monthly_budget_inr numeric(12,2) not null default 25000 check (monthly_budget_inr >= 0),
  budget_alert_pcts int[] not null default array[50, 80],
  usd_inr numeric(8,2) not null default 88 check (usd_inr > 0),
  hindi_switch_after int not null default 2 check (hindi_switch_after between 2 and 3),
  match_threshold real not null default 0.78 check (match_threshold between 0.5 and 0.99),
  related_threshold real not null default 0.55 check (related_threshold between 0.3 and 0.95),
  learn_threshold real not null default 0.5 check (learn_threshold between 0.3 and 0.95),
  tentative_days int not null default 60 check (tentative_days between 7 and 180),
  model_prices jsonb not null default '{
    "openai/gpt-6-astra": {"in": 10, "out": 50},
    "google/gemini-4-argon": {"in": 2, "out": 10},
    "google/gemini-3-flash-preview": {"in": 0.5, "out": 3},
    "openai/text-embedding-3-small": {"in": 0.02, "out": 0}
  }'::jsonb,
  house_style text not null default $style$House style for replies to clients in Binance P2P order chats:
- Professional and crisp: one or two short sentences, about 200 characters. Longer only when explaining a policy such as TDS.
- Address the client as "sir" (or "ma'am" when told to). No slang, no SMS spellings, no ALL CAPS, no emojis, no exclamation marks.
- Use correct terms: Aadhaar, PAN, UPI ID, UTR, "mark as paid".
- Never promise to release crypto before the payment is verified in our account.
- Never suggest trading, paying or receiving payment outside Binance.
- Never type amounts, UPI IDs, account numbers, UTRs or phone numbers yourself. Use the placeholders you are given; for a company contact write {contact:rm}, {contact:kyc} or {contact:support}.
- Do not copy the operators' wording; write it fresh in this style.
- If the answer depends on a company policy you were not given, write your best proposal and mark it as new policy.$style$,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint copilot_config_thresholds check (related_threshold <= match_threshold)
);
comment on table public.copilot_config is 'Copilot v2 settings (single row). Approvers see AI drafts and teach the Playbook.';

insert into public.copilot_config (id, approver_ids)
values (true, array['d1a85fd5-f5a8-47af-ae42-e0b4683d82c9', '89c04bbb-a2a0-417d-accd-ea22e0416d2e']::uuid[]);

create or replace function public.copilot_is_approver(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select p_user_id = any (c.approver_ids) from public.copilot_config c where c.id), false)
$$;

-- jsonb embedding (array of numbers, or the pgvector text form as a JSON string) -> vector(1536)
create or replace function public.copilot_to_vector(p jsonb)
returns vector
language sql immutable
set search_path = public
as $$
  select case jsonb_typeof(p)
           when 'array' then (p::text)::vector(1536)
           when 'string' then (p #>> '{}')::vector(1536)
         end
$$;

create or replace function public.copilot_normalize(p_text text)
returns text
language sql immutable
set search_path = public
as $$
  select btrim(regexp_replace(lower(coalesce(p_text, '')), '\s+', ' ', 'g'))
$$;

-- scope keys (all optional; a missing or empty list means "any"):
--   sides ["BUY","SELL"], categories ["small","regular"], account_ids [uuid...],
--   statuses [Binance order statuses], client_states ["new","linked","approved"]
create or replace function public.copilot_scope_valid(p_scope jsonb)
returns boolean
language sql immutable
set search_path = public
as $$
  select jsonb_typeof(p_scope) = 'object'
     and not exists (
       select 1 from jsonb_each(p_scope) e
       where e.key not in ('sides', 'categories', 'account_ids', 'statuses', 'client_states')
          or jsonb_typeof(e.value) <> 'array'
          or exists (select 1
                     from jsonb_array_elements(case when jsonb_typeof(e.value) = 'array' then e.value else '[]'::jsonb end) v
                     where jsonb_typeof(v) <> 'string'))
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Playbook: entries, question phrasings, versions
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.copilot_playbook_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'reply' check (kind in ('reply', 'step', 'holding')),
  step_key text check (step_key in ('greeting', 'kyc', 'purpose', 'source_of_funds', 'paying_bank',
    'payment_details', 'pay_nudge', 'verification_wait', 'payment_sent', 'release_request', 'thanks')),
  title text not null check (length(btrim(title)) between 1 and 160),
  status text not null default 'approved' check (status in ('tentative', 'approved', 'retired')),
  source text not null check (source in ('chat_sent', 'chat_approved', 'chat_saved', 'inbox', 'manual', 'seed')),
  scope jsonb not null default '{}'::jsonb check (public.copilot_scope_valid(scope)),
  reply_en text check (reply_en is null or length(reply_en) <= 2000),
  reply_hi text check (reply_hi is null or length(reply_hi) <= 2000),
  reply_en_auto boolean not null default false,
  reply_hi_auto boolean not null default false,
  internal_note text check (internal_note is null or length(internal_note) <= 2000),
  risk text not null default 'none' check (risk in ('none', 'amber', 'red')),
  conflict_open boolean not null default false,
  version int not null default 1,
  use_count int not null default 0,
  last_used_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  seed_batch text,
  source_order_number text,
  constraint copilot_entry_has_reply check (coalesce(nullif(btrim(reply_en), ''), nullif(btrim(reply_hi), '')) is not null),
  constraint copilot_entry_step_key check ((kind = 'step') = (step_key is not null)),
  constraint copilot_entry_expiry check (status = 'tentative' or expires_at is null)
);
create index copilot_playbook_entries_status_idx on public.copilot_playbook_entries (status, kind);
comment on table public.copilot_playbook_entries is
  'Copilot Playbook: approved (and tentative, never shown to operators) replies with scope, English and Hindi versions.';

create table public.copilot_playbook_questions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.copilot_playbook_entries (id) on delete cascade,
  question_text text not null check (length(btrim(question_text)) between 1 and 1000),
  normalized text not null,
  language text not null default 'en' check (language in ('en', 'hi')),
  embedding vector(1536),
  embedding_model text,
  source text not null default 'chat' check (source in ('chat', 'seed', 'manual', 'inbox', 'paraphrase')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint copilot_playbook_questions_unique unique (entry_id, normalized)
);
create index copilot_playbook_questions_entry_idx on public.copilot_playbook_questions (entry_id);
create index copilot_playbook_questions_embedding_idx on public.copilot_playbook_questions
  using hnsw (embedding vector_cosine_ops);
comment on table public.copilot_playbook_questions is 'Client question phrasings for each Playbook entry (personal numbers masked).';

create table public.copilot_playbook_versions (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.copilot_playbook_entries (id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  changed_by uuid,
  created_at timestamptz not null default now(),
  constraint copilot_playbook_versions_unique unique (entry_id, version)
);
comment on table public.copilot_playbook_versions is 'History of every change to a Playbook entry (written by trigger).';

create or replace function public.copilot_entries_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status <> 'tentative' then
    new.expires_at := null;
  end if;
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := coalesce(new.updated_by, new.created_by);
  else
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    if (new.title, new.status, new.scope, new.reply_en, new.reply_hi, new.internal_note, new.risk, new.kind,
        new.step_key, new.expires_at, new.reply_en_auto, new.reply_hi_auto)
       is distinct from
       (old.title, old.status, old.scope, old.reply_en, old.reply_hi, old.internal_note, old.risk, old.kind,
        old.step_key, old.expires_at, old.reply_en_auto, old.reply_hi_auto) then
      new.version := old.version + 1;
    else
      new.version := old.version;
    end if;
  end if;
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved') then
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_by := coalesce(new.approved_by, new.updated_by);
  end if;
  return new;
end;
$$;

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
              'internal_note', new.internal_note, 'risk', new.risk, 'expires_at', new.expires_at),
            new.updated_by)
    on conflict (entry_id, version) do nothing;
  end if;
  return null;
end;
$$;

create trigger copilot_entries_before_write
  before insert or update on public.copilot_playbook_entries
  for each row execute function public.copilot_entries_before_write();
create trigger copilot_entries_after_write
  after insert or update on public.copilot_playbook_entries
  for each row execute function public.copilot_entries_after_write();

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Inbox (conflicts, tentative seeds, later operators' questions) and learning events (audit + Undo)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.copilot_inbox_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('conflict', 'seed', 'operator_question')),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  order_number text,
  exchange_account_id uuid,
  question_text text,
  context jsonb not null default '{}'::jsonb,
  entry_id uuid references public.copilot_playbook_entries (id) on delete cascade,
  other_entry_id uuid references public.copilot_playbook_entries (id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution text
);
create index copilot_inbox_items_open_idx on public.copilot_inbox_items (status, kind, created_at desc);
create index copilot_inbox_items_entry_idx on public.copilot_inbox_items (entry_id);

create table public.copilot_learning_events (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  user_id uuid not null,
  action text not null check (action in ('created', 'merged', 'promoted', 'updated', 'conflict', 'replaced')),
  cause text not null check (cause in ('sent', 'approved', 'saved')),
  entry_id uuid references public.copilot_playbook_entries (id) on delete set null,
  other_entry_id uuid references public.copilot_playbook_entries (id) on delete set null,
  question_id uuid references public.copilot_playbook_questions (id) on delete set null,
  inbox_item_id uuid references public.copilot_inbox_items (id) on delete set null,
  order_number text,
  exchange_account_id uuid,
  request_id uuid,
  draft_call_id uuid,
  before_state jsonb,
  after_state jsonb,
  undone_at timestamptz,
  undone_by uuid,
  created_at timestamptz not null default now()
);
create index copilot_learning_events_created_idx on public.copilot_learning_events (created_at desc);
create index copilot_learning_events_entry_idx on public.copilot_learning_events (entry_id);
create index copilot_learning_events_other_idx on public.copilot_learning_events (other_entry_id);

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 4. Company contact numbers (several per purpose; picked by availability in IST)
-- days: ISO weekday numbers, 1 = Monday ... 7 = Sunday. A window may cross midnight (19:00–02:00).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.copilot_contacts (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('rm', 'kyc', 'support', 'other')),
  person_name text not null check (length(btrim(person_name)) between 1 and 80),
  phone text not null check (phone ~ '^\+?[0-9][0-9 -]{6,18}[0-9]$'),
  days smallint[] not null default array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    check (cardinality(days) between 1 and 7 and days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  available_from time,
  available_to time,
  priority int not null default 100,
  is_active boolean not null default true,
  notes text check (notes is null or length(notes) <= 300),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint copilot_contacts_window check ((available_from is null) = (available_to is null))
);
comment on table public.copilot_contacts is 'Company RM/KYC/support numbers the Copilot may insert; several per purpose, chosen by availability.';

-- Contacts for a purpose, available ones first. Approvers and the server only.
create or replace function public.copilot_pick_contacts(p_purpose text, p_at timestamptz default now())
returns table (id uuid, person_name text, phone text, available_now boolean, priority int)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.copilot_is_approver(auth.uid()) then
    raise exception 'Only Copilot approvers can view contact numbers' using errcode = '42501';
  end if;
  return query
  with t as (
    select (p_at at time zone 'Asia/Kolkata')::time as tod,
           extract(isodow from (p_at at time zone 'Asia/Kolkata'))::smallint as dow
  )
  select c.id, c.person_name, c.phone,
         (t.dow = any (c.days) and (
            c.available_from is null
            or (c.available_from <= c.available_to and t.tod between c.available_from and c.available_to)
            or (c.available_from > c.available_to and (t.tod >= c.available_from or t.tod <= c.available_to))
         )) as available_now,
         c.priority
  from public.copilot_contacts c, t
  where c.purpose = p_purpose and c.is_active
  order by 4 desc, c.priority, c.person_name;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 5. Requests (one per suggestion for a chat state; caches the result so a chat never pays twice) and
--    AI calls (tokens, ₹, drafts, approver feedback; rejected drafts are kept as negative examples)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.copilot_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null,
  order_number text not null,
  exchange_account_id uuid,
  mode text not null check (mode in ('suggest', 'redraft', 'force', 'inbox')),
  request_key text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'error', 'capped', 'skipped')),
  question_text text,
  question_language text check (question_language in ('en', 'hi')),
  question_embedding vector(1536),
  context jsonb not null default '{}'::jsonb,
  matches jsonb not null default '[]'::jsonb,
  top_entry_id uuid,
  top_similarity real,
  result jsonb,
  error text,
  latency_ms int
);
create unique index copilot_requests_suggest_key on public.copilot_requests (order_number, request_key)
  where mode = 'suggest' and request_key is not null;
create index copilot_requests_order_idx on public.copilot_requests (order_number, created_at desc);
create index copilot_requests_created_idx on public.copilot_requests (created_at desc);

create table public.copilot_ai_calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_id uuid references public.copilot_requests (id) on delete set null,
  user_id uuid,
  order_number text,
  exchange_account_id uuid,
  purpose text not null check (purpose in ('draft', 'redraft', 'embed', 'judge', 'translate', 'seed')),
  model text not null,
  variant text,
  status text not null check (status in ('ok', 'error', 'blocked', 'capped')),
  input_tokens int,
  output_tokens int,
  reasoning_tokens int,
  tokens_estimated boolean not null default false,
  cost_inr numeric(12,4) not null default 0,
  latency_ms int,
  output_text text,
  new_policy boolean,
  guardrail_flags text[],
  error text,
  feedback text check (feedback in ('used', 'approved', 'rejected')),
  feedback_edited boolean,
  feedback_reason text check (feedback_reason is null or length(feedback_reason) <= 500),
  feedback_by uuid,
  feedback_at timestamptz
);
create index copilot_ai_calls_created_idx on public.copilot_ai_calls (created_at desc);
create index copilot_ai_calls_request_idx on public.copilot_ai_calls (request_id);
create index copilot_ai_calls_rejected_idx on public.copilot_ai_calls (feedback_at desc) where feedback = 'rejected';
comment on table public.copilot_ai_calls is 'Every Copilot AI call: model, tokens, cost in ₹, draft text (masked), guardrail flags, approver feedback.';

create or replace function public.copilot_month_spend_inr(p_at timestamptz default now())
returns numeric
language sql stable security definer
set search_path = public
as $$
  select coalesce(sum(cost_inr), 0)
  from public.copilot_ai_calls
  where created_at >= (date_trunc('month', p_at at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')
$$;

-- What the signed-in user may do (feeds the screen). Approvers also get budget and Playbook counts.
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
      'open_inbox', (select count(*) from public.copilot_inbox_items i where i.status = 'open'))
  else
    jsonb_build_object('is_approver', false, 'operators_enabled', c.operators_enabled)
  end
  from public.copilot_config c
  where c.id
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 6. Matching (server only): best phrasing per entry for up to 4 query embeddings, filtered by scope
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.copilot_match_playbook(
  p_embeddings jsonb,
  p_side text,
  p_category text,
  p_account_id uuid,
  p_status text,
  p_client_state text,
  p_include_tentative boolean,
  p_include_conflicts boolean,
  p_min_similarity real default 0,
  p_limit int default 5
)
returns table (
  entry_id uuid, question_id uuid, question_text text, input_index int, similarity double precision,
  status text, kind text, step_key text, title text, scope jsonb, reply_en text, reply_hi text,
  reply_en_auto boolean, reply_hi_auto boolean, risk text, internal_note text,
  conflict_open boolean, version int, use_count int
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
  scoped as (
    select e.*
    from public.copilot_playbook_entries e
    where (e.status = 'approved'
           or (p_include_tentative and e.status = 'tentative' and (e.expires_at is null or e.expires_at > now())))
      and (p_include_conflicts or not e.conflict_open)
      and (coalesce(jsonb_array_length(e.scope -> 'sides'), 0) = 0 or e.scope -> 'sides' ? coalesce(p_side, ''))
      and (coalesce(jsonb_array_length(e.scope -> 'categories'), 0) = 0 or e.scope -> 'categories' ? coalesce(p_category, ''))
      and (coalesce(jsonb_array_length(e.scope -> 'account_ids'), 0) = 0 or e.scope -> 'account_ids' ? coalesce(p_account_id::text, ''))
      and (coalesce(jsonb_array_length(e.scope -> 'statuses'), 0) = 0 or e.scope -> 'statuses' ? coalesce(p_status, ''))
      and (coalesce(jsonb_array_length(e.scope -> 'client_states'), 0) = 0 or e.scope -> 'client_states' ? coalesce(p_client_state, ''))
  ),
  best as (
    select distinct on (q.entry_id)
           q.entry_id, q.id as question_id, q.question_text, emb.input_index,
           1 - (q.embedding <=> emb.v) as similarity
    from public.copilot_playbook_questions q
    join scoped s on s.id = q.entry_id
    cross join emb
    where q.embedding is not null and emb.v is not null
    order by q.entry_id, q.embedding <=> emb.v
  )
  select b.entry_id, b.question_id, b.question_text, b.input_index, b.similarity,
         s.status, s.kind, s.step_key, s.title, s.scope, s.reply_en, s.reply_hi,
         s.reply_en_auto, s.reply_hi_auto, s.risk, s.internal_note, s.conflict_open, s.version, s.use_count
  from best b join scoped s on s.id = b.entry_id
  where b.similarity >= coalesce(p_min_similarity, 0)
  order by b.similarity desc
  limit greatest(1, least(coalesce(p_limit, 5), 20))
$$;

-- Rejected drafts for similar questions, given to the drafting models as "avoid this" examples.
create or replace function public.copilot_similar_rejections(
  p_embedding jsonb, p_min_similarity real default 0.6, p_limit int default 3)
returns table (call_id uuid, model text, draft_text text, reason text, similarity double precision, rejected_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  with e as (select public.copilot_to_vector(p_embedding) as v)
  select c.id, c.model, c.output_text, c.feedback_reason, 1 - (r.question_embedding <=> e.v), c.feedback_at
  from public.copilot_ai_calls c
  join public.copilot_requests r on r.id = c.request_id
  cross join e
  where e.v is not null and c.feedback = 'rejected' and c.output_text is not null
    and r.question_embedding is not null
    and 1 - (r.question_embedding <=> e.v) >= coalesce(p_min_similarity, 0.6)
  order by r.question_embedding <=> e.v
  limit greatest(1, least(coalesce(p_limit, 3), 10))
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 7. Learning (server only; the edge function verifies the caller and passes the user id)
-- p_relation (decided by the edge function):
--   'new'      no entry answers this question
--   'merge'    same meaning as p_target_entry_id; keep its wording (add the phrasing, fill a missing language)
--   'update'   same meaning; the new wording replaces the entry's wording in that language
--   'conflict' the entry answers the same question differently -> conflict for an approved entry;
--              a tentative entry is simply replaced by the approver's answer
-- A tentative target that is merged or updated becomes approved ("promoted").
-- p_reply_text is stored as given (the edge function generalises it: placeholders, no client specifics).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.copilot_learn_apply(
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
  p_context jsonb default '{}'::jsonb
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
  v_emb vector(1536);
  v_model text;
  v_target public.copilot_playbook_entries%rowtype;
  v_entry_id uuid;
  v_question_id uuid;
  v_event_id uuid;
  v_inbox_id uuid;
  v_action text;
  v_before jsonb;
  v_keep boolean;
begin
  if not public.copilot_is_approver(p_user_id) then
    raise exception 'Only Copilot approvers can teach the Playbook' using errcode = '42501';
  end if;
  if v_src is null then raise exception 'Unknown cause %', p_cause using errcode = '22023'; end if;
  if p_relation is null or p_relation not in ('new', 'merge', 'update', 'conflict') then
    raise exception 'Unknown relation %', p_relation using errcode = '22023';
  end if;
  if v_reply is null then raise exception 'Reply text is required' using errcode = '22023'; end if;
  if v_lang is null or v_lang not in ('en', 'hi') or coalesce(p_question_language, 'en') not in ('en', 'hi') then
    raise exception 'Unknown language' using errcode = '22023';
  end if;

  v_emb := public.copilot_to_vector(p_question_embedding);
  if v_emb is null and p_request_id is not null then
    select r.question_embedding into v_emb from public.copilot_requests r
     where r.id = p_request_id and public.copilot_normalize(r.question_text) = public.copilot_normalize(v_qtext);
  end if;
  select c.embedding_model into v_model from public.copilot_config c where c.id;

  if p_relation <> 'new' then
    select * into v_target from public.copilot_playbook_entries where id = p_target_entry_id for update;
    if not found or v_target.status = 'retired' then
      raise exception 'Target entry not found' using errcode = 'P0002';
    end if;
    v_before := to_jsonb(v_target);
  end if;

  if p_relation in ('merge', 'update') then
    v_entry_id := v_target.id;
    v_keep := (p_relation = 'merge');
    if v_target.status = 'tentative' then
      v_action := 'promoted';
    elsif not v_keep and public.copilot_normalize(case when v_lang = 'en' then v_target.reply_en else v_target.reply_hi end)
                         is distinct from public.copilot_normalize(v_reply) then
      v_action := 'updated';
    else
      v_action := 'merged';
      v_keep := true;
    end if;

    if v_keep then
      -- keep the entry's wording; a human-sent text replaces only an empty or machine-translated slot
      update public.copilot_playbook_entries set
        reply_en = case when v_lang = 'en' then (case when reply_en is null or reply_en_auto then v_reply else reply_en end)
                        else coalesce(reply_en, v_other) end,
        reply_en_auto = case when v_lang = 'en' then (case when reply_en is null or reply_en_auto then false else reply_en_auto end)
                             else (case when reply_en is null then v_other is not null else reply_en_auto end) end,
        reply_hi = case when v_lang = 'hi' then (case when reply_hi is null or reply_hi_auto then v_reply else reply_hi end)
                        else coalesce(reply_hi, v_other) end,
        reply_hi_auto = case when v_lang = 'hi' then (case when reply_hi is null or reply_hi_auto then false else reply_hi_auto end)
                             else (case when reply_hi is null then v_other is not null else reply_hi_auto end) end,
        status = 'approved',
        approved_by = case when status = 'approved' then approved_by else p_user_id end,
        updated_by = p_user_id
      where id = v_entry_id;
    else
      -- the new wording replaces the entry's wording; the other language follows unless written by a person
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
    -- a new approved entry: 'new', a conflicting answer, or the approver's answer replacing a tentative entry
    insert into public.copilot_playbook_entries (
      kind, step_key, title, status, source, scope, reply_en, reply_hi, reply_en_auto, reply_hi_auto,
      conflict_open, approved_by, approved_at, created_by, updated_by, source_order_number)
    values (
      coalesce(p_kind, 'reply'), p_step_key,
      left(coalesce(nullif(btrim(p_title), ''), v_target.title, left(coalesce(v_qtext, v_reply), 80)), 160),
      'approved', v_src, coalesce(p_scope, '{}'::jsonb),
      case when v_lang = 'en' then v_reply else v_other end,
      case when v_lang = 'hi' then v_reply else v_other end,
      v_lang <> 'en' and v_other is not null,
      v_lang <> 'hi' and v_other is not null,
      p_relation = 'conflict' and v_target.status = 'approved',
      p_user_id, now(), p_user_id, p_user_id, p_order_number)
    returning id into v_entry_id;

    if p_relation = 'new' then
      v_action := 'created';
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

  if v_qtext is not null then
    insert into public.copilot_playbook_questions (entry_id, question_text, normalized, language, embedding,
                                                   embedding_model, source, created_by)
    values (v_entry_id, v_qtext, public.copilot_normalize(v_qtext), coalesce(p_question_language, 'en'), v_emb,
            case when v_emb is not null then v_model end, 'chat', p_user_id)
    on conflict on constraint copilot_playbook_questions_unique do nothing
    returning id into v_question_id;
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
                                              before_state, after_state)
  values (p_user_id, v_action, p_cause, v_entry_id,
          case when v_action in ('conflict', 'replaced') then v_target.id end,
          v_question_id, v_inbox_id, p_order_number, p_account_id, p_request_id, p_draft_call_id, v_before,
          (select to_jsonb(e) from public.copilot_playbook_entries e where e.id = v_entry_id))
  returning id into v_event_id;

  return jsonb_build_object(
    'event_id', v_event_id, 'action', v_action, 'entry_id', v_entry_id,
    'title', (select title from public.copilot_playbook_entries where id = v_entry_id),
    'other_entry_id', case when v_action in ('conflict', 'replaced') then v_target.id end,
    'inbox_item_id', v_inbox_id);
end;
$$;

-- Undo a learning event (any approver, within 24 hours, only while it is the latest change to the entry).
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

  if v_ev.action = 'created' then
    delete from public.copilot_playbook_entries where id = v_ev.entry_id;

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
    if v_ev.question_id is not null then
      delete from public.copilot_playbook_questions where id = v_ev.question_id;
    end if;
    v_b := v_ev.before_state;
    if (v_b ->> 'version') is distinct from (v_ev.after_state ->> 'version') then
      update public.copilot_playbook_entries set
        status = v_b ->> 'status',
        expires_at = (v_b ->> 'expires_at')::timestamptz,
        approved_by = (v_b ->> 'approved_by')::uuid,
        approved_at = (v_b ->> 'approved_at')::timestamptz,
        reply_en = v_b ->> 'reply_en', reply_hi = v_b ->> 'reply_hi',
        reply_en_auto = (v_b ->> 'reply_en_auto')::boolean, reply_hi_auto = (v_b ->> 'reply_hi_auto')::boolean,
        updated_by = p_user_id
      where id = v_ev.entry_id;
    end if;
    if v_ev.action = 'promoted' and v_ev.inbox_item_id is not null then
      update public.copilot_inbox_items set status = 'open', resolved_by = null, resolved_at = null, resolution = null
       where id = v_ev.inbox_item_id and resolution = 'promoted_in_chat';
    end if;
  end if;

  if v_ev.cause = 'sent' and v_ev.action in ('merged', 'promoted', 'updated') then
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

-- Resolve a conflict from the inbox: keep the new answer, the old one, or both (then adjust their scopes).
create or replace function public.copilot_resolve_conflict(p_item_id uuid, p_keep text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.copilot_inbox_items%rowtype;
begin
  if not public.copilot_is_approver(v_uid) then
    raise exception 'Only Copilot approvers can resolve conflicts' using errcode = '42501';
  end if;
  if p_keep is null or p_keep not in ('new', 'old', 'both') then
    raise exception 'Unknown choice %', p_keep using errcode = '22023';
  end if;
  select * into v_item from public.copilot_inbox_items where id = p_item_id and kind = 'conflict' for update;
  if not found or v_item.status <> 'open' then
    raise exception 'Conflict not found or already resolved' using errcode = 'P0002';
  end if;

  if p_keep = 'new' then
    update public.copilot_playbook_entries set status = 'retired', updated_by = v_uid where id = v_item.other_entry_id;
  elsif p_keep = 'old' then
    update public.copilot_playbook_entries set status = 'retired', updated_by = v_uid where id = v_item.entry_id;
  end if;
  update public.copilot_inbox_items set status = 'resolved', resolved_by = v_uid, resolved_at = now(),
         resolution = 'kept_' || p_keep
   where id = p_item_id;
  update public.copilot_playbook_entries e set conflict_open = exists (
           select 1 from public.copilot_inbox_items i
           where i.kind = 'conflict' and i.status = 'open' and (i.entry_id = e.id or i.other_entry_id = e.id)),
         updated_by = v_uid
   where e.id in (v_item.entry_id, v_item.other_entry_id);
  return jsonb_build_object('item_id', p_item_id, 'kept', p_keep);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 8. Access: approvers only. Writes that need checks go through the functions above.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.copilot_config enable row level security;
alter table public.copilot_playbook_entries enable row level security;
alter table public.copilot_playbook_questions enable row level security;
alter table public.copilot_playbook_versions enable row level security;
alter table public.copilot_inbox_items enable row level security;
alter table public.copilot_learning_events enable row level security;
alter table public.copilot_contacts enable row level security;
alter table public.copilot_requests enable row level security;
alter table public.copilot_ai_calls enable row level security;

create policy copilot_config_approver_select on public.copilot_config
  for select to authenticated using (public.copilot_is_approver(auth.uid()));
create policy copilot_config_approver_update on public.copilot_config
  for update to authenticated using (public.copilot_is_approver(auth.uid()))
  with check (public.copilot_is_approver(auth.uid()));
create policy copilot_entries_approver_all on public.copilot_playbook_entries
  for all to authenticated using (public.copilot_is_approver(auth.uid()))
  with check (public.copilot_is_approver(auth.uid()));
create policy copilot_questions_approver_all on public.copilot_playbook_questions
  for all to authenticated using (public.copilot_is_approver(auth.uid()))
  with check (public.copilot_is_approver(auth.uid()));
create policy copilot_versions_approver_select on public.copilot_playbook_versions
  for select to authenticated using (public.copilot_is_approver(auth.uid()));
create policy copilot_inbox_approver_select on public.copilot_inbox_items
  for select to authenticated using (public.copilot_is_approver(auth.uid()));
create policy copilot_inbox_approver_update on public.copilot_inbox_items
  for update to authenticated using (public.copilot_is_approver(auth.uid()))
  with check (public.copilot_is_approver(auth.uid()));
create policy copilot_events_approver_select on public.copilot_learning_events
  for select to authenticated using (public.copilot_is_approver(auth.uid()));
create policy copilot_contacts_approver_all on public.copilot_contacts
  for all to authenticated using (public.copilot_is_approver(auth.uid()))
  with check (public.copilot_is_approver(auth.uid()));
create policy copilot_requests_approver_select on public.copilot_requests
  for select to authenticated using (public.copilot_is_approver(auth.uid()));
create policy copilot_ai_calls_approver_select on public.copilot_ai_calls
  for select to authenticated using (public.copilot_is_approver(auth.uid()));

revoke all on table public.copilot_config, public.copilot_playbook_entries, public.copilot_playbook_questions,
  public.copilot_playbook_versions, public.copilot_inbox_items, public.copilot_learning_events,
  public.copilot_contacts, public.copilot_requests, public.copilot_ai_calls from anon;

create or replace function public.copilot_touch_updated()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;
create trigger copilot_config_touch before update on public.copilot_config
  for each row execute function public.copilot_touch_updated();
create trigger copilot_contacts_touch before update on public.copilot_contacts
  for each row execute function public.copilot_touch_updated();

-- Functions that act for a user, or expose cost and matching, are callable by the server only.
revoke all on function public.copilot_match_playbook(jsonb, text, text, uuid, text, text, boolean, boolean, real, int) from public, anon, authenticated;
revoke all on function public.copilot_similar_rejections(jsonb, real, int) from public, anon, authenticated;
revoke all on function public.copilot_learn_apply(uuid, text, text, uuid, text, jsonb, text, text, text, text, text, jsonb, text, text, text, uuid, uuid, uuid, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.copilot_undo_learning(uuid, uuid) from public, anon, authenticated;
revoke all on function public.copilot_month_spend_inr(timestamptz) from public, anon, authenticated;
grant execute on function public.copilot_match_playbook(jsonb, text, text, uuid, text, text, boolean, boolean, real, int) to service_role;
grant execute on function public.copilot_similar_rejections(jsonb, real, int) to service_role;
grant execute on function public.copilot_learn_apply(uuid, text, text, uuid, text, jsonb, text, text, text, text, text, jsonb, text, text, text, uuid, uuid, uuid, boolean, jsonb) to service_role;
grant execute on function public.copilot_undo_learning(uuid, uuid) to service_role;
grant execute on function public.copilot_month_spend_inr(timestamptz) to service_role;
revoke all on function public.copilot_pick_contacts(text, timestamptz) from public, anon;
grant execute on function public.copilot_pick_contacts(text, timestamptz) to authenticated, service_role;
revoke all on function public.copilot_my_access() from public, anon;
grant execute on function public.copilot_my_access() to authenticated, service_role;
revoke all on function public.copilot_resolve_conflict(uuid, text) from public, anon;
grant execute on function public.copilot_resolve_conflict(uuid, text) to authenticated, service_role;
revoke all on function public.copilot_is_approver(uuid) from public, anon;
grant execute on function public.copilot_is_approver(uuid) to authenticated, service_role;
revoke all on function public.copilot_to_vector(jsonb), public.copilot_normalize(text), public.copilot_scope_valid(jsonb)
  from public, anon;
grant execute on function public.copilot_to_vector(jsonb), public.copilot_normalize(text), public.copilot_scope_valid(jsonb)
  to authenticated, service_role;
revoke all on function public.copilot_entries_before_write(), public.copilot_entries_after_write(),
  public.copilot_touch_updated() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 9. Stop the old hourly exemplar mining (it only collected operator replies that nothing uses now)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  perform cron.unschedule('copilot-train-hourly');
exception when others then
  raise notice 'copilot-train-hourly was not scheduled: %', sqlerrm;
end
$$;
