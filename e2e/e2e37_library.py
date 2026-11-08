# Библиотека партий: импорт PGN (вставка и файл), ники, фильтры, «Мои дебюты», открытие в анализе, сохранение, RU, мобильный вид
import json, os, tempfile
from playwright.sync_api import sync_playwright
B='http://127.0.0.1:4173/chess-coach-ai/'
IT='1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 d6 5. O-O Be7'
IT2='1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4'
SI='1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6'
def g(w,b,res,mv,date,extra=''):
    return f'[Event "Rated Blitz"]\n[Site "https://lichess.org/x"]\n[Date "{date}"]\n[White "{w}"]\n[Black "{b}"]\n[Result "{res}"]\n[WhiteElo "1500"]\n[BlackElo "1450"]\n[TimeControl "300+3"]\n\n{mv}{extra} {{ [%clk 0:04:58] }} {res}'
games=[g('Alice','Zed','1-0',IT,'2026.10.01',' 6. Re1'), g('Alice','Zed','0-1',IT,'2026.10.02',' 6. c3'), g('zed','alice','0-1',SI,'2026.10.03'),
       g('Alice','Kim','0-1',IT2,'2026.10.04',' 6. cxd4'), g('Alice','Kim','0-1',IT2,'2026.10.05',' 6. e5')]
