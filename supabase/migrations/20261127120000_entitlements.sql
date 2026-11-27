-- Billing profile for each signed-in user, plus Stripe webhook idempotency.
--
-- One row in public.entitlements is the user's plan and render quota.
-- Free quota is 5 (FREE_QUOTA in src/config/pricing.ts). Keep those equal.
-- Quotas live here, not in Stripe meters.
--
-- Visitors may SELECT their own entitlements row. They cannot insert,
-- update, or delete it. Writes happen in Edge Functions with the
-- service role, which bypasses RLS, and in the security-definer
-- functions below. stripe_events and export_grants have no policies
-- for anon or authenticated.
--
-- Apply in the Supabase SQL editor (paste and run), or:
--   supabase db push

create table if not exists public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  plan text not null default 'free',
  status text not null default 'active',
  billing_interval text,
  usage_period_start timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  quota_limit integer not null default 5,
  exports_used integer not null default 0,
  pending_plan text,
  pending_price_id text,
  pending_quota_limit integer,
  pending_interval text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entitlements_plan_chk check (plan in ('free', 'pro', 'studio')),
  constraint entitlements_pending_plan_chk check (
    pending_plan is null or pending_plan in ('free', 'pro', 'studio')
  ),
  constraint entitlements_status_chk check (
    status in (
      'active',
      'trialing',
      'past_due',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'unpaid',
      'paused'
    )
  ),
  constraint entitlements_interval_chk check (
    billing_interval is null or billing_interval in ('month', 'year')
  ),
  constraint entitlements_pending_interval_chk check (
    pending_interval is null or pending_interval in ('month', 'year')
  ),
  constraint entitlements_quota_chk check (quota_limit >= 0 and exports_used >= 0),
  constraint entitlements_pending_quota_chk check (
    pending_quota_limit is null or pending_quota_limit >= 0
  ),
  constraint entitlements_pending_pair_chk check (
    (pending_plan is null and pending_quota_limit is null)
    or (pending_plan is not null and pending_quota_limit is not null)
  )
);

comment on table public.entitlements is
  'Billing profile. One row per user. Service role writes; the user can read their own row.';

comment on column public.entitlements.quota_limit is
  'Renders allowed in the current period. Free quota is 5, matching FREE_QUOTA.';

comment on column public.entitlements.exports_used is
  'Renders consumed in the current quota window. Free and annual plans reset on the UTC calendar month. Monthly plans reset when the Stripe period renews.';

comment on column public.entitlements.usage_period_start is
  'Start of the quota window. For free and annual plans this is the UTC month. It is not the Stripe renewal.';

create unique index if not exists entitlements_stripe_customer_key
  on public.entitlements (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists entitlements_stripe_subscription_key
  on public.entitlements (stripe_subscription_id)
  where stripe_subscription_id is not null;

create table if not exists public.stripe_events (
  stripe_event_id text primary key,
  event_type text not null,
  completed boolean not null default false,
  received_at timestamptz not null default now(),
  constraint stripe_events_id_len check (char_length(stripe_event_id) between 1 and 255)
);

comment on table public.stripe_events is
  'Processed Stripe event ids. A second delivery of the same id is a no-op.';

create table if not exists public.export_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  clip_id text not null,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  constraint export_grants_clip_len check (char_length(clip_id) between 1 and 200)
);

comment on table public.export_grants is
  'One row per consume-export. authorize_render redeems it so the render API does not count the same render twice.';

create index if not exists export_grants_lookup
  on public.export_grants (user_id, clip_id, created_at desc);

create or replace function public.touch_entitlements_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists entitlements_set_updated_at on public.entitlements;

create trigger entitlements_set_updated_at
  before update on public.entitlements
  for each row
  execute function public.touch_entitlements_updated_at();

