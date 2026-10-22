import json, time
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    pg=b.new_page(viewport={'width':1360,'height':1600})
    pg.add_init_script("localStorage.setItem('chess-coach-ai:lang:v1','ru')")  # LANGFIX
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    (pg.evaluate("location.hash='#/openings'"), pg.wait_for_timeout(600))
    print('lessons', pg.locator('[data-testid^=lesson-]:visible').count())
    pg.locator('[data-testid=lesson-italian]').click()
    L='[data-testid=lesson-board]'
    def sq(a): pg.locator(f'{L} [data-square="{a}"]').click()
    def wait_turn(): pg.wait_for_function("()=>document.querySelector('[data-testid=lesson-progress]').innerText.includes('Ваш ход')||document.querySelector('[data-testid=lesson-progress]').innerText.includes('пройден')",timeout=10000)
    wait_turn(); print(pg.locator('[data-testid=lesson-progress]').inner_text(), '| arrows', pg.locator(f'{L} .board-arrows g').count())
    sq('a2'); sq('a3'); time.sleep(.3); print('wrong:', pg.locator('[data-testid=lesson-message]').inner_text())
    moves=['e2e4','g1f3','f1c4','c2c3','d2d3','e1g1']
    for m in moves:
        wait_turn()
        if pg.locator('[data-testid=lesson-progress]').inner_text().find('пройден')>=0: break
        sq(m[:2]); sq(m[2:4]); time.sleep(.2)
    print('after first move msg', pg.locator('[data-testid=lesson-log] li').first.inner_text().replace('\n',' '))
    wait_turn(); time.sleep(1)
    print(pg.locator('[data-testid=lesson-progress]').inner_text(), 'log', pg.locator('[data-testid=lesson-log] li').count())
    print('msg', pg.locator('[data-testid=lesson-message]').inner_text()[:160])
    pg.screenshot(path='shot_lesson.png')
    print(pg.locator('[data-testid=lesson-info]').inner_text())
    pg.locator('[data-testid=lesson-close]').click(); time.sleep(.5); pg.screenshot(path='dbg.png'); print('progress', errs)
    # каталог со стрелками
    pg.locator('[data-testid=sub-study]').click()
    pg.locator('[data-testid=catalog-search]').fill('Italian Game: Giuoco Piano')
    pg.locator('[data-testid=opening-list] .opening-item').first.click()
    print('title', pg.locator('[data-testid=line-title]').inner_text(), '| arrows', pg.locator('[data-testid=study-board] .board-arrows g').count())
    pg.locator('[data-testid=study-next]').click(); print('arrows after next', pg.locator('[data-testid=study-board] .board-arrows g').count())
    pg.locator('[data-testid=study-reset]').click()
    pg.locator('[data-testid=catalog-search]').fill('Sicilian Defense: Najdorf Variation')
    pg.locator('[data-testid=opening-list] .opening-item').first.click()
    pg.screenshot(path='shot_catalog.png')
    print('errors',errs)
