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
-- Ходы проверяет сервер: легальность, мат, пат, недостаточный материал, правило 50 ходов и троекратное повторение
-- считаются в базе (см. функции chess_*), поэтому нелегальный ход или ложный результат принять нельзя.
-- Рейтинг (Эло внутри приложения, не FIDE и не Chess.com) считается только для партий быстрого поиска и открытых вызовов.
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
  emote        text,
  emote_by     text check (emote_by in ('w', 'b')),
  emote_seq    int not null default 0,
  emote_at     timestamptz,
  fen          text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pos_hist     text[] not null default '{}',
  rated        boolean not null default false,
  rating_applied boolean not null default false,
  white_elo    int,
  black_elo    int,
  white_delta  int,
  black_delta  int,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists online_games_white_idx on public.online_games (white);
create index if not exists online_games_black_idx on public.online_games (black);
-- для таблицы, созданной более ранней версией этого файла
alter table public.online_games add column if not exists is_open boolean not null default false;
alter table public.online_games add column if not exists emote text;
alter table public.online_games add column if not exists emote_by text;
alter table public.online_games add column if not exists emote_seq int not null default 0;
alter table public.online_games add column if not exists emote_at timestamptz;
alter table public.online_games add column if not exists fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
alter table public.online_games add column if not exists pos_hist text[] not null default '{}';
alter table public.online_games add column if not exists rated boolean not null default false;
alter table public.online_games add column if not exists rating_applied boolean not null default false;
alter table public.online_games add column if not exists white_elo int;
alter table public.online_games add column if not exists black_elo int;
alter table public.online_games add column if not exists white_delta int;
alter table public.online_games add column if not exists black_delta int;
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
language plpgsql volatile as $$
begin
  return to_jsonb(g) || jsonb_build_object('server_now', clock_timestamp(),
    'white_rating', case when g.white is null then null else (select coalesce(max(rating), 1200) from public.online_ratings where user_id = g.white) end,
    'black_rating', case when g.black is null then null else (select coalesce(max(rating), 1200) from public.online_ratings where user_id = g.black) end);
end $$;

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

-- ПРАВИЛА ШАХМАТ НА СЕРВЕРЕ (для онлайн-партий): разбор FEN, генерация легальных ходов, применение хода, мат/пат/ничьи.
-- Доска — строка из 64 символов: индекс 0 = a8, 63 = h1; заглавные — белые, строчные — чёрные, '.' — пусто.
do $$ begin
  create type public.chess_pos as (b text, turn text, castle text, ep int, half int, full_n int);
exception when duplicate_object then null; end $$;

create or replace function public.chess_from_fen(fen text) returns public.chess_pos
language plpgsql immutable as $$
declare parts text[] := regexp_split_to_array(trim(fen), '\s+'); b text := ''; ch text; i int; p public.chess_pos;
begin
  if array_length(parts, 1) < 4 then raise exception 'bad_fen'; end if;
  for i in 1..length(parts[1]) loop
    ch := substr(parts[1], i, 1);
    if ch ~ '[1-8]' then b := b || repeat('.', ch::int);
    elsif ch ~ '[pnbrqkPNBRQK]' then b := b || ch;
    elsif ch <> '/' then raise exception 'bad_fen'; end if;
  end loop;
  if length(b) <> 64 then raise exception 'bad_fen'; end if;
  p.b := b; p.turn := parts[2];
  p.castle := case when parts[3] = '-' then '' else parts[3] end;
  p.ep := case when parts[4] = '-' then -1 else (8 - substr(parts[4], 2, 1)::int) * 8 + (ascii(substr(parts[4], 1, 1)) - 97) end;
  p.half := coalesce(parts[5]::int, 0); p.full_n := coalesce(parts[6]::int, 1);
  return p;
end $$;

