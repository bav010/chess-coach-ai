import json, time
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
DB={p['id']:p for p in json.load(open('/tmp/claude-0/-home-claude/760528a8-3f06-50ab-9015-c4d3390fc528/scratchpad/out3/chess-coach-ai/src/data/puzzles.json'))}
def txt(pg,tid): return pg.locator(f'[data-testid={tid}]:visible').first.inner_text()
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    ctx=b.new_context(viewport={'width':1360,'height':1700})
    pg=ctx.new_page(); ctx.add_init_script("localStorage.setItem('chess-coach-ai:lang:v1','ru')")  # LANGFIX
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    (pg.evaluate("location.hash='#/tactics'"), pg.wait_for_timeout(600))
    B='[data-testid=puzzle-board]'
    def cur(): 
        pid=pg.locator(B).get_attribute('data-puzzle-id'); return DB[pid]
    def click_sq(s): pg.locator(f'{B} [data-square="{s}"]').click()
    def solver_moves(pz): return pz['line'][0::2]
    def play(uci):
        click_sq(uci[:2]); click_sq(uci[2:4])
        if len(uci)>4: pg.locator('.promo-picker .btn',has_text={'q':'Ферзь','r':'Ладья','b':'Слон','n':'Конь'}[uci[4]]).click()
    def wait_msg(sub,timeout=20000):
        pg.wait_for_function("s=>document.querySelector('[data-testid=puzzle-message]').innerText.includes(s)",arg=sub,timeout=timeout)
    def solve_script(pz):
        n=len(pz['line'])
        for i in range(0,n,2):
            play(pz['line'][i])
            if i+1<n: pg.wait_for_function("n=>document.querySelectorAll('[data-testid=puzzle-board] .move-dot, [data-testid=puzzle-board] .can-move').length>=0",arg=0)
            # ждём ответ соперника / конец
            time.sleep(1.0)
    # ---------- 1. мат в 1: ошибка не засчитывается, подсказки, retry, решение
    pg.locator('[data-testid=mate-m1]').click(); pg.wait_for_selector(f'{B}[data-puzzle-id]:not([data-puzzle-id=""])')
    pz=cur(); print('puzzle',pz['id'],pz['kind'],pz['mate'],'task:',txt(pg,'puzzle-task'))
    assert 'Мат в 1' in txt(pg,'puzzle-task')
    sol=pz['line'][0]
    # найти неверный легальный ход
    wrong=None
    sidecol='белая' if pz['fen'].split()[1]=='w' else 'чёрная'
    for sq in [x.get_attribute('data-square') for x in pg.locator(f'{B} [data-square]').all() if sidecol in (x.get_attribute('aria-label') or '')]:
        click_sq(sq)
        for t in [x.get_attribute('data-square') for x in pg.locator(f'{B} .can-move').all()]:
            if sq+t!=sol and not (sq+t==sol[:4]): wrong=(sq,t); break
        if wrong: break
        click_sq(sq)
    print('wrong move',wrong)
    click_sq(wrong[1]); wait_msg('✗')
    print('msg after wrong:',txt(pg,'puzzle-message'))
    assert txt(pg,'stat-solved')=='0'
    # подсказки по уровням
    texts=[]
    for i in range(3):
        pg.locator('[data-testid=hint-btn]').click(); pg.wait_for_selector('[data-testid=hint-text]'); texts.append(txt(pg,'hint-text').replace('\n',' '))
    print('hints',texts)
    assert pz['line'][0][:2] in texts[1] and pz['line'][0][2:4] not in texts[1] and pz['line'][0][2:4] in texts[2]
    assert pg.locator('[data-testid=hint-btn]').is_disabled()
    pg.locator('[data-testid=retry-btn]').click(); assert pg.locator('[data-testid=hint-text]').count()==0
    play(sol); pg.wait_for_selector('[data-testid=puzzle-explain]',timeout=10000)
    print('explain:',txt(pg,'puzzle-explain').replace('\n',' | '))
    print('after fail+solve: solved',txt(pg,'stat-solved'),'percent',txt(pg,'stat-percent'))
    assert txt(pg,'stat-solved')=='0'   # провал уже записан
    # ---------- 2. следующая: чистое решение
    pg.locator('[data-testid=next-btn]').click(); time.sleep(0.3)
    pz=cur(); print('next',pz['id'],pz['mate'])
    play(pz['line'][0]); pg.wait_for_selector('[data-testid=puzzle-explain]',timeout=10000)
    print('solved',txt(pg,'stat-solved'),'percent',txt(pg,'stat-percent'),'clean',txt(pg,'stat-clean'))
    assert txt(pg,'stat-solved')=='1' and txt(pg,'stat-percent')=='50%'
    # ---------- 3. перезапуск: статистика сохраняется
    pg.reload(); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000); (pg.evaluate("location.hash='#/tactics'"), pg.wait_for_timeout(600))
    print('after reload: solved',txt(pg,'stat-solved'),'percent',txt(pg,'stat-percent'),'time',txt(pg,'stat-time'))
    assert txt(pg,'stat-solved')=='1'
    # ---------- 4. мат в 2: полное решение
    pg.locator('[data-testid=mate-m2]').click(); time.sleep(0.4)
    pz=cur(); print('m2',pz['id'],pz['line'])
    for i in range(0,len(pz['line']),2):
        play(pz['line'][i]); 
        if i+2<len(pz['line']): wait_msg('Продолжайте',timeout=15000)
    pg.wait_for_selector('[data-testid=puzzle-explain]',timeout=15000)
    print('m2 solved; solved',txt(pg,'stat-solved'))
    assert txt(pg,'stat-solved')=='2'
    # ---------- 5. показать решение
    pg.locator('[data-testid=next-btn]').click(); time.sleep(0.3)
    before=txt(pg,'stat-percent')
    pg.locator('[data-testid=solution-btn]').click(); pg.wait_for_selector('[data-testid=puzzle-explain]'); time.sleep(0.5)
    print('after show solution percent',before,'->',txt(pg,'stat-percent'),'solved',txt(pg,'stat-solved'))
    assert txt(pg,'stat-solved')=='2'
    # ---------- 6. темы
    for t in ['fork','pin','doubleAttack','discovered','deflection','mateCombo','defense']:
        pg.locator(f'[data-testid=theme-{t}]').click(); time.sleep(0.2)
        print(t,'count',txt(pg,'available-count'),'puzzle',pg.locator(B).get_attribute('data-puzzle-id'))
    pg.locator('[data-testid=theme-any]').click()
    print('weak box',pg.locator('[data-testid=weak-themes]').count(),'table',pg.locator('[data-testid=theme-table]').count())
    pg.screenshot(path='../shot_puzzles.png',full_page=True)
    # ---------- 7. остальные режимы работают
    (pg.evaluate("location.hash='#/play'"), pg.wait_for_timeout(600)); pg.wait_for_selector('[data-testid=start-game]')
    (pg.evaluate("location.hash='#/analysis'"), pg.wait_for_timeout(600)); pg.wait_for_selector('[data-testid=flip]:visible')
    print('errors',errs); b.close()