-- Free quota is 5. Keep this equal to FREE_QUOTA in src/config/pricing.ts.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.entitlements (
    user_id,
    email,
    plan,
    status,
    quota_limit,
    exports_used,
    current_period_start,
    current_period_end,
    usage_period_start
  ) values (
    new.id,
    new.email,
    'free',
    'active',
    5,
    0,
    date_trunc('month', now() at time zone 'utc') at time zone 'utc',
    (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc',
    date_trunc('month', now() at time zone 'utc') at time zone 'utc'
  )
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

drop trigger if exists on_auth_user_email_updated on auth.users;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  execute function public.handle_new_user();

create or replace function public.quota_resets_at(
  p_plan text,
  p_interval text,
  p_period_end timestamptz
)
returns timestamptz
language sql
stable
as $$
  select case
    when p_plan = 'free' or p_interval = 'year'
      then (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc'
    else p_period_end
  end;
$$;

create or replace function public.consume_export(p_user_id uuid, p_clip_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.entitlements%rowtype;
  month_start timestamptz;
  month_end timestamptz;
  grant_id uuid;
  clip text;
  resets timestamptz;
begin
  clip := btrim(coalesce(p_clip_id, ''));
  if p_user_id is null or char_length(clip) = 0 or char_length(clip) > 200 then
    return jsonb_build_object('allowed', false, 'reason', 'invalid');
  end if;

  insert into public.entitlements (
    user_id,
    plan,
    status,
    quota_limit,
    exports_used,
    current_period_start,
    current_period_end,
    usage_period_start
  ) values (
    p_user_id,
    'free',
    'active',
    5,
    0,
    date_trunc('month', now() at time zone 'utc') at time zone 'utc',
    (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc',
    date_trunc('month', now() at time zone 'utc') at time zone 'utc'
  )
  on conflict (user_id) do nothing;

  select * into row
  from public.entitlements
  where user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'billing');
  end if;

  if row.pending_plan is not null
     and row.pending_quota_limit is not null
     and row.current_period_end is not null
     and now() >= row.current_period_end then
    update public.entitlements
    set plan = row.pending_plan,
        stripe_price_id = row.pending_price_id,
        quota_limit = row.pending_quota_limit,
        billing_interval = row.pending_interval,
        pending_plan = null,
        pending_price_id = null,
        pending_quota_limit = null,
        pending_interval = null
    where user_id = p_user_id
    returning * into row;
  end if;

  if row.plan = 'free' or row.billing_interval = 'year' then
    month_start := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
    month_end := month_start + interval '1 month';
    if row.usage_period_start is null or row.usage_period_start < month_start then
      if row.plan = 'free' then
        update public.entitlements
        set exports_used = 0,
            usage_period_start = month_start,
            current_period_start = month_start,
            current_period_end = month_end,
            quota_limit = 5,
            status = 'active'
        where user_id = p_user_id
        returning * into row;
      else
        update public.entitlements
        set exports_used = 0,
            usage_period_start = month_start
        where user_id = p_user_id
        returning * into row;
      end if;
    end if;
  end if;

  resets := public.quota_resets_at(row.plan, row.billing_interval, row.current_period_end);

  if row.status = 'past_due' then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'past_due',
      'remaining', greatest(row.quota_limit - row.exports_used, 0),
      'quota_limit', row.quota_limit,
      'exports_used', row.exports_used,
      'plan', row.plan,
      'resets_at', resets
    );
  end if;

  if row.status not in ('active', 'trialing') then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'billing',
      'remaining', greatest(row.quota_limit - row.exports_used, 0),
      'quota_limit', row.quota_limit,
      'exports_used', row.exports_used,
      'plan', row.plan,
      'resets_at', resets
    );
  end if;

  if row.exports_used >= row.quota_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'quota',
      'remaining', 0,
      'quota_limit', row.quota_limit,
      'exports_used', row.exports_used,
      'plan', row.plan,
      'resets_at', resets
    );
  end if;

  update public.entitlements
  set exports_used = row.exports_used + 1
  where user_id = p_user_id
  returning * into row;

  insert into public.export_grants (user_id, clip_id)
  values (p_user_id, clip)
  returning id into grant_id;

  return jsonb_build_object(
    'allowed', true,
    'remaining', row.quota_limit - row.exports_used,
    'quota_limit', row.quota_limit,
    'exports_used', row.exports_used,
    'plan', row.plan,
    'resets_at', resets,
    'grant_id', grant_id
  );
