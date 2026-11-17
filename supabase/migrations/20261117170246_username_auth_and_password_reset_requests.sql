alter table public.profiles
  add column if not exists username text,
  add column if not exists phone_number text;

create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(username))
  where username is not null;

create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id)
);

create index if not exists password_reset_requests_status_created_idx
  on public.password_reset_requests(status, created_at desc);

alter table public.password_reset_requests enable row level security;

drop policy if exists "Admins can view password reset requests" on public.password_reset_requests;
create policy "Admins can view password reset requests"
  on public.password_reset_requests for select
  to authenticated using ((select private.is_admin()));

drop policy if exists "Admins can update password reset requests" on public.password_reset_requests;
create policy "Admins can update password reset requests"
  on public.password_reset_requests for update
  to authenticated using ((select private.is_admin()))
  with check ((select private.is_admin()));

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles (id, email, display_name, username, phone_number)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    nullif(new.raw_user_meta_data ->> 'username', ''),
    nullif(new.raw_user_meta_data ->> 'phone_number', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;
