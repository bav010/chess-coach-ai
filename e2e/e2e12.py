import json, time
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    ctx=b.new_context(viewport={'width':1360,'height':1700}); pg=ctx.new_page(); ctx.add_init_script("localStorage.setItem('chess-coach-ai:lang:v1','ru')")  # LANGFIX
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    pg.evaluate("localStorage.setItem('chess-coach-ai:openings:v1', JSON.stringify({v:1,lessons:{},repertoires:[{id:'mine',name:'Мой пустой',side:'w',lines:[]}],cards:{},activeId:'mine',stats:{answered:0,correct:0,timeMs:0,sessions:0}}))")
    pg.reload(); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    (pg.evaluate("location.hash='#/openings'"), pg.wait_for_timeout(600))
    print('attack', pg.locator('[data-testid=group-attack] .lesson-card').count(), 'defense', pg.locator('[data-testid=group-defense] .lesson-card').count())
    pg.locator('[data-testid=style-defense]').click(); print('defense only', pg.locator('.lesson-card').count(), 'attack group', pg.locator('[data-testid=group-attack]').count())
    pg.locator('[data-testid=side-filter-w]').click(); print('defense+white', pg.locator('.lesson-card').count())
    pg.locator('[data-testid=side-filter-b]').click()
    # урок защиты: детский мат
    pg.locator('[data-testid=lesson-def-scholar]').click()
    L='[data-testid=lesson-board]'
    def sq(a): pg.locator(f'{L} [data-square="{a}"]').click()
    def wait_turn(): pg.wait_for_function("()=>{const t=document.querySelector('[data-testid=lesson-progress]').innerText;return t.includes('Ваш ход')||t.includes('пройден')}",timeout=10000)
    for m in ['e7e5','b8c6','g7g6','g8f6','c6d4']:
        wait_turn(); sq(m[:2]); sq(m[2:4]); time.sleep(.2)
    wait_turn(); print(pg.locator('[data-testid=lesson-progress]').inner_text())
    pg.locator('[data-testid=lesson-close]').click()
    print('repeat btn', pg.locator('[data-testid=repeat-def-scholar]').count())
    pg.locator('[data-testid=repeat-def-scholar]').click()
    print('hint toggle checked', pg.locator('[data-testid=lesson-hint-toggle]').is_checked())
    pg.locator('[data-testid=lesson-close]').click()
    # прогнать урок в репертуар и выучить: симулируем интервалы
    pg.locator('[data-testid=lesson-def-scholar]').click()
    for m in ['e7e5','b8c6','g7g6','g8f6','c6d4']:
        wait_turn(); sq(m[:2]); sq(m[2:4]); time.sleep(.2)
    wait_turn(); time.sleep(.5); print(pg.locator('[data-testid=lesson-info]').inner_text())
    pg.locator('[data-testid=sub-train]').click()
    print('learned chip', pg.locator('[data-testid=mode-learned]').inner_text())
    pg.locator('[data-testid=mode-learned]').click()
    print('begin visible', pg.locator('[data-testid=trainer-begin]').count(), 'empty', pg.locator('[data-testid=trainer-empty]').count())
    print('errs', errs)
    print('selector', pg.locator('[data-testid=trainer-rep-select]').count(), pg.locator('[data-testid=trainer-rep-select]').input_value())
    b.close()