create or replace function public.chess_to_fen(p public.chess_pos) returns text
language plpgsql immutable as $$
declare s text := ''; r int; f int; n int; ch text;
begin
  for r in 0..7 loop
    n := 0;
    for f in 0..7 loop
      ch := substr(p.b, r * 8 + f + 1, 1);
      if ch = '.' then n := n + 1; else if n > 0 then s := s || n; n := 0; end if; s := s || ch; end if;
    end loop;
    if n > 0 then s := s || n; end if;
    if r < 7 then s := s || '/'; end if;
  end loop;
  return s || ' ' || p.turn || ' ' || case when p.castle = '' then '-' else p.castle end || ' '
    || case when p.ep < 0 then '-' else chr(97 + p.ep % 8) || (8 - p.ep / 8) end || ' ' || p.half || ' ' || p.full_n;
end $$;

-- Бьёт ли сторона by_white поле sq
create or replace function public.chess_attacked(b text, sq int, by_white boolean) returns boolean
language plpgsql immutable as $$
declare
  f int := sq % 8; r int := sq / 8; nr int; nf int; i int; k int; c text;
  kdr int[] := '{-2,-2,-1,-1,1,1,2,2}'; kdf int[] := '{-1,1,-2,2,-2,2,-1,1}';
  dr int[] := '{-1,-1,-1,0,0,1,1,1}'; df int[] := '{-1,0,1,-1,1,-1,0,1}';
  mine_p text := case when by_white then 'P' else 'p' end; mine_n text := case when by_white then 'N' else 'n' end;
  mine_k text := case when by_white then 'K' else 'k' end; mine_b text := case when by_white then 'B' else 'b' end;
  mine_r text := case when by_white then 'R' else 'r' end; mine_q text := case when by_white then 'Q' else 'q' end;
begin
  nr := case when by_white then r + 1 else r - 1 end;
  if nr between 0 and 7 then
    for nf in f - 1..f + 1 by 2 loop
      if nf between 0 and 7 and substr(b, nr * 8 + nf + 1, 1) = mine_p then return true; end if;
    end loop;
  end if;
  for i in 1..8 loop
    nr := r + kdr[i]; nf := f + kdf[i];
    if nr between 0 and 7 and nf between 0 and 7 and substr(b, nr * 8 + nf + 1, 1) = mine_n then return true; end if;
    nr := r + dr[i]; nf := f + df[i];
    if nr between 0 and 7 and nf between 0 and 7 and substr(b, nr * 8 + nf + 1, 1) = mine_k then return true; end if;
  end loop;
  for i in 1..8 loop
    nr := r + dr[i]; nf := f + df[i];
    while nr between 0 and 7 and nf between 0 and 7 loop
      c := substr(b, nr * 8 + nf + 1, 1);
      if c <> '.' then
        if c = mine_q or (c = mine_r and (dr[i] = 0 or df[i] = 0)) or (c = mine_b and dr[i] <> 0 and df[i] <> 0) then return true; end if;
        exit;
      end if;
      nr := nr + dr[i]; nf := nf + df[i];
    end loop;
  end loop;
  return false;
end $$;

-- Применение хода (без проверки легальности)
create or replace function public.chess_apply(p public.chess_pos, f int, t int, promo text) returns public.chess_pos
language plpgsql immutable as $$
declare n public.chess_pos := p; pc text := substr(p.b, f + 1, 1); cap text := substr(p.b, t + 1, 1); b text := p.b; white boolean := (p.turn = 'w'); put text := pc;
begin
  b := overlay(b placing '.' from f + 1 for 1);
  if upper(pc) = 'P' and t = p.ep and cap = '.' and f % 8 <> t % 8 then
    b := overlay(b placing '.' from (case when white then t + 8 else t - 8 end) + 1 for 1);
  end if;
  if upper(pc) = 'P' and promo is not null and promo <> '' then put := case when white then upper(promo) else lower(promo) end; end if;
  b := overlay(b placing put from t + 1 for 1);
  if upper(pc) = 'K' and abs(t - f) = 2 then
    if t > f then b := overlay(overlay(b placing '.' from f + 4 for 1) placing (case when white then 'R' else 'r' end) from f + 2 for 1);
    else b := overlay(overlay(b placing '.' from f - 3 for 1) placing (case when white then 'R' else 'r' end) from f for 1); end if;
  end if;
  n.castle := p.castle;
  if upper(pc) = 'K' then n.castle := translate(n.castle, case when white then 'KQ' else 'kq' end, ''); end if;
  if f = 63 or t = 63 then n.castle := replace(n.castle, 'K', ''); end if;
  if f = 56 or t = 56 then n.castle := replace(n.castle, 'Q', ''); end if;
  if f = 7 or t = 7 then n.castle := replace(n.castle, 'k', ''); end if;
  if f = 0 or t = 0 then n.castle := replace(n.castle, 'q', ''); end if;
  n.ep := case when upper(pc) = 'P' and abs(t - f) = 16 then (f + t) / 2 else -1 end;
  n.half := case when upper(pc) = 'P' or cap <> '.' then 0 else p.half + 1 end;
  n.full_n := p.full_n + case when white then 0 else 1 end;
  n.b := b; n.turn := case when white then 'b' else 'w' end;
  return n;
