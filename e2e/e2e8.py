import time
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    pg=b.new_page(viewport={'width':1360,'height':1900})
    pg.add_init_script("localStorage.setItem('chess-coach-ai:lang:v1','ru')")  # LANGFIX
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    pg.evaluate("location.hash='#/analysis'"); pg.wait_for_timeout(600)
    pg.locator('[data-testid=editor-btn]:visible').click()
    E='[data-testid=editor-board]'
    pg.locator('[data-testid=pos-clear]').click()
    def put(tool,sq): pg.locator(f'[data-testid={tool}]').click(); pg.locator(f'{E} [data-square="{sq}"]').click()
    # мат в 1: Ke6? белые Kg6 Qa7?  Чёрный Kh8; белые Kf7? -> Qg7#
    put('tool-wk','f6'); put('tool-wq','a7'); put('tool-bk','h8')
    print('err before:', pg.locator('[data-testid=pos-error]').count())
    # невозможный шах: чёрные ходят-> ходят белые, король чёрных не под шахом -> ок; теперь ладья даёт шах чёрному, ходят белые
    put('tool-wr','h1')
    print('illegal err:', pg.locator('[data-testid=pos-error]').inner_text() if pg.locator('[data-testid=pos-error]').count() else None, 'apply disabled', pg.locator('[data-testid=pos-apply]').is_disabled())
    pg.locator(f'{E} [data-square="h1"]').click()  # убрать (повторный клик по ладье)
    pg.locator('[data-testid=tool-wr]').click(); pg.locator(f'{E} [data-square="h1"]').click(); pg.locator(f'{E} [data-square="h1"]').click()
    print('fen', pg.locator('[data-testid=pos-fen]').inner_text())
    pg.locator('[data-testid=pos-apply]').click()
    pg.wait_for_function("()=>document.body.innerText.includes('M1')||document.body.innerText.includes('Мат')",timeout=30000)
    time.sleep(2)
    print('editor hidden', pg.locator('[data-testid=position-editor]').count())
    print(pg.locator('aside:visible').first.inner_text()[:400])
    # ход по позиции: Qg7#
    pg.locator('[data-testid=puzzle-board]').count()
    pg.screenshot(path='shot_editor.png')
    print('errors',errs)
