-- Day-1 local mirror of the PRODUCTION objects involved in quiz persistence.
-- Column lists, constraints, RLS policies, grants and function bodies were
-- read from production (mlkzabspcwfockbmkmzl) on 2026-09-25 via read-only
-- catalog queries. Only what the quiz path touches is mirrored; this is not
-- a full schema copy. Runs on supabase/postgres:17.6.1.127 (production's image).
-- Production's auth.uid() (read from production 2026-09-25) also honours request.jwt.claims,
-- which is what current PostgREST sets; the stock image only reads the legacy GUC.
CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid LANGUAGE sql STABLE
AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;

create table public.profiles (
  id uuid primary key,
  full_name text,
  xp integer default 0,
  level integer default 0,
  streak_count integer default 0,
  is_pro boolean not null default false,
  pro_expires_at timestamptz
);
alter table public.profiles enable row level security;
create policy profiles_own on public.profiles for all to public
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create table public.quiz_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  topic text not null,
  questions jsonb not null default '[]'::jsonb,
  score integer,
  completed_at timestamptz,
  created_at timestamptz default now(),
  user_answers jsonb not null default '[]'::jsonb,
  questions_count integer not null default 0
);
create index idx_quiz_sessions_user on public.quiz_sessions(user_id);
alter table public.quiz_sessions enable row level security;
create policy quiz_own on public.quiz_sessions for all to public
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table public.topic_performance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  topic text not null,
  total_q integer not null default 0,
  correct_q integer not null default 0,
  accuracy_pct numeric,
  last_attempted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, subject, topic)
);
alter table public.topic_performance enable row level security;
create policy users_own_topic_performance on public.topic_performance for all to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.increment_xp_unchecked(user_id uuid, amount integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
begin
  if amount < -1000 or amount > 1000 then
    raise exception 'xp amount out of allowed range';
  end if;
  update public.profiles set
    xp    = greatest(0, xp + amount),
    level = floor(sqrt(greatest(0, xp + amount)::float / 100))
  where id = user_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.increment_xp(user_id uuid, amount integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
begin
  if user_id <> auth.uid() then
    raise exception 'unauthorized: can only award xp to yourself directly';
  end if;
  perform public.increment_xp_unchecked(user_id, amount);
end;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_topic_performance(p_user_id uuid, p_subject text, p_topic text, p_correct integer, p_total integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
begin
  if p_user_id <> auth.uid() then raise exception 'unauthorized'; end if;
  insert into public.topic_performance (user_id, subject, topic, correct_q, total_q, last_attempted_at, updated_at)
  values (p_user_id, p_subject, p_topic, p_correct, p_total, now(), now())
  on conflict (user_id, subject, topic)
  do update set
    correct_q         = topic_performance.correct_q + excluded.correct_q,
    total_q           = topic_performance.total_q   + excluded.total_q,
    last_attempted_at = now(),
    updated_at        = now();
end;
$function$;

-- subscriptions: columns, checks and indexes exactly as read from production (2026-09-25).
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null,
  status text not null default 'active',
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  amount_paise integer not null,
  currency text not null default 'INR',
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  store text,
  rc_event_id text,
  constraint subscriptions_plan_check check (plan = any (array['monthly','annual'])),
  constraint subscriptions_status_check check (status = any (array['active','cancelled','expired'])),
  constraint subscriptions_razorpay_payment_id_key unique (razorpay_payment_id)
);
create index sub_user_idx on public.subscriptions (user_id, status, expires_at desc);
create unique index subscriptions_user_store_active_idx on public.subscriptions (user_id, store) where (status = 'active');
alter table public.subscriptions enable row level security;
create policy sub_own on public.subscriptions for all to public using ((select auth.uid()) = user_id);
grant all on public.subscriptions to anon, authenticated, service_role;
