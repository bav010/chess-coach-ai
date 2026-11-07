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
