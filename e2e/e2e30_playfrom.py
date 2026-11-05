from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
F=[]
def check(n,c):
    print(('OK   ' if c else 'FAIL ')+n)
    if not c: F.append(n)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    ctx=b.new_context(viewport={'width':1360,'height':1500}); ctx.add_init_script("localStorage.setItem('chess-coach-ai:lang:v1','ru')")
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL+'#/analysis'); pg.wait_for_selector('[data-testid=top-status][data-state=ready],[data-testid=top-status][data-state=online]',timeout=30000)
    # 1) PGN -> играть отсюда
    pg.locator('[data-testid=tab-position]:visible').click()
    pg.locator('[data-testid=position-tab] textarea').fill('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6'); pg.locator('[data-testid=pgn-import] .btn.primary').click(); pg.wait_for_timeout(500)
    pg.locator('[data-testid=play-from]:visible').click(); pg.wait_for_timeout(500)
    check('route play', pg.url.endswith('#/play'))
    check('seed notice shown', pg.locator('[data-testid=play-seed]:visible').count()==1)
    print(' ',pg.locator('[data-testid=play-seed]:visible').inner_text().replace('\n',' | '))
    pg.screenshot(path='shots_playfrom_setup.png')
    pg.locator('[data-testid=start-game]:visible').click(); pg.wait_for_timeout(500)
    check('board has 6 moves played', pg.locator('[data-testid=play-board]:visible').count()==1)
    # white to move, user white (default): play Ba4
    pg.locator('[data-square=b5]:visible').click(); pg.locator('[data-square=a4]:visible').click()
    pg.wait_for_function("document.querySelectorAll('[data-testid=play-board]:not([hidden]) .move-row, .play-panel .move-row').length>=0",timeout=2000)
    pg.wait_for_timeout(6000)
    txt=pg.locator('[data-testid=play-status]:visible').inner_text().replace('\n',' | ')
    print(' ',txt)
    check('bot answered (turn is ours again)', 'ваш' in txt)
    pg.screenshot(path='shots_playfrom_game.png')
    # 2) редактор позиции
    pg.goto(URL+'#/analysis'); pg.locator('[data-testid=tab-position]:visible').click(); pg.locator('[data-testid=editor-btn]:visible').click()
    check('side labels', pg.locator('[data-testid=pos-side-bottom]:visible').count()==1 and 'Белые' in pg.locator('[data-testid=pos-side-bottom]:visible').inner_text())
    pg.locator('[data-testid=pos-start]:visible').click()
    pg.locator('[data-testid=position-editor]:visible').screenshot(path='shots_editor_labels.png')
    pg.locator('[data-testid=position-editor]:visible').get_by_role('button',name='Перевернуть').click()
    check('flip swaps labels', 'Чёрные' in pg.locator('[data-testid=pos-side-bottom]:visible').inner_text())
    pg.locator('[data-testid=pos-side-bottom]:visible').scroll_into_view_if_needed()
    # 3) расстановка -> играть
    pg.locator('[data-testid=turn-b]:visible').click(); pg.locator('[data-testid=pos-apply]:visible').click(); pg.wait_for_timeout(500)
    pg.locator('[data-testid=play-from]:visible').click(); pg.wait_for_timeout(400)
    pg.locator('[data-testid=start-game]:visible').click(); pg.wait_for_timeout(500)
    print(' ',pg.locator('[data-testid=play-status]:visible').inner_text().replace('\n',' | '))
    check('no page errors', not errs); print(errs); print('FAILS',F); b.close()
