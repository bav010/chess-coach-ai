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

create or replace function pg_temp.play(p_id uuid, wh text, bl text, mv text[]) returns void language plpgsql as $f$
declare i int;
begin
  for i in 1..array_length(mv, 1) loop
    perform pg_temp.as_user(case when i % 2 = 1 then wh else bl end);
    perform public.online_move(p_id, mv[i]);
  end loop;
end $f$;

do $t$
declare
  A text := '11111111-1111-1111-1111-111111111111'; B text := '22222222-2222-2222-2222-222222222222'; C text := '33333333-3333-3333-3333-333333333333';
  g jsonb; gid uuid; code text; n int; wh text; bl text; i int;
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
  g := public.online_get(gid); assert g->>'status' = 'finished' and g->>'result' = '0-1' and g->>'reason' = 'checkmate', 'мат фиксирует сам сервер при ходе';
  g := public.online_finish(gid, '1-0', 'draw'); assert g->>'result' = '0-1', 'результат не зависит от того, что утверждает клиент';
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
  -- 11. лобби: быстрый поиск, открытые вызовы, устаревание
  perform pg_temp.as_user(A); g := public.online_seek('Ann',300,3);
  assert g->>'status' = 'waiting' and (g->>'is_open')::boolean, 'поиск создаёт открытый вызов';
  gid := (g->>'id')::uuid;
  g := public.online_seek('Ann',300,3); assert g->>'status' = 'waiting' and (g->>'id')::uuid <> gid, 'сам с собой не играет, старый вызов закрыт';
  gid := (g->>'id')::uuid;
  perform pg_temp.as_user(B); g := public.online_open_list();
  assert jsonb_array_length(g) = 1 and g->0->>'name' = 'Ann' and (g->0->>'base_ms')::int = 300000 and g->0->>'code' is not null and not (g->0 ? 'id'), 'список открытых вызовов';
  g := public.online_seek('Bob',300,0); assert g->>'status' = 'waiting', 'другой контроль времени не совпадает';
  g := public.online_seek('Bob',300,3);
  assert g->>'status' = 'active' and not (g->>'is_open')::boolean and g->>'white' is not null and g->>'black' is not null, 'совпадение найдено';
  assert (g->>'id')::uuid = gid, 'вошёл в вызов Ann';
  perform pg_temp.as_user(C); assert jsonb_array_length(public.online_open_list()) = 0, 'занятые и закрытые вызовы не в списке';
  -- устаревший вызов не подбирается
  perform pg_temp.as_user(A); g := public.online_seek('Ann',60,0); gid := (g->>'id')::uuid;
  perform pg_temp.as_root(); update public.online_games set updated_at = now() - interval '60 seconds' where id = gid;
  perform pg_temp.as_user(C); assert jsonb_array_length(public.online_open_list()) = 0, 'устаревший вызов скрыт';
  g := public.online_seek('Cat',60,0); assert g->>'status' = 'waiting' and (g->>'id')::uuid <> gid, 'устаревший не подобран';
  -- пинг продлевает вызов
  perform pg_temp.as_root(); update public.online_games set updated_at = now() - interval '60 seconds' where id = gid;
  perform pg_temp.as_user(A); perform public.online_get(gid);
  perform pg_temp.as_user(B); assert jsonb_array_length(public.online_open_list()) >= 1, 'пинг продлил вызов';
  -- публикация обычной партии и вход по коду закрывает вызов
  perform pg_temp.as_user(A); g := public.online_create('Ann','b',600,0); gid := (g->>'id')::uuid; code := g->>'code';
  perform pg_temp.as_user(B); assert (select count(*) from jsonb_array_elements(public.online_open_list()) e where e->>'code' = code) = 0, 'приватная партия не видна';
  perform pg_temp.as_user(A); g := public.online_publish(gid, true); assert (g->>'is_open')::boolean, 'опубликована';
  perform pg_temp.as_user(B); assert (select count(*) from jsonb_array_elements(public.online_open_list()) e where e->>'code' = code and e->>'side' = 'b') = 1, 'виден, создатель чёрными';
  perform pg_temp.must_fail(format('select public.online_publish(%L,true)', gid), 'not_found');
  g := public.online_join(code,'Bob'); assert g->>'status' = 'active' and not (g->>'is_open')::boolean, 'вход закрыл вызов';
  perform pg_temp.as_user(A); g := public.online_seek('Ann',999,0); gid := (g->>'id')::uuid; g := public.online_abort(gid);
  assert not (g->>'is_open')::boolean, 'отмена закрывает вызов';
  -- 12. реакции
  perform pg_temp.as_user(A); g := public.online_create('Ann','w',300,0); gid := (g->>'id')::uuid; code := g->>'code';
  perform pg_temp.must_fail(format('select public.online_emote(%L,%L)', gid, 'gl'), 'not_active');
  perform pg_temp.as_user(B); g := public.online_join(code,'Bob');
  perform pg_temp.as_user(A); g := public.online_emote(gid,'gl'); assert g->>'emote' = 'gl' and g->>'emote_by' = 'w' and (g->>'emote_seq')::int = 1, 'реакция записана';
  perform pg_temp.must_fail(format('select public.online_emote(%L,%L)', gid, 'gg'), 'too_fast');
  perform pg_temp.must_fail(format('select public.online_emote(%L,%L)', gid, 'hello world'), 'bad_emote');
  perform pg_temp.as_user(B); g := public.online_emote(gid,'gg'); assert g->>'emote_by' = 'b' and (g->>'emote_seq')::int = 2, 'другой игрок отвечает сразу';
  perform pg_temp.as_user(C); perform pg_temp.must_fail(format('select public.online_emote(%L,%L)', gid, 'gg'), 'not_found');
  -- 13. правила на сервере: нелегальные ходы, пат, повторение, правило 50 ходов, превращение, рокировка, en passant
  perform pg_temp.as_user(A); g := public.online_create('Ann','w',0,0); gid := (g->>'id')::uuid; code := g->>'code';
  perform pg_temp.as_user(B); perform public.online_join(code,'Bob'); perform pg_temp.as_user(A);
  perform pg_temp.must_fail(format('select public.online_move(%L,''e2e5'')', gid), 'illegal_move');
  perform pg_temp.must_fail(format('select public.online_move(%L,''e1e2'')', gid), 'illegal_move');
  perform pg_temp.must_fail(format('select public.online_move(%L,''a1a2'')', gid), 'illegal_move');
  perform pg_temp.must_fail(format('select public.online_move(%L,''b1b3'')', gid), 'illegal_move');
  g := public.online_move(gid,'g1f3'); assert g->>'fen' like '%RNBQKB1R b%', 'FEN обновлён';
  -- повторение: конь туда-обратно
  perform pg_temp.as_user(B); perform public.online_move(gid,'g8f6');
  perform pg_temp.as_user(A); perform public.online_move(gid,'f3g1'); perform pg_temp.as_user(B); perform public.online_move(gid,'f6g8');
  perform pg_temp.as_user(A); perform public.online_move(gid,'g1f3'); perform pg_temp.as_user(B); perform public.online_move(gid,'g8f6');
  perform pg_temp.as_user(A); perform public.online_move(gid,'f3g1'); perform pg_temp.as_user(B); g := public.online_move(gid,'f6g8');
  assert g->>'status' = 'finished' and g->>'reason' = 'repetition' and g->>'result' = '1/2-1/2', 'троекратное повторение';
  -- пат (позиция Сэма Лойда в 10 ходов — короче: ферзь ставит пат; проверяем готовой цепочкой ходов)
  perform pg_temp.as_user(A); g := public.online_create('Ann','w',0,0); gid := (g->>'id')::uuid; code := g->>'code';
  perform pg_temp.as_user(B); perform public.online_join(code,'Bob');
  perform pg_temp.as_root(); update public.online_games set fen = '7k/8/4Q1K1/8/8/8/8/8 w - - 0 1', moves = '{}' where id = gid;
  perform pg_temp.as_user(A); g := public.online_move(gid,'e6f7'); assert g->>'status' = 'finished' and g->>'reason' = 'stalemate' and g->>'result' = '1/2-1/2', 'пат';
  -- превращение и обязательность буквы
  perform pg_temp.as_user(A); g := public.online_create('Ann','w',0,0); gid := (g->>'id')::uuid; code := g->>'code';
  perform pg_temp.as_user(B); perform public.online_join(code,'Bob');
  perform pg_temp.as_root(); update public.online_games set fen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1' where id = gid;
  perform pg_temp.as_user(A);
  perform pg_temp.must_fail(format('select public.online_move(%L,''a7a8'')', gid), 'illegal_move');
  perform pg_temp.must_fail(format('select public.online_move(%L,''a7a8k'')', gid), 'bad_move');
  g := public.online_move(gid,'a7a8q'); assert g->>'fen' like 'Q3k3/8/%', 'ферзь на a8 с шахом';
  -- рокировка через бой и en passant
  perform pg_temp.as_user(A); g := public.online_create('Ann','w',0,0); gid := (g->>'id')::uuid; code := g->>'code';
  perform pg_temp.as_user(B); perform public.online_join(code,'Bob');
  perform pg_temp.as_root(); update public.online_games set fen = 'r3k2r/8/8/8/8/5r2/8/R3K2R w KQkq - 0 1' where id = gid;
  perform pg_temp.as_user(A);
  perform pg_temp.must_fail(format('select public.online_move(%L,''e1g1'')', gid), 'illegal_move');
  g := public.online_move(gid,'e1c1'); assert g->>'fen' like 'r3k2r/8/8/8/8/5r2/8/2KR3R b kq%', 'длинная рокировка';
  perform pg_temp.as_user(A); g := public.online_create('Ann','w',0,0); gid := (g->>'id')::uuid; code := g->>'code';
  perform pg_temp.as_user(B); perform public.online_join(code,'Bob');
  perform pg_temp.as_root(); update public.online_games set fen = '4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1' where id = gid;
  perform pg_temp.as_user(A); perform public.online_move(gid,'e2e4');
  perform pg_temp.as_user(B); g := public.online_move(gid,'d4e3'); assert g->>'fen' like '4k3/8/8/8/8/4p3/8/4K3 w%', 'взятие на проходе убрало пешку e4';
  -- 14. рейтинг: только быстрый поиск/открытые вызовы, не менее 4 полуходов, Эло, защита пары
  perform pg_temp.as_user(A); g := public.online_create('Ann','w',0,0); gid := (g->>'id')::uuid; code := g->>'code';
  perform pg_temp.as_user(B); perform public.online_join(code,'Bob'); perform pg_temp.as_user(A); perform public.online_move(gid,'e2e4'); g := public.online_resign(gid);
  assert not (g->>'rated')::boolean and g->'white_delta' = 'null'::jsonb, 'партия по ссылке рейтинг не меняет';
  perform pg_temp.as_user(A); g := public.online_seek('Ann',300,0);
  perform pg_temp.as_user(B); g := public.online_seek('Bob',300,0); gid := (g->>'id')::uuid;
  assert g->>'status' = 'active' and (g->>'rated')::boolean, 'быстрая игра — с рейтингом';
  assert (g->>'white_rating')::int = 1200 and (g->>'black_rating')::int = 1200, 'старт 1200';
  wh := g->>'white'; bl := g->>'black';
  perform pg_temp.as_user(bl); g := public.online_resign(gid);
  assert g->'white_delta' = 'null'::jsonb, 'сдача до 4 полуходов рейтинг не меняет';
  for i in 1..2 loop
    perform pg_temp.as_user(A); g := public.online_seek('Ann',300,0);
    perform pg_temp.as_user(B); g := public.online_seek('Bob',300,0); gid := (g->>'id')::uuid; wh := g->>'white'; bl := g->>'black';
    perform pg_temp.play(gid, wh, bl, array['e2e4','e7e5','g1f3','b8c6']);
    perform pg_temp.as_user(bl); g := public.online_resign(gid);
    if i = 1 then
      assert (g->>'white_delta')::int = 20 and (g->>'black_delta')::int = -20 and (g->>'white_elo')::int = 1200, 'первая партия: ±20 (K=40, ожидание 0.5)';
      perform pg_temp.as_user(wh); assert (public.online_my_rating()->>'rating')::int = 1220 and (public.online_my_rating()->>'games')::int = 1, 'рейтинг победителя';
      perform pg_temp.as_user(bl); assert (public.online_my_rating()->>'rating')::int = 1180, 'рейтинг проигравшего';
    end if;
  end loop;
  -- защита от накрутки: после 5 партий пары за сутки следующая идёт без рейтинга
  for i in 1..4 loop
    perform pg_temp.as_user(A); g := public.online_seek('Ann',300,0);
    perform pg_temp.as_user(B); g := public.online_seek('Bob',300,0); gid := (g->>'id')::uuid; wh := g->>'white'; bl := g->>'black';
    perform pg_temp.play(gid, wh, bl, array['e2e4','e7e5','g1f3','b8c6']);
    perform pg_temp.as_user(bl); g := public.online_resign(gid);
  end loop;
  assert not (g->>'rated')::boolean and g->'white_delta' = 'null'::jsonb, 'шестая партия пары за сутки без рейтинга';
  -- подбор по рейтингу: далёкий по рейтингу не подходит, пока вызов «свежий»
  perform pg_temp.as_root(); insert into public.online_ratings (user_id, rating, peak, games) values (C::uuid, 1700, 1700, 30) on conflict (user_id) do update set rating = 1700, peak = 1700; update public.online_ratings set rating = 1200 where user_id = A::uuid;
  perform pg_temp.as_user(C); g := public.online_seek('Cat',180,2);
  perform pg_temp.as_user(A); g := public.online_seek('Ann',180,2); assert g->>'status' = 'waiting', 'разница 500 очков: не соединяем сразу';
  perform pg_temp.as_root(); update public.online_games set created_at = now() - interval '44 seconds' where id = (g->>'id')::uuid;
  perform pg_temp.as_user(C); g := public.online_seek('Cat',180,2); assert g->>'status' = 'active', 'окно расширилось с ожиданием';
  -- ничья по соглашению пересчитывает рейтинг (результат 0.5)
  perform pg_temp.as_user(A); g := public.online_seek('Ann',120,1);
  perform pg_temp.as_root(); update public.online_ratings set rating = 1500 where user_id = C::uuid; update public.online_ratings set rating = 1500 where user_id = A::uuid;
  perform pg_temp.as_user(C); g := public.online_seek('Cat',120,1); gid := (g->>'id')::uuid; wh := g->>'white'; bl := g->>'black';
  perform pg_temp.play(gid, wh, bl, array['e2e4','e7e5','g1f3','b8c6']);
  perform pg_temp.as_user(wh); perform public.online_offer_draw(gid); perform pg_temp.as_user(bl); g := public.online_offer_draw(gid);
  assert g->>'reason' = 'agreed' and g->'white_delta' <> 'null'::jsonb, 'ничья по согласию тоже пересчитывает рейтинг';
  perform pg_temp.as_root();
  raise notice 'ВСЕ ПРОВЕРКИ SQL ПРОЙДЕНЫ';
end $t$;