end;
$$;

-- Server-side quota check for the Modal render API.
-- 1. Redeem an unredeemed grant for this clip from the last 6 hours
--    without incrementing again.
-- 2. A repeat call within 30 minutes of that redemption is a retry
--    and does not increment.
-- 3. Otherwise consume a render (covers a render that skipped the browser).
create or replace function public.authorize_render(p_user_id uuid, p_clip_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ent public.entitlements%rowtype;
  grant_row public.export_grants%rowtype;
  result jsonb;
  clip text;
begin
  clip := btrim(coalesce(p_clip_id, ''));
  if p_user_id is null or char_length(clip) = 0 or char_length(clip) > 200 then
    return jsonb_build_object('allowed', false, 'reason', 'invalid');
  end if;

  select * into ent
  from public.entitlements
  where user_id = p_user_id
  for update;

  if found then
    select * into grant_row
    from public.export_grants
    where user_id = p_user_id
      and clip_id = clip
      and redeemed_at is null
      and created_at > now() - interval '6 hours'
    order by created_at desc
    limit 1
    for update;

    if found then
      update public.export_grants
      set redeemed_at = now()
      where id = grant_row.id;

      return jsonb_build_object(
        'allowed', true,
        'consumed', false,
        'replay', false,
        'remaining', greatest(ent.quota_limit - ent.exports_used, 0),
        'quota_limit', ent.quota_limit,
        'exports_used', ent.exports_used,
        'plan', ent.plan,
        'resets_at', public.quota_resets_at(ent.plan, ent.billing_interval, ent.current_period_end)
      );
    end if;

    select * into grant_row
    from public.export_grants
    where user_id = p_user_id
      and clip_id = clip
      and redeemed_at is not null
      and redeemed_at > now() - interval '30 minutes'
    order by redeemed_at desc
    limit 1;

    if found then
      return jsonb_build_object(
        'allowed', true,
        'consumed', false,
        'replay', true,
        'remaining', greatest(ent.quota_limit - ent.exports_used, 0),
        'quota_limit', ent.quota_limit,
        'exports_used', ent.exports_used,
        'plan', ent.plan,
        'resets_at', public.quota_resets_at(ent.plan, ent.billing_interval, ent.current_period_end)
      );
    end if;
  end if;

  result := public.consume_export(p_user_id, clip);
  if coalesce(result->>'allowed', 'false') = 'true' and result ? 'grant_id' then
    update public.export_grants
    set redeemed_at = now()
    where id = (result->>'grant_id')::uuid;
    result := result || jsonb_build_object('consumed', true, 'replay', false);
  end if;
  return result;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon, authenticated;
revoke all on function public.touch_entitlements_updated_at() from public;
revoke all on function public.touch_entitlements_updated_at() from anon, authenticated;
revoke all on function public.quota_resets_at(text, text, timestamptz) from public;
revoke all on function public.quota_resets_at(text, text, timestamptz) from anon, authenticated;
revoke all on function public.consume_export(uuid, text) from public;
revoke all on function public.consume_export(uuid, text) from anon, authenticated;
revoke all on function public.authorize_render(uuid, text) from public;
revoke all on function public.authorize_render(uuid, text) from anon, authenticated;

grant execute on function public.consume_export(uuid, text) to service_role;
grant execute on function public.authorize_render(uuid, text) to service_role;

alter table public.entitlements enable row level security;
alter table public.stripe_events enable row level security;
alter table public.export_grants enable row level security;

drop policy if exists entitlements_select_own on public.entitlements;

create policy entitlements_select_own
  on public.entitlements
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on table public.entitlements from public;
revoke all on table public.entitlements from anon, authenticated;
grant select on table public.entitlements to authenticated;

revoke all on table public.stripe_events from public;
revoke all on table public.stripe_events from anon, authenticated;

revoke all on table public.export_grants from public;
revoke all on table public.export_grants from anon, authenticated;

notify pgrst, 'reload schema';
