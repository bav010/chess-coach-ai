\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.as_root() returns void language plpgsql as $$ begin execute 'reset role'; end $$;
create or replace function pg_temp.must_fail(sql text, expect text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if sqlerrm like '%' || expect || '%' then return; end if;
    raise exception 'ожидали ошибку % но получили: %', expect, sqlerrm;
  end;
  raise exception 'ожидали ошибку %, но вызов прошёл: %', expect, sql;
end $$;

do $t$
declare
  A text := '11111111-1111-1111-1111-111111111111'; B text := '22222222-2222-2222-2222-222222222222'; C text := '33333333-3333-3333-3333-333333333333';
  g jsonb; gid uuid; code text; n int;
begin
  -- 1. создание: белыми, 5+3
  perform pg_temp.as_user(A);
  g := public.online_create('Ann', 'w', 300, 3); gid := (g->>'id')::uuid; code := g->>'code';
  assert g->>'status' = 'waiting' and (g->>'white')::text = A and g->>'black' is null, 'создание';
  assert (g->>'white_ms')::int = 300000 and (g->>'inc_ms')::int = 3000, 'часы при создании';
  perform pg_temp.must_fail('select public.online_create(''x'',''w'',99999,0)', 'bad_time');
  -- 2. чужой не видит ожидающую партию и не может ходить, но может войти по коду
  perform pg_temp.as_user(C);
  select count(*) into n from public.online_games; assert n = 0, 'посторонний видит чужую партию';
  perform pg_temp.must_fail(format('select public.online_get(%L)', gid), 'not_found');
  perform pg_temp.must_fail(format('select public.online_move(%L,''e2e4'')', gid), 'not_found');
  -- прямые изменения таблицы запрещены
  perform pg_temp.must_fail(format('update public.online_games set status=''finished'' where id=%L', gid), 'permission denied');
  perform pg_temp.must_fail('insert into public.online_games (code, creator) values (''zz'', ''' || C || ''')', 'permission denied');
  -- 3. вход соперника
  perform pg_temp.as_user(B);
  g := public.online_join(upper(code), 'Bob');
  assert g->>'status' = 'active' and g->>'black' = B and g->>'black_name' = 'Bob', 'вход';
  -- третий не может войти
  perform pg_temp.as_user(C);
  perform pg_temp.must_fail(format('select public.online_join(%L,''Cy'')', code), 'full');
  perform pg_temp.must_fail('select public.online_join(''nonexist'',''Cy'')', 'not_found');
  -- 4. очерёдность ходов и формат
  perform pg_temp.as_user(B);
  perform pg_temp.must_fail(format('select public.online_move(%L,''e7e5'')', gid), 'not_your_turn');
  perform pg_temp.as_user(A);
  perform pg_temp.must_fail(format('select public.online_move(%L,''hello'')', gid), 'bad_move');
  g := public.online_move(gid, 'e2e4');
  assert g->'moves' = '["e2e4"]'::jsonb, 'ход записан';
  assert (g->>'white_ms')::int >= 300000 + 3000 - 2000, 'инкремент добавлен: ' || (g->>'white_ms');
  perform pg_temp.must_fail(format('select public.online_move(%L,''d2d4'')', gid), 'not_your_turn');
  perform pg_temp.as_user(B);
  g := public.online_move(gid, 'e7e5');
  assert jsonb_array_length(g->'moves') = 2, 'второй ход';
  -- 5. ничья: предложение, отказ, принятие
  g := public.online_offer_draw(gid); assert g->>'draw_offer' = 'b', 'предложение от чёрных';
  perform pg_temp.as_user(A);
  g := public.online_decline_draw(gid); assert g->>'draw_offer' is null, 'отказ снимает предложение';
  g := public.online_offer_draw(gid); assert g->>'draw_offer' = 'w';
  perform pg_temp.as_user(B);
  g := public.online_offer_draw(gid);
  assert g->>'status' = 'finished' and g->>'result' = '1/2-1/2' and g->>'reason' = 'agreed', 'ничья принята';
  perform pg_temp.must_fail(format('select public.online_move(%L,''g1f3'')', gid), 'not_active');
  -- 6. сдача
  perform pg_temp.as_user(A);
  g := public.online_create('Ann', 'b', 0, 0); gid := (g->>'id')::uuid; code := g->>'code';
  perform pg_temp.as_user(B); perform public.online_join(code, 'Bob');
  g := public.online_move(gid, 'e2e4');   -- белые: B (A выбрал чёрных)
  perform pg_temp.as_user(A); g := public.online_resign(gid);
  assert g->>'result' = '1-0' and g->>'reason' = 'resign', 'сдача чёрных = победа белых';
  -- 7. мат: проверка чётности и допустимых причин
  perform pg_temp.as_user(A); g := public.online_create('Ann','w',0,0); gid := (g->>'id')::uuid; code := g->>'code';
  perform pg_temp.as_user(B); perform public.online_join(code,'Bob');
  perform pg_temp.as_user(A); perform public.online_move(gid,'f2f3');
  perform pg_temp.as_user(B); perform public.online_move(gid,'e7e5');
  perform pg_temp.as_user(A); perform public.online_move(gid,'g2g4');
  perform pg_temp.as_user(B); perform public.online_move(gid,'d8h4');
  perform pg_temp.must_fail(format('select public.online_finish(%L,''1-0'',''checkmate'')', gid), 'bad_result');
  perform pg_temp.must_fail(format('select public.online_finish(%L,''0-1'',''whatever'')', gid), 'bad_reason');
  g := public.online_finish(gid, '0-1', 'checkmate'); assert g->>'result' = '0-1', 'мат';
  perform pg_temp.as_user(A); g := public.online_finish(gid, '0-1', 'checkmate'); assert g->>'status' = 'finished', 'повторное завершение идемпотентно';
  -- 8. время: партия 1 секунда без инкремента; ждём и проверяем флажок и отказ хода
  g := public.online_create('Ann','w',1,0); gid := (g->>'id')::uuid; code := g->>'code';
  perform pg_temp.as_user(B); perform public.online_join(code,'Bob');
  perform pg_sleep(1.3);
  g := public.online_flag(gid);
  assert g->>'status' = 'finished' and g->>'result' = '0-1' and g->>'reason' = 'timeout', 'флажок белых';
  perform pg_temp.as_user(A); g := public.online_create('Ann','w',1,0); gid := (g->>'id')::uuid; code := g->>'code';
  perform pg_temp.as_user(B); perform public.online_join(code,'Bob');
  perform pg_sleep(1.3); perform pg_temp.as_user(A);
  g := public.online_move(gid, 'e2e4');
  assert g->>'status' = 'finished' and g->>'reason' = 'timeout' and jsonb_array_length(g->'moves') = 0, 'ход после истечения времени не принят';
  -- флажок раньше времени не срабатывает
  g := public.online_create('Ann','w',600,0); gid := (g->>'id')::uuid; code := g->>'code';
  perform pg_temp.as_user(B); perform public.online_join(code,'Bob');
  g := public.online_flag(gid); assert g->>'status' = 'active', 'ранний флажок отклонён';
  -- 9. отмена: до двух ходов можно, после — нет
  g := public.online_abort(gid); assert g->>'status' = 'finished' and g->>'reason' = 'aborted', 'отмена';
  perform pg_temp.as_user(A); g := public.online_create('Ann','w',0,0); gid := (g->>'id')::uuid;
  g := public.online_abort(gid); assert g->>'reason' = 'aborted', 'отмена ожидающей';
  -- 10. список своих партий виден участнику и только ему
  perform pg_temp.as_user(C); select count(*) into n from public.online_games; assert n = 0, 'C ничего не видит';
  perform pg_temp.as_user(A); select count(*) into n from public.online_games; assert n >= 5, 'A видит свои';
  perform pg_temp.as_root();
  raise notice 'ВСЕ ПРОВЕРКИ SQL ПРОЙДЕНЫ';
end $t$;
