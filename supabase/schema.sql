-- Run this whole file in Supabase > SQL Editor.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  role text not null default 'applicant' check (role in ('applicant','admin')),
  ref_no text unique,
  created_at timestamptz not null default now()
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  ref_no text not null,
  full_name text not null,
  data jsonb not null,
  sms_status text,
  sms_sent_at timestamptz,
  email_status text,
  email_sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Reference sequence: first applicant gets 000, then 001, 002 ...
create sequence public.ref_seq minvalue 0 start 0;

create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- Create a profile whenever someone signs up
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Applicant'),
    new.email,
    coalesce(new.raw_user_meta_data->>'phone', '')
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Called by the applicant page on first login: gives "<000>-<INITIALS>", e.g. 000-PJD
create or replace function public.assign_ref() returns text
language plpgsql security definer set search_path = public as $$
declare p public.profiles; ini text; r text;
begin
  select * into p from public.profiles where id = auth.uid();
  if not found or p.role <> 'applicant' then return null; end if;
  if p.ref_no is not null then return p.ref_no; end if;
  select string_agg(upper(left(w,1)), '') into ini
    from unnest(regexp_split_to_array(trim(p.full_name), '\s+')) w;
  r := lpad(nextval('public.ref_seq')::text, 3, '0') || '-' || coalesce(ini, 'X');
  update public.profiles set ref_no = r where id = auth.uid() and ref_no is null;
  return (select ref_no from public.profiles where id = auth.uid());
end $$;

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.applications enable row level security;

create policy "own or admin profile" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy "insert own application" on public.applications
  for insert with check (user_id = auth.uid() and sms_status is null);
create policy "read own or admin" on public.applications
  for select using (user_id = auth.uid() or public.is_admin());

-- No email confirmation: auto-confirm every new account, and confirm existing ones
create or replace function public.auto_confirm_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.email_confirmed_at := coalesce(new.email_confirmed_at, now()); return new; end $$;
drop trigger if exists auto_confirm_before_insert on auth.users;
create trigger auto_confirm_before_insert before insert on auth.users
  for each row execute function public.auto_confirm_user();
update auth.users set email_confirmed_at = now() where email_confirmed_at is null;

-- Make yourself the admin AFTER you have created your account on the site:
-- update public.profiles set role = 'admin', ref_no = null where email = 'you@example.com';