text='\n\n'.join(games)
errs=[]; ok=True
def chk(label,cond,info=''):
    global ok
    print(('OK  ' if cond else 'FAIL'),label,info)
    ok = ok and bool(cond)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    ctx=b.new_context(viewport={'width':1280,'height':1100}); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'#/openings/mine'); pg.wait_for_timeout(1800)
    L='[data-testid=library] '
    chk('1 пустая библиотека', pg.locator(L+'[data-testid=lib-empty]').is_visible())
    # импорт без ника: партии сохранены, но сторона неизвестна
    pg.fill(L+'[data-testid=lib-paste]', text); pg.click(L+'[data-testid=lib-import]'); pg.wait_for_timeout(500)
    rep=pg.locator(L+'[data-testid=lib-report]').inner_text()
    chk('2 отчёт импорта', '5' in rep and '0' in rep, rep)
    chk('3 счётчик партий', pg.locator(L+'[data-testid=lib-count]').inner_text().startswith('5'))
    chk('4 без ника сторона неизвестна', pg.locator(L+'[data-testid=lib-unknown]').inner_text().startswith('5'), pg.locator(L+'[data-testid=lib-unknown]').inner_text())
    print('   Мои дебюты без ника:', pg.locator('[data-testid=op-mine]').inner_text().replace('\n',' | ')[:120])
    # повторный импорт не дублирует
    pg.fill(L+'[data-testid=lib-paste]', games[0]); pg.click(L+'[data-testid=lib-import]'); pg.wait_for_timeout(300)
    chk('5 дубликат пропущен', pg.locator(L+'[data-testid=lib-count]').inner_text().startswith('5') and 'already' in pg.locator(L+'[data-testid=lib-report]').inner_text().lower(), pg.locator(L+'[data-testid=lib-report]').inner_text())
    # пустой ввод
    pg.fill(L+'[data-testid=lib-paste]', ''); pg.click(L+'[data-testid=lib-import]'); pg.wait_for_timeout(200)
    chk('6 пустой ввод — сообщение', pg.locator(L+'[data-testid=lib-msg]').is_visible())
    # ник
    pg.fill(L+'[data-testid=lib-nicks]','alice'); pg.click(L+'[data-testid=lib-nicks-save]'); pg.wait_for_timeout(500)
    sm=pg.locator(L+'[data-testid=lib-summary]').inner_text().replace('\n',' | ')
    chk('7 сводка после ника', '40%' in sm or '2 wins' in sm, sm)
    chk('8 неизвестных нет', pg.locator(L+'[data-testid=lib-unknown]').count()==0)
    cnt=pg.locator('[data-testid=op-mine-count]').inner_text()
    chk('9 «Мои дебюты» учли партии', cnt.startswith('5'), cnt)
    cards=pg.locator('[data-testid=op-mine-card]:visible').count()
    chk('10 карточки дебютов', cards>=2, str(cards))
    # фильтры
    pg.click(L+'[data-testid=lib-color-b]'); chk('11 фильтр «чёрные»', pg.locator(L+'[data-testid=lib-row]').count()==1)
    pg.click(L+'[data-testid=lib-color-all]'); pg.click(L+'[data-testid=lib-out-loss]'); chk('12 фильтр «поражения»', pg.locator(L+'[data-testid=lib-row]').count()==3, str(pg.locator(L+'[data-testid=lib-row]').count()))
    pg.click(L+'[data-testid=lib-out-all]'); pg.fill(L+'[data-testid=lib-search]','kim'); chk('13 поиск по игроку', pg.locator(L+'[data-testid=lib-row]').count()==2)
    pg.fill(L+'[data-testid=lib-search]','nobody'); chk('14 ничего не найдено', pg.locator(L+'[data-testid=lib-none]').is_visible())
    pg.fill(L+'[data-testid=lib-search]','')
    pg.screenshot(path='e2e/shot_library_en.png', full_page=True)
    # удаление
    pg.locator(L+'[data-testid=lib-del]').first.click(); pg.wait_for_timeout(300)
    chk('15 удаление партии', pg.locator(L+'[data-testid=lib-count]').inner_text().startswith('4'))
    # сохранение после перезагрузки
    pg.reload(); pg.wait_for_timeout(1500)
    chk('16 данные сохранились', pg.locator(L+'[data-testid=lib-count]').inner_text().startswith('4') and pg.input_value(L+'[data-testid=lib-nicks]')=='alice')
    # импорт файла .pgn
    fd=tempfile.mkdtemp(); fp=os.path.join(fd,'my.pgn'); open(fp,'w').write(g('Alice','Newbie','1-0','1. d4 d5 2. c4 e6','2026.10.06'))
    pg.set_input_files(L+'[data-testid=lib-file]', fp); pg.wait_for_timeout(600)
    chk('17 импорт файла', pg.locator(L+'[data-testid=lib-count]').inner_text().startswith('5'), pg.locator(L+'[data-testid=lib-report]').inner_text())
    # открыть в анализе
    pg.locator(L+'[data-testid=lib-open]').first.click(); pg.wait_for_timeout(1200)
    chk('18 открывается анализ', pg.evaluate('location.hash')=='#/analysis', pg.evaluate('location.hash'))
    # резервная копия содержит библиотеку
    bk=pg.evaluate("localStorage.getItem('chess-coach-ai:library:v1')")
    chk('19 данные в localStorage', bk and len(json.loads(bk)['games'])==5)
    # RU
    pg.evaluate("localStorage.setItem('chess-coach-ai:lang:v1','ru')"); pg.goto(B+'#/openings/mine'); pg.reload(); pg.wait_for_timeout(1800)
    t=pg.locator(L).inner_text()
    chk('20 RU без сырых ключей', 'library.' not in t and 'Импортированные' in t, t[:80].replace('\n',' '))
    pg.screenshot(path='e2e/shot_library_ru.png', full_page=True)
    ctx.close()
    ctx=b.new_context(viewport={'width':390,'height':844}); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    ctx.add_init_script("localStorage.setItem('chess-coach-ai:library:v1',%s)"%json.dumps(bk))
    pg.goto(B+'#/openings/mine'); pg.wait_for_timeout(1800)
    ow=pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    chk('21 мобильный: нет горизонтальной прокрутки', ow<=1, str(ow))
    pg.screenshot(path='e2e/shot_library_mobile.png', full_page=True)
    b.close()
print('errors', errs); chk('нет ошибок страницы', not errs)
print('ИТОГ', 'ВСЁ OK' if ok else 'ЕСТЬ ОШИБКИ')
