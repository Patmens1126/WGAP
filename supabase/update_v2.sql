-- Run this ONCE if you already ran schema.sql earlier.
alter table public.applications add column if not exists sms_status text;
alter table public.applications add column if not exists sms_sent_at timestamptz;
drop policy if exists "insert own application" on public.applications;
create policy "insert own application" on public.applications
  for insert with check (user_id = auth.uid() and sms_status is null);

-- No email confirmation: auto-confirm every new account, and confirm existing ones
create or replace function public.auto_confirm_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.email_confirmed_at := coalesce(new.email_confirmed_at, now()); return new; end $$;
drop trigger if exists auto_confirm_before_insert on auth.users;
create trigger auto_confirm_before_insert before insert on auth.users
  for each row execute function public.auto_confirm_user();
update auth.users set email_confirmed_at = now() where email_confirmed_at is null;