end $$;

-- Все легальные ходы стороны, чей ход
create or replace function public.chess_moves(p public.chess_pos) returns table (f int, t int, promo text)
language plpgsql immutable as $$
declare
  white boolean := (p.turn = 'w'); sq int; pc text; c text; r int; fl int; nr int; nf int; i int; ti int; up int; start_r int; last_r int; pr text;
  kdr int[] := '{-2,-2,-1,-1,1,1,2,2}'; kdf int[] := '{-1,1,-2,2,-2,2,-1,1}';
  dr int[] := '{-1,-1,-1,0,0,1,1,1}'; df int[] := '{-1,0,1,-1,1,-1,0,1}';
  king text := case when white then 'K' else 'k' end; ksq int; n public.chess_pos;
  pf int[] := '{}'; pt int[] := '{}'; pp text[] := '{}'; k int;
begin
  up := case when white then -1 else 1 end; start_r := case when white then 6 else 1 end; last_r := case when white then 0 else 7 end;
  for sq in 0..63 loop
    pc := substr(p.b, sq + 1, 1);
    continue when pc = '.' or (pc = upper(pc)) <> white;
    r := sq / 8; fl := sq % 8;
    if upper(pc) = 'P' then
      nr := r + up;
      if nr between 0 and 7 then
        ti := nr * 8 + fl;
        if substr(p.b, ti + 1, 1) = '.' then
          if nr = last_r then foreach pr in array array['q', 'r', 'b', 'n'] loop pf := pf || sq; pt := pt || (ti); pp := pp || coalesce(pr, ''); end loop;
          else
            pf := pf || sq; pt := pt || (ti); pp := pp || coalesce(null, '');
            if r = start_r and substr(p.b, (r + 2 * up) * 8 + fl + 1, 1) = '.' then pf := pf || sq; pt := pt || ((r + 2 * up) * 8 + fl); pp := pp || coalesce(null, ''); end if;
          end if;
        end if;
        for nf in fl - 1..fl + 1 by 2 loop
          continue when nf not between 0 and 7;
          ti := nr * 8 + nf; c := substr(p.b, ti + 1, 1);
          if (c <> '.' and (c = upper(c)) <> white) or (c = '.' and ti = p.ep) then
            if nr = last_r then foreach pr in array array['q', 'r', 'b', 'n'] loop pf := pf || sq; pt := pt || (ti); pp := pp || coalesce(pr, ''); end loop;
            else pf := pf || sq; pt := pt || (ti); pp := pp || coalesce(null, ''); end if;
          end if;
        end loop;
      end if;
    elsif upper(pc) = 'N' then
      for i in 1..8 loop
        nr := r + kdr[i]; nf := fl + kdf[i];
        continue when nr not between 0 and 7 or nf not between 0 and 7;
        c := substr(p.b, nr * 8 + nf + 1, 1);
        if c = '.' or (c = upper(c)) <> white then pf := pf || sq; pt := pt || (nr * 8 + nf); pp := pp || coalesce(null, ''); end if;
      end loop;
    elsif upper(pc) = 'K' then
      for i in 1..8 loop
        nr := r + dr[i]; nf := fl + df[i];
        continue when nr not between 0 and 7 or nf not between 0 and 7;
        c := substr(p.b, nr * 8 + nf + 1, 1);
        if c = '.' or (c = upper(c)) <> white then pf := pf || sq; pt := pt || (nr * 8 + nf); pp := pp || coalesce(null, ''); end if;
      end loop;
      -- рокировка: король на начальном поле, поля между пусты, король не под шахом и не проходит через бой
      if sq = (case when white then 60 else 4 end) and not public.chess_attacked(p.b, sq, not white) then
        if position((case when white then 'K' else 'k' end) in p.castle) > 0
           and substr(p.b, sq + 2, 1) = '.' and substr(p.b, sq + 3, 1) = '.' and substr(p.b, sq + 4, 1) = (case when white then 'R' else 'r' end)
           and not public.chess_attacked(p.b, sq + 1, not white) and not public.chess_attacked(p.b, sq + 2, not white) then
          pf := pf || sq; pt := pt || (sq + 2); pp := pp || coalesce(null, '');
        end if;
        if position((case when white then 'Q' else 'q' end) in p.castle) > 0
           and substr(p.b, sq, 1) = '.' and substr(p.b, sq - 1, 1) = '.' and substr(p.b, sq - 2, 1) = '.' and substr(p.b, sq - 3, 1) = (case when white then 'R' else 'r' end)
           and not public.chess_attacked(p.b, sq - 1, not white) and not public.chess_attacked(p.b, sq - 2, not white) then
          pf := pf || sq; pt := pt || (sq - 2); pp := pp || coalesce(null, '');
        end if;
      end if;
    else
      for i in 1..8 loop
        continue when (upper(pc) = 'R' and dr[i] <> 0 and df[i] <> 0) or (upper(pc) = 'B' and (dr[i] = 0 or df[i] = 0));
        nr := r + dr[i]; nf := fl + df[i];
        while nr between 0 and 7 and nf between 0 and 7 loop
          c := substr(p.b, nr * 8 + nf + 1, 1);
          if c = '.' then pf := pf || sq; pt := pt || (nr * 8 + nf); pp := pp || coalesce(null, '');
          else
            if (c = upper(c)) <> white then pf := pf || sq; pt := pt || (nr * 8 + nf); pp := pp || coalesce(null, ''); end if;
            exit;
          end if;
          nr := nr + dr[i]; nf := nf + df[i];
        end loop;
      end loop;
    end if;
  end loop;
  for k in 1..coalesce(array_length(pf, 1), 0) loop
    n := public.chess_apply(p, pf[k], pt[k], nullif(pp[k], ''));
    ksq := position(king in n.b) - 1;
    if not public.chess_attacked(n.b, ksq, not white) then f := pf[k]; t := pt[k]; promo := nullif(pp[k], ''); return next; end if;
  end loop;
