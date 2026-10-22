import time
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    pg=b.new_page(viewport={'width':1360,'height':1400})
    pg.add_init_script("localStorage.setItem('chess-coach-ai:lang:v1','ru')")  # LANGFIX
    errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    (pg.evaluate("location.hash='#/play'"), pg.wait_for_timeout(600))
    pg.locator('[data-testid=elo-input]').fill('1000')
    pg.locator('[data-testid=tc-custom]').click()
    pg.locator('[data-testid=custom-you]').fill('1'); pg.locator('[data-testid=custom-bot]').fill('1')
    pg.locator('[data-testid=custom-inc]').fill('2')
    pg.locator('[data-testid=start-game]').click()
    pg.wait_for_selector('[data-testid=play-board]')
    def mv(a,b_):
        pg.locator(f'[data-testid=play-board] [data-square="{a}"]').click(); pg.locator(f'[data-testid=play-board] [data-square="{b_}"]').click()
    def wait_user():
        pg.wait_for_function("()=>document.querySelector('[data-testid=play-status]').innerText.includes('Ход: ваш')",timeout=30000)
    mv('e2','e4'); wait_user()
    print('moves',pg.locator('[data-testid=play-board]').locator('xpath=..').locator('.move-btn').count())
    clocks=pg.locator('.clock:visible').all_inner_texts(); print('clocks',clocks)
    mv('d2','d4'); wait_user()
    print('before undo plies',pg.locator('.move-count:visible').inner_text())
    pg.locator('[data-testid=undo]').click()
    print('after undo plies',pg.locator('.move-count:visible').inner_text(),'clocks',pg.locator('.clock:visible').all_inner_texts())
    print('balance',pg.locator('[data-testid=material-balance]').inner_text())
    pg.screenshot(path='../shot_play.png',full_page=True)
    # resign
    pg.locator('[data-testid=resign]').click(); pg.locator('[data-testid=resign]').click()
    print('result:',pg.locator('[data-testid=game-result]').inner_text())
    print('review btn',pg.locator('[data-testid=review-btn]').count())
    pg.locator('[data-testid=review-btn]').click()
    pg.wait_for_selector('[data-testid=review-report],[data-testid=review-progress]',timeout=120000)
    print('switched to analysis with review, moves',pg.locator('.move-btn:visible').count())
    (pg.evaluate("location.hash='#/play'"), pg.wait_for_timeout(600))
    # new game as black, no clock
    pg.locator('[data-testid=new-game]:visible').click()
    pg.locator('[data-testid=color-b]').click(); pg.locator('[data-testid=tc-none]').click()
    pg.locator('[data-testid=start-game]').click()
    pg.wait_for_function("()=>document.querySelectorAll('[data-testid=play-board] .move-btn, .move-btn').length>=1",timeout=30000)
    print('black: orientation',pg.locator('[data-testid=play-board] .board').get_attribute('data-orientation'),'undo disabled',pg.locator('[data-testid=undo]').is_disabled())
    # flag fall: 1 min w/o inc quick custom 0.1 min
    pg.locator('[data-testid=new-game]:visible').click()
    pg.locator('[data-testid=color-w]').click(); pg.locator('[data-testid=tc-custom]').click()
    pg.locator('[data-testid=custom-you]').fill('0.1'); pg.locator('[data-testid=custom-bot]').fill('5'); pg.locator('[data-testid=custom-inc]').fill('0')
    pg.locator('[data-testid=start-game]').click()
    pg.wait_for_selector('[data-testid=game-result]',timeout=15000)
    print('flag:',pg.locator('[data-testid=game-result]').inner_text())
    print('errors',errs); b.close()
