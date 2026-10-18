-- CHESS COACH AI: таблица для облачной синхронизации прогресса.
-- Выполните этот файл один раз в Supabase: Dashboard → SQL Editor → New query → Run.

create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null check (octet_length(data::text) < 4000000),
  updated_at timestamptz not null default now()
);

-- Каждый пользователь видит и меняет только свою строку. Без этих правил данные были бы открыты всем.
alter table public.user_data enable row level security;

drop policy if exists "own select" on public.user_data;
drop policy if exists "own insert" on public.user_data;
drop policy if exists "own update" on public.user_data;
drop policy if exists "own delete" on public.user_data;

create policy "own select" on public.user_data for select to authenticated using (auth.uid() = user_id);
create policy "own insert" on public.user_data for insert to authenticated with check (auth.uid() = user_id);
create policy "own update" on public.user_data for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own delete" on public.user_data for delete to authenticated using (auth.uid() = user_id);

-- Кнопка «Удалить аккаунт» в приложении: пользователь может удалить только себя (строка user_data удалится каскадом).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
