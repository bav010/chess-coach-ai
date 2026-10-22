import time
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    pg=b.new_page(viewport={'width':1360,'height':1500})
    pg.goto(URL); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    (pg.evaluate("location.hash='#/tactics'"), pg.wait_for_timeout(600))
    for t in ['fork','pin','doubleAttack','discovered','deflection','mateCombo','defense']:
        pg.locator(f'[data-testid=theme-{t}]').click(); time.sleep(.2)
        print(t, pg.locator('[data-testid=available-count]:visible').inner_text())
    pg.locator('[data-testid=theme-fork]').click()
    time.sleep(2)
    pg.locator('[data-testid=hint-btn]').click(); pg.locator('[data-testid=hint-btn]').click()
    pg.screenshot(path='shot_puzzle.png')
    # 3-move check: time tick
    time.sleep(3); print(pg.locator('.tiny:visible').first.inner_text())