end $$;

-- Ход в UCI → новый FEN или null, если ход нелегален
create or replace function public.chess_move(fen text, uci text) returns text
language plpgsql immutable as $$
declare p public.chess_pos := public.chess_from_fen(fen); fi int; ti int; pr text; ok boolean;
begin
  if uci !~ '^[a-h][1-8][a-h][1-8][qrbn]?$' then return null; end if;
  fi := (8 - substr(uci, 2, 1)::int) * 8 + ascii(substr(uci, 1, 1)) - 97;
  ti := (8 - substr(uci, 4, 1)::int) * 8 + ascii(substr(uci, 3, 1)) - 97;
  pr := nullif(substr(uci, 5, 1), '');
  select true into ok from public.chess_moves(p) m where m.f = fi and m.t = ti and m.promo is not distinct from pr;
  if ok is not true then return null; end if;
  return public.chess_to_fen(public.chess_apply(p, fi, ti, pr));
end $$;

create or replace function public.chess_uci(f int, t int, promo text) returns text
language sql immutable as $$ select chr(97 + f % 8) || (8 - f / 8) || chr(97 + t % 8) || (8 - t / 8) || coalesce(promo, '') $$;

-- Легальные ходы позиции одной строкой, отсортированные (для тестов и отладки)
create or replace function public.chess_legal_uci(fen text) returns text
language sql immutable as $$
  select coalesce(string_agg(public.chess_uci(f, t, promo), ' ' order by public.chess_uci(f, t, promo)), '') from public.chess_moves(public.chess_from_fen(fen))
