import time
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    pg=b.new_page(viewport={'width':1360,'height':1500})
    pg.add_init_script("localStorage.setItem('chess-coach-ai:lang:v1','ru')")  # LANGFIX
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    # --- bot delay
    (pg.evaluate("location.hash='#/play'"), pg.wait_for_timeout(600))
    pg.locator('[data-testid=elo-input]').fill('1400'); pg.locator('[data-testid=tc-none]').click()
    pg.locator('[data-testid=start-game]').click(); pg.wait_for_selector('[data-testid=play-board]')
    def mv(a,b_):
        pg.locator(f'[data-testid=play-board] [data-square="{a}"]').click(); pg.locator(f'[data-testid=play-board] [data-square="{b_}"]').click()
    def wait_user():
        pg.wait_for_function("()=>document.querySelector('[data-testid=play-status]').innerText.includes('Ход: ваш')",timeout=40000)
    times=[]
    for a,b_ in [('e2','e4'),('d2','d4'),('g1','f3'),('b1','c3')]:
        t=time.time(); mv(a,b_); wait_user(); times.append(round(time.time()-t,2))
    print('bot reply seconds',times)
    pg.locator('[data-testid=resign]').click(); pg.locator('[data-testid=resign]').click()
    pg.wait_for_selector('[data-testid=game-result]')
    # --- open saved session in one click
    pg.locator('[data-testid=open-session]:visible').first.click()
    pg.wait_for_selector('[data-testid=review-report],[data-testid=review-progress]',timeout=120000)
    pg.wait_for_selector('[data-testid=review-report]',timeout=120000)
    print('opened session moves',pg.locator('.move-btn:visible').count(),'orientation',pg.locator('[data-orientation]:visible').first.get_attribute('data-orientation'))
    pg.locator('.move-btn[data-ply="3"]:visible').click()
    print('board mark with toggle on', pg.locator('.sq-mark').count())
    pg.locator('[data-testid=tab-review]').click()
    pg.locator('[data-testid=toggle-marks]').uncheck()
    print('toggle off: board marks',pg.locator('.sq-mark').count(),'list icons',pg.locator('.move-btn:visible .mark').count())
    pg.locator('[data-testid=toggle-marks]').check()
    print('toggle on: list icons',pg.locator('.move-btn:visible .mark').count())
    pg.locator('[data-testid=tab-review]').click()
    # analysis tab verdict card
    pg.locator('aside .tab').first.click()
    pg.wait_for_selector('[data-testid=verdict]',timeout=30000)
    pg.screenshot(path='../shot_final.png',full_page=True)
    print('errors',errs); b.close()
