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


-- =====================================================================
-- ОНЛАЙН-ПАРТИИ С ДРУГОМ (необязательно; нужно только для раздела «Онлайн»).
-- Ходы, часы, сдача и ничья идут через функции ниже: время считает сервер, клиент таблицу напрямую не меняет.
-- Ограничение: легальность хода сервер не проверяет (проверяет браузер), поэтому партии товарищеские.
-- =====================================================================

create table if not exists public.online_games (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  creator      uuid not null references auth.users (id) on delete cascade,
  white        uuid references auth.users (id) on delete set null,
  black        uuid references auth.users (id) on delete set null,
  white_name   text not null default '',
  black_name   text not null default '',
  moves        text[] not null default '{}',
  base_ms      int not null default 0 check (base_ms >= 0 and base_ms <= 10800000),
  inc_ms       int not null default 0 check (inc_ms >= 0 and inc_ms <= 60000),
  white_ms     int not null default 0,
  black_ms     int not null default 0,
  turn_started timestamptz,
  status       text not null default 'waiting' check (status in ('waiting', 'active', 'finished')),
  result       text check (result in ('1-0', '0-1', '1/2-1/2')),
  reason       text,
  draw_offer   text check (draw_offer in ('w', 'b')),
  is_open      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists online_games_white_idx on public.online_games (white);
create index if not exists online_games_black_idx on public.online_games (black);
-- для таблицы, созданной более ранней версией этого файла
alter table public.online_games add column if not exists is_open boolean not null default false;
create index if not exists online_games_open_idx on public.online_games (created_at) where is_open and status = 'waiting';

alter table public.online_games enable row level security;
drop policy if exists "players select" on public.online_games;
create policy "players select" on public.online_games for select to authenticated
  using (auth.uid() = creator or auth.uid() = white or auth.uid() = black);
-- прямых вставок, правок и удалений нет: только функции ниже
revoke insert, update, delete on public.online_games from anon, authenticated;
grant select on public.online_games to authenticated;

-- Realtime: изменения партии приходят участникам сразу (иначе приложение опрашивает сервер каждые 2 с)
do $$ begin
  alter publication supabase_realtime add table public.online_games;
exception when others then null;
end $$;

create or replace function public.online_view(g public.online_games) returns jsonb
language sql volatile as $$ select to_jsonb(g) || jsonb_build_object('server_now', clock_timestamp()) $$;

-- Оставшееся время стороны, чей ход, в мс (null — часы выключены)
create or replace function public.online_left(g public.online_games) returns int
language sql volatile as $$
  select case when g.base_ms = 0 or g.turn_started is null then null
    else (case when coalesce(array_length(g.moves, 1), 0) % 2 = 0 then g.white_ms else g.black_ms end)
         - floor(extract(epoch from (clock_timestamp() - g.turn_started)) * 1000)::int end
$$;

create or replace function public.online_create(p_name text, p_color text, p_base_s int, p_inc_s int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c text; g public.online_games; side text := p_color; nm text := left(coalesce(nullif(trim(p_name), ''), 'Player'), 24);
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_base_s < 0 or p_base_s > 10800 or p_inc_s < 0 or p_inc_s > 60 then raise exception 'bad_time'; end if;
  if side not in ('w', 'b') then side := case when random() < 0.5 then 'w' else 'b' end; end if;
  loop
    c := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    exit when not exists (select 1 from public.online_games where code = c);
  end loop;
  insert into public.online_games (code, creator, white, black, white_name, black_name, base_ms, inc_ms, white_ms, black_ms)
  values (c, uid, case when side = 'w' then uid end, case when side = 'b' then uid end,
          case when side = 'w' then nm else '' end, case when side = 'b' then nm else '' end,
          p_base_s * 1000, p_inc_s * 1000, p_base_s * 1000, p_base_s * 1000)
  returning * into g;
  return public.online_view(g);
end $$;

create or replace function public.online_join(p_code text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); g public.online_games; nm text := left(coalesce(nullif(trim(p_name), ''), 'Player'), 24);
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into g from public.online_games where code = lower(trim(p_code)) for update;
  if not found then raise exception 'not_found'; end if;
  if uid = g.white or uid = g.black then return public.online_view(g); end if;
  if g.status <> 'waiting' then raise exception 'full'; end if;
  if g.white is null then update public.online_games set white = uid, white_name = nm where id = g.id;
  else update public.online_games set black = uid, black_name = nm where id = g.id; end if;
  update public.online_games set status = 'active', is_open = false, turn_started = clock_timestamp(), updated_at = now() where id = g.id returning * into g;
  return public.online_view(g);
end $$;

create or replace function public.online_get(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.online_games;
begin
  select * into g from public.online_games where id = p_id and auth.uid() in (white, black, creator);
  if not found then raise exception 'not_found'; end if;
  -- пока создатель ждёт соперника, каждый опрос продлевает жизнь вызова (устаревшие вызовы из списка пропадают)
  if g.status = 'waiting' and g.creator = auth.uid() then
    update public.online_games set updated_at = now() where id = g.id returning * into g;
  end if;
  return public.online_view(g);
end $$;

-- Ход. Время считает сервер; если время вышло, ход не принимается и партия заканчивается по времени.
create or replace function public.online_move(p_id uuid, p_uci text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); g public.online_games; n int; left_ms int; w boolean;
begin
  select * into g from public.online_games where id = p_id for update;
  if not found or (uid is distinct from g.white and uid is distinct from g.black) then raise exception 'not_found'; end if;
  if g.status <> 'active' then raise exception 'not_active'; end if;
  if p_uci !~ '^[a-h][1-8][a-h][1-8][qrbn]?$' then raise exception 'bad_move'; end if;
  n := coalesce(array_length(g.moves, 1), 0);
  if n >= 600 then raise exception 'too_long'; end if;
  w := n % 2 = 0;
  if (w and uid is distinct from g.white) or (not w and uid is distinct from g.black) then raise exception 'not_your_turn'; end if;
  left_ms := public.online_left(g);
  if left_ms is not null and left_ms <= 0 then
    update public.online_games set status = 'finished', result = case when w then '0-1' else '1-0' end, reason = 'timeout',
      white_ms = case when w then 0 else white_ms end, black_ms = case when w then black_ms else 0 end, draw_offer = null, updated_at = now()
      where id = g.id returning * into g;
    return public.online_view(g);
  end if;
  update public.online_games set
    moves = array_append(moves, p_uci), draw_offer = null, turn_started = clock_timestamp(), updated_at = now(),
    white_ms = case when w and left_ms is not null then left_ms + inc_ms else white_ms end,
    black_ms = case when not w and left_ms is not null then left_ms + inc_ms else black_ms end
    where id = g.id returning * into g;
  return public.online_view(g);
end $$;

-- Конец партии по правилам (мат, пат, ничья): клиенты сообщают результат; «мат» проверяется по чётности ходов.
create or replace function public.online_finish(p_id uuid, p_result text, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.online_games; n int;
begin
  select * into g from public.online_games where id = p_id for update;
  if not found or (uid is distinct from g.white and uid is distinct from g.black) then raise exception 'not_found'; end if;
  if g.status = 'finished' then return public.online_view(g); end if;
  if g.status <> 'active' then raise exception 'not_active'; end if;
  if p_reason not in ('checkmate', 'stalemate', 'insufficient', 'repetition', 'fifty', 'draw') then raise exception 'bad_reason'; end if;
  n := coalesce(array_length(g.moves, 1), 0);
  if p_reason = 'checkmate' and not ((p_result = '1-0' and n % 2 = 1) or (p_result = '0-1' and n > 0 and n % 2 = 0)) then raise exception 'bad_result'; end if;
  if p_reason <> 'checkmate' and p_result <> '1/2-1/2' then raise exception 'bad_result'; end if;
  update public.online_games set status = 'finished', result = p_result, reason = p_reason, draw_offer = null, updated_at = now()
    where id = g.id returning * into g;
  return public.online_view(g);
end $$;

create or replace function public.online_resign(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.online_games;
begin
  select * into g from public.online_games where id = p_id for update;
  if not found or (uid is distinct from g.white and uid is distinct from g.black) then raise exception 'not_found'; end if;
  if g.status = 'finished' then return public.online_view(g); end if;
  if g.status <> 'active' then raise exception 'not_active'; end if;
  update public.online_games set status = 'finished', result = case when uid = g.white then '0-1' else '1-0' end, reason = 'resign', draw_offer = null, updated_at = now()
    where id = g.id returning * into g;
  return public.online_view(g);
end $$;

-- Предложить ничью; если соперник уже предлагал — ничья принимается
create or replace function public.online_offer_draw(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.online_games; me text;
begin
  select * into g from public.online_games where id = p_id for update;
  if not found or (uid is distinct from g.white and uid is distinct from g.black) then raise exception 'not_found'; end if;
  if g.status <> 'active' then raise exception 'not_active'; end if;
  me := case when uid = g.white then 'w' else 'b' end;
  if g.draw_offer is not null and g.draw_offer <> me then
    update public.online_games set status = 'finished', result = '1/2-1/2', reason = 'agreed', draw_offer = null, updated_at = now() where id = g.id returning * into g;
  else
    update public.online_games set draw_offer = me, updated_at = now() where id = g.id returning * into g;
  end if;
  return public.online_view(g);
end $$;

create or replace function public.online_decline_draw(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.online_games;
begin
  select * into g from public.online_games where id = p_id for update;
  if not found or (uid is distinct from g.white and uid is distinct from g.black) then raise exception 'not_found'; end if;
  update public.online_games set draw_offer = null, updated_at = now()
    where id = g.id and status = 'active' and draw_offer = case when uid = g.white then 'b' else 'w' end;
  select * into g from public.online_games where id = p_id;
  return public.online_view(g);
end $$;

-- Победа по времени: любой участник может потребовать, если время стороны, чей ход, вышло
create or replace function public.online_flag(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.online_games; l int; w boolean;
begin
  select * into g from public.online_games where id = p_id for update;
  if not found or (uid is distinct from g.white and uid is distinct from g.black) then raise exception 'not_found'; end if;
  l := public.online_left(g);
  if g.status = 'active' and l is not null and l <= 0 then
    w := coalesce(array_length(g.moves, 1), 0) % 2 = 0;
    update public.online_games set status = 'finished', result = case when w then '0-1' else '1-0' end, reason = 'timeout', draw_offer = null,
      white_ms = case when w then 0 else white_ms end, black_ms = case when w then black_ms else 0 end, updated_at = now()
      where id = g.id returning * into g;
  end if;
  return public.online_view(g);
end $$;

-- Отмена: создатель может отменить ожидающую партию; участники — партию, где ещё не сделано двух ходов
create or replace function public.online_abort(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.online_games;
begin
  select * into g from public.online_games where id = p_id for update;
  if not found or (uid is distinct from g.creator and uid is distinct from g.white and uid is distinct from g.black) then raise exception 'not_found'; end if;
  if g.status = 'waiting' or (g.status = 'active' and coalesce(array_length(g.moves, 1), 0) < 2) then
    update public.online_games set status = 'finished', result = null, reason = 'aborted', draw_offer = null, is_open = false, updated_at = now() where id = g.id returning * into g;
  end if;
  return public.online_view(g);
end $$;

-- ЛОББИ: быстрый поиск и список открытых вызовов (вызов живёт, пока создатель его «пингует» через online_get; 45 секунд без пинга — вызов считается устаревшим)

-- Быстрая игра: берёт самый старый свежий открытый вызов с тем же контролем времени (не свой), иначе создаёт открытый вызов со случайным цветом
create or replace function public.online_seek(p_name text, p_base_s int, p_inc_s int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); g public.online_games; nm text := left(coalesce(nullif(trim(p_name), ''), 'Player'), 24); c text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_base_s < 0 or p_base_s > 10800 or p_inc_s < 0 or p_inc_s > 60 then raise exception 'bad_time'; end if;
  -- свои старые ожидающие вызовы закрываем, чтобы не копились
  update public.online_games set status = 'finished', reason = 'aborted', is_open = false, updated_at = now()
    where creator = uid and status = 'waiting' and is_open;
  select * into g from public.online_games
    where is_open and status = 'waiting' and creator <> uid and base_ms = p_base_s * 1000 and inc_ms = p_inc_s * 1000
      and updated_at > now() - interval '45 seconds'
    order by created_at limit 1 for update skip locked;
  if found then
    if g.white is null then update public.online_games set white = uid, white_name = nm where id = g.id;
    else update public.online_games set black = uid, black_name = nm where id = g.id; end if;
    update public.online_games set status = 'active', is_open = false, turn_started = clock_timestamp(), updated_at = now() where id = g.id returning * into g;
    return public.online_view(g);
  end if;
  loop
    c := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    exit when not exists (select 1 from public.online_games where code = c);
  end loop;
  if random() < 0.5 then
    insert into public.online_games (code, creator, white, white_name, base_ms, inc_ms, white_ms, black_ms, is_open)
    values (c, uid, uid, nm, p_base_s * 1000, p_inc_s * 1000, p_base_s * 1000, p_base_s * 1000, true) returning * into g;
  else
    insert into public.online_games (code, creator, black, black_name, base_ms, inc_ms, white_ms, black_ms, is_open)
    values (c, uid, uid, nm, p_base_s * 1000, p_inc_s * 1000, p_base_s * 1000, p_base_s * 1000, true) returning * into g;
  end if;
  return public.online_view(g);
end $$;

-- Показать свою ожидающую партию в списке открытых вызовов (или убрать из него)
create or replace function public.online_publish(p_id uuid, p_open boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.online_games;
begin
  update public.online_games set is_open = (p_open and status = 'waiting'), updated_at = now()
    where id = p_id and creator = auth.uid() returning * into g;
  if not found then raise exception 'not_found'; end if;
  return public.online_view(g);
end $$;

-- Открытые вызовы других игроков (без id и кода участников: для входа нужен только код вызова)
create or replace function public.online_open_list() returns jsonb
language sql security definer set search_path = public volatile as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'code', code, 'name', case when white is not null then white_name else black_name end,
      'side', case when white is not null then 'w' else 'b' end, 'base_ms', base_ms, 'inc_ms', inc_ms, 'created_at', created_at)
    order by created_at), '[]'::jsonb)
  from (select * from public.online_games
        where is_open and status = 'waiting' and creator <> auth.uid() and updated_at > now() - interval '45 seconds'
        order by created_at limit 30) o
$$;

revoke all on function public.online_seek(text, int, int), public.online_publish(uuid, boolean), public.online_open_list() from public, anon;
grant execute on function public.online_seek(text, int, int), public.online_publish(uuid, boolean), public.online_open_list() to authenticated;

revoke all on function public.online_create(text, text, int, int), public.online_join(text, text), public.online_get(uuid), public.online_move(uuid, text),
  public.online_finish(uuid, text, text), public.online_resign(uuid), public.online_offer_draw(uuid), public.online_decline_draw(uuid),
  public.online_flag(uuid), public.online_abort(uuid) from public, anon;
grant execute on function public.online_create(text, text, int, int), public.online_join(text, text), public.online_get(uuid), public.online_move(uuid, text),
  public.online_finish(uuid, text, text), public.online_resign(uuid), public.online_offer_draw(uuid), public.online_decline_draw(uuid),
  public.online_flag(uuid), public.online_abort(uuid) to authenticated;