$$;

-- Состояние позиции для сторон, чей ход: 'checkmate' | 'stalemate' | 'insufficient' | 'fifty' | 'ok'
create or replace function public.chess_status(fen text) returns text
language plpgsql immutable as $$
declare p public.chess_pos := public.chess_from_fen(fen); white boolean := (p.turn = 'w'); has boolean; check_ boolean;
  minors int := 0; others int := 0; i int; c text; bishops_light int := 0; bishops_dark int := 0; nb int := 0; nn int := 0;
begin
  select exists (select 1 from public.chess_moves(p)) into has;
  check_ := public.chess_attacked(p.b, position((case when white then 'K' else 'k' end) in p.b) - 1, not white);
  if not has then return case when check_ then 'checkmate' else 'stalemate' end; end if;
  for i in 0..63 loop
    c := upper(substr(p.b, i + 1, 1));
    if c in ('.', 'K') then continue; end if;
    if c = 'B' then nb := nb + 1; if ((i / 8) + (i % 8)) % 2 = 0 then bishops_light := bishops_light + 1; else bishops_dark := bishops_dark + 1; end if;
    elsif c = 'N' then nn := nn + 1;
    else others := others + 1; end if;
  end loop;
  if others = 0 and ((nb + nn = 0) or (nb + nn = 1) or (nn = 0 and (bishops_light = 0 or bishops_dark = 0))) then return 'insufficient'; end if;
  if p.half >= 100 then return 'fifty'; end if;
  return 'ok';
end $$;

-- Ключ позиции для троекратного повторения: без счётчиков ходов; en passant — только если взятие реально возможно
create or replace function public.chess_key(fen text) returns text
language plpgsql immutable as $$
declare p public.chess_pos := public.chess_from_fen(fen); legal_ep boolean := false;
begin
  if p.ep >= 0 then
    select exists (select 1 from public.chess_moves(p) m where m.t = p.ep and upper(substr(p.b, m.f + 1, 1)) = 'P') into legal_ep;
  end if;
  return p.b || ' ' || p.turn || ' ' || p.castle || ' ' || case when legal_ep then p.ep::text else '-' end;
end $$;

-- Количество ходов-листьев на глубине (для проверки по эталонным значениям perft)
create or replace function public.chess_perft(fen text, depth int) returns bigint
language plpgsql immutable as $$
declare p public.chess_pos := public.chess_from_fen(fen); m record; total bigint := 0; mv public.chess_pos[]; i int;
begin
  if depth = 0 then return 1; end if;
  mv := array(select public.chess_apply(p, x.f, x.t, x.promo) from public.chess_moves(p) x);
  if depth = 1 then return coalesce(array_length(mv, 1), 0); end if;
  for i in 1..coalesce(array_length(mv, 1), 0) loop
    total := total + public.chess_perft(public.chess_to_fen(mv[i]), depth - 1);
  end loop;
  return total;
end $$;

