-- TrAIcer AI Skill early-access list.
-- Interest only: email, which assistant, Mac or PC. No payment column.
--
-- Apply in the Supabase SQL editor (paste and run), or with the CLI
-- after the project is linked:
--   supabase db push
--
-- Anonymous visitors may INSERT a row and nothing else.
-- They cannot read the list. The Supabase dashboard uses the service
-- role, which bypasses RLS, so the owner can export rows there.
-- Do not put the service-role key in the website.

create table public.skill_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ai text not null,
  ai_other text,
  computer text not null,
  fax_number text,
  created_at timestamptz not null default now(),
  constraint skill_waitlist_email_len check (char_length(email) between 3 and 254),
  constraint skill_waitlist_email_shape check (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint skill_waitlist_ai_choice check (ai in ('grok', 'claude', 'chatgpt', 'other')),
  constraint skill_waitlist_computer_choice check (computer in ('mac', 'pc')),
  constraint skill_waitlist_other_detail check (
    (ai = 'other' and ai_other is not null and char_length(ai_other) between 1 and 80)
    or (ai <> 'other' and ai_other is null)
  ),
  constraint skill_waitlist_fax_empty check (fax_number is null)
);

comment on table public.skill_waitlist is
  'Early-access interest for the TrAIcer AI Skill. No payment data.';

comment on column public.skill_waitlist.fax_number is
  'Honeypot. A non-empty value is rejected. Stored rows keep this null.';

create unique index skill_waitlist_email_key on public.skill_waitlist (email);

create index skill_waitlist_created_at_idx on public.skill_waitlist (created_at);

-- Normalise the row, drop honeypot spam, and cap bursts.
-- 40 successful inserts per 10 minutes, across everyone. Same email
-- cannot join twice (unique index). This is not per-IP: the browser
-- talks to Supabase directly, so there is no trusted client address.
-- Raise the cap here if a real launch queues past it.
create or replace function public.guard_skill_waitlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
begin
  if new.fax_number is not null and length(btrim(new.fax_number)) > 0 then
    raise exception 'invalid_submission' using errcode = 'P0001';
  end if;

  new.fax_number := null;
  new.email := lower(btrim(new.email));
  new.ai := lower(btrim(new.ai));
  new.computer := lower(btrim(new.computer));

  if new.ai = 'other' then
    new.ai_other := btrim(new.ai_other);
  else
    new.ai_other := null;
  end if;

  new.id := gen_random_uuid();
  new.created_at := now();

  select count(*) into recent_count
  from public.skill_waitlist
  where created_at > now() - interval '10 minutes';

  if recent_count >= 40 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_skill_waitlist() from public;
revoke all on function public.guard_skill_waitlist() from anon, authenticated;

drop trigger if exists skill_waitlist_guard on public.skill_waitlist;

create trigger skill_waitlist_guard
  before insert on public.skill_waitlist
  for each row
  execute function public.guard_skill_waitlist();

alter table public.skill_waitlist enable row level security;

drop policy if exists skill_waitlist_anon_insert on public.skill_waitlist;

create policy skill_waitlist_anon_insert
  on public.skill_waitlist
  for insert
  to anon, authenticated
  with check (true);

revoke all on table public.skill_waitlist from public;
revoke all on table public.skill_waitlist from anon, authenticated;

grant insert on table public.skill_waitlist to anon, authenticated;

notify pgrst, 'reload schema';