-- РЕЙТИНГ (Эло внутри приложения). Читать могут все вошедшие; писать — только функции ниже.
create table if not exists public.online_ratings (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  rating     int not null default 1200 check (rating between 100 and 4000),
  peak       int not null default 1200,
  games      int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.online_ratings enable row level security;
drop policy if exists "ratings select" on public.online_ratings;
create policy "ratings select" on public.online_ratings for select to authenticated using (true);
revoke insert, update, delete on public.online_ratings from anon, authenticated;
grant select on public.online_ratings to authenticated;

create or replace function public.online_rating_of(u uuid) returns int
language sql stable security definer set search_path = public as $$ select coalesce((select rating from public.online_ratings where user_id = u), 1200) $$;

-- Пересчёт рейтинга при завершении партии с рейтингом: только если сыграно не менее 4 полуходов, игроки разные
-- и между одной и той же парой не больше 5 партий с рейтингом за 24 часа (защита от накрутки).
create or replace function public.online_rate() returns trigger
language plpgsql security definer set search_path = public as $$
declare rw int; rb int; gw int; gb int; ew numeric; sw numeric; kw int; kb int; dw int; db int; pair int;
begin
  if new.status = 'finished' and old.status is distinct from 'finished' and new.result is not null and new.rated and not new.rating_applied
     and coalesce(array_length(new.moves, 1), 0) >= 4 and new.white is not null and new.black is not null and new.white <> new.black then
    select count(*) into pair from public.online_games o where o.id <> new.id and o.rated and o.rating_applied
      and ((o.white = new.white and o.black = new.black) or (o.white = new.black and o.black = new.white)) and o.updated_at > now() - interval '24 hours';
    if pair >= 5 then new.rated := false; return new; end if;
    insert into public.online_ratings (user_id) values (new.white), (new.black) on conflict do nothing;
    select rating, games into rw, gw from public.online_ratings where user_id = new.white for update;
    select rating, games into rb, gb from public.online_ratings where user_id = new.black for update;
    ew := 1 / (1 + power(10, (rb - rw) / 400.0));
    sw := case new.result when '1-0' then 1 when '0-1' then 0 else 0.5 end;
    kw := case when gw < 20 then 40 else 20 end; kb := case when gb < 20 then 40 else 20 end;
    dw := round(kw * (sw - ew)); db := round(kb * ((1 - sw) - (1 - ew)));
    update public.online_ratings set rating = greatest(100, rating + dw), peak = greatest(peak, rating + dw), games = games + 1, updated_at = now() where user_id = new.white;
    update public.online_ratings set rating = greatest(100, rating + db), peak = greatest(peak, rating + db), games = games + 1, updated_at = now() where user_id = new.black;
    new.white_elo := rw; new.black_elo := rb; new.white_delta := dw; new.black_delta := db; new.rating_applied := true;
  end if;
  return new;
end $$;
drop trigger if exists online_rate_trg on public.online_games;
create trigger online_rate_trg before update on public.online_games for each row execute function public.online_rate();

create or replace function public.online_my_rating() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('rating', rating, 'peak', peak, 'games', games) from public.online_ratings where user_id = auth.uid()),
                  jsonb_build_object('rating', 1200, 'peak', 1200, 'games', 0))
$$;

-- Текущее положение (FEN) партии: для партий, начатых до появления проверки ходов, восстанавливается из списка ходов
create or replace function public.online_fen(g public.online_games) returns text
language plpgsql volatile as $$
declare f text := 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'; u text;
begin
  if coalesce(array_length(g.moves, 1), 0) = 0 or array_length(g.pos_hist, 1) >= array_length(g.moves, 1) + 1 then return g.fen; end if;
  foreach u in array g.moves loop f := public.chess_move(f, u); exit when f is null; end loop;
  return f;
end $$;

-- Ход. Время считает сервер; если время вышло, ход не принимается и партия заканчивается по времени.
create or replace function public.online_move(p_id uuid, p_uci text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); g public.online_games; n int; left_ms int; w boolean; cur text; nf text; st text; k text; reps int; hist text[]; res text; why text;
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
  -- правила: ход должен быть легальным в текущей позиции
  cur := public.online_fen(g);
  nf := public.chess_move(cur, p_uci);
  if nf is null then raise exception 'illegal_move'; end if;
  hist := case when coalesce(array_length(g.pos_hist, 1), 0) = 0 then array[public.chess_key(cur)] else g.pos_hist end;
  k := public.chess_key(nf);
  hist := array_append(hist, k);
  select count(*) into reps from unnest(hist) x where x = k;
  st := public.chess_status(nf);
  if st = 'checkmate' then res := case when w then '1-0' else '0-1' end; why := 'checkmate';
  elsif st in ('stalemate', 'insufficient', 'fifty') then res := '1/2-1/2'; why := st;
  elsif reps >= 3 then res := '1/2-1/2'; why := 'repetition'; end if;
  update public.online_games set
    moves = array_append(moves, p_uci), fen = nf, pos_hist = hist, draw_offer = null, turn_started = clock_timestamp(), updated_at = now(),
    white_ms = case when w and left_ms is not null then left_ms + inc_ms else white_ms end,
    black_ms = case when not w and left_ms is not null then left_ms + inc_ms else black_ms end,
    status = case when res is null then status else 'finished' end, result = res, reason = why
    where id = g.id returning * into g;
  return public.online_view(g);
end $$;

-- Конец партии по правилам: результат определяет сервер по позиции, а не клиент (запрос клиента нужен лишь как повод проверить).
-- Обычно партия заканчивается сама в online_move; эта функция добивает случай, когда ход был принят старой версией.
create or replace function public.online_finish(p_id uuid, p_result text, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.online_games; cur text; st text; res text; why text; n int; reps int;
begin
  select * into g from public.online_games where id = p_id for update;
  if not found or (uid is distinct from g.white and uid is distinct from g.black) then raise exception 'not_found'; end if;
  if g.status = 'finished' then return public.online_view(g); end if;
  if g.status <> 'active' then raise exception 'not_active'; end if;
  cur := public.online_fen(g); n := coalesce(array_length(g.moves, 1), 0);
  st := public.chess_status(cur);
  select count(*) into reps from unnest(g.pos_hist) x where x = public.chess_key(cur);
  if st = 'checkmate' then res := case when n % 2 = 1 then '1-0' else '0-1' end; why := 'checkmate';
  elsif st in ('stalemate', 'insufficient', 'fifty') then res := '1/2-1/2'; why := st;
  elsif reps >= 3 then res := '1/2-1/2'; why := 'repetition';
  else raise exception 'bad_reason'; end if;
  update public.online_games set status = 'finished', result = res, reason = why, draw_offer = null, updated_at = now()
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

-- Реакции: только готовые фразы из белого списка (свободного текста нет, модерация не нужна); не чаще раза в 3 секунды от одного игрока
create or replace function public.online_emote(p_id uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.online_games; me text;
begin
  if p_code is null or p_code not in ('gl', 'gg', 'nice', 'oops', 'thanks', 'wow') then raise exception 'bad_emote'; end if;
  select * into g from public.online_games where id = p_id and auth.uid() in (white, black) for update;
  if not found then raise exception 'not_found'; end if;
  if g.status = 'waiting' then raise exception 'not_active'; end if;
  me := case when auth.uid() = g.white then 'w' else 'b' end;
  if g.emote_by is not distinct from me and g.emote_at > clock_timestamp() - interval '3 seconds' then raise exception 'too_fast'; end if;
  update public.online_games set emote = p_code, emote_by = me, emote_seq = emote_seq + 1, emote_at = clock_timestamp(), updated_at = now()
    where id = g.id returning * into g;
  return public.online_view(g);
end $$;
revoke all on function public.online_emote(uuid, text) from public, anon;
grant execute on function public.online_emote(uuid, text) to authenticated;

-- ЛОББИ: быстрый поиск и список открытых вызовов (вызов живёт, пока создатель его «пингует» через online_get; 45 секунд без пинга — вызов считается устаревшим)

-- Быстрая игра: берёт самый старый свежий открытый вызов с тем же контролем времени (не свой), иначе создаёт открытый вызов со случайным цветом
create or replace function public.online_seek(p_name text, p_base_s int, p_inc_s int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); g public.online_games; nm text := left(coalesce(nullif(trim(p_name), ''), 'Player'), 24); c text; rme int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_base_s < 0 or p_base_s > 10800 or p_inc_s < 0 or p_inc_s > 60 then raise exception 'bad_time'; end if;
  -- свои старые ожидающие вызовы закрываем, чтобы не копились
  update public.online_games set status = 'finished', reason = 'aborted', is_open = false, updated_at = now()
    where creator = uid and status = 'waiting' and is_open;
  -- подбор по рейтингу: допустимая разница 100 очков и ещё 10 очков за каждую секунду ожидания вызова (за 45 с вызов открывается для всех)
  rme := public.online_rating_of(uid);
  select * into g from public.online_games o
    where o.is_open and o.status = 'waiting' and o.creator <> uid and o.base_ms = p_base_s * 1000 and o.inc_ms = p_inc_s * 1000
      and o.updated_at > now() - interval '45 seconds'
      and abs(public.online_rating_of(o.creator) - rme) <= 100 + 10 * extract(epoch from (now() - o.created_at))
    order by abs(public.online_rating_of(o.creator) - rme), o.created_at limit 1 for update skip locked;
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
    insert into public.online_games (code, creator, white, white_name, base_ms, inc_ms, white_ms, black_ms, is_open, rated)
    values (c, uid, uid, nm, p_base_s * 1000, p_inc_s * 1000, p_base_s * 1000, p_base_s * 1000, true, true) returning * into g;
  else
    insert into public.online_games (code, creator, black, black_name, base_ms, inc_ms, white_ms, black_ms, is_open, rated)
    values (c, uid, uid, nm, p_base_s * 1000, p_inc_s * 1000, p_base_s * 1000, p_base_s * 1000, true, true) returning * into g;
  end if;
  return public.online_view(g);
end $$;

-- Показать свою ожидающую партию в списке открытых вызовов (или убрать из него)
create or replace function public.online_publish(p_id uuid, p_open boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.online_games;
begin
  update public.online_games set is_open = (p_open and status = 'waiting'), rated = (p_open and status = 'waiting'), updated_at = now()
    where id = p_id and creator = auth.uid() returning * into g;
  if not found then raise exception 'not_found'; end if;
  return public.online_view(g);
end $$;

-- Открытые вызовы других игроков (без id и кода участников: для входа нужен только код вызова)
create or replace function public.online_open_list() returns jsonb
language sql security definer set search_path = public volatile as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'code', code, 'name', case when white is not null then white_name else black_name end,
      'side', case when white is not null then 'w' else 'b' end, 'rating', public.online_rating_of(creator), 'base_ms', base_ms, 'inc_ms', inc_ms, 'created_at', created_at)
    order by created_at), '[]'::jsonb)
  from (select * from public.online_games
        where is_open and status = 'waiting' and creator <> auth.uid() and updated_at > now() - interval '45 seconds'
        order by created_at limit 30) o
$$;

revoke all on function public.online_seek(text, int, int), public.online_publish(uuid, boolean), public.online_open_list(), public.online_my_rating() from public, anon;
grant execute on function public.online_seek(text, int, int), public.online_publish(uuid, boolean), public.online_open_list(), public.online_my_rating() to authenticated;

-- Внутренние функции правил шахмат и рейтинга вызываются только из функций выше (от имени владельца), напрямую их вызывать не нужно
revoke all on function public.chess_from_fen(text), public.chess_to_fen(public.chess_pos), public.chess_attacked(text, int, boolean), public.chess_apply(public.chess_pos, int, int, text),
  public.chess_moves(public.chess_pos), public.chess_move(text, text), public.chess_uci(int, int, text), public.chess_legal_uci(text), public.chess_status(text), public.chess_key(text),
  public.chess_perft(text, int), public.online_fen(public.online_games), public.online_rating_of(uuid) from public, anon, authenticated;

revoke all on function public.online_create(text, text, int, int), public.online_join(text, text), public.online_get(uuid), public.online_move(uuid, text),
  public.online_finish(uuid, text, text), public.online_resign(uuid), public.online_offer_draw(uuid), public.online_decline_draw(uuid),
  public.online_flag(uuid), public.online_abort(uuid) from public, anon;
grant execute on function public.online_create(text, text, int, int), public.online_join(text, text), public.online_get(uuid), public.online_move(uuid, text),
  public.online_finish(uuid, text, text), public.online_resign(uuid), public.online_offer_draw(uuid), public.online_decline_draw(uuid),
  public.online_flag(uuid), public.online_abort(uuid) to authenticated;
