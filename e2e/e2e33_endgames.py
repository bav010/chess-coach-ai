import json
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
F=[]
def check(n,c):
    print(('OK   ' if c else 'FAIL ')+n)
    if not c: F.append(n)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium'); ctx=b.new_context(viewport={'width':1360,'height':1300}); errs=[]
    ctx.add_init_script("if(!localStorage.getItem('chess-coach-ai:lang:v1')) localStorage.setItem('chess-coach-ai:lang:v1','ru')")
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL+'#/endgames'); pg.wait_for_selector('[data-testid=eg-overview]',timeout=20000)
    check('overview lists topics', pg.locator('[data-testid^=eg-topic-]').count()>=12)
    pg.screenshot(path='shots_endgames_overview.png',full_page=True)
    # меню и главная ведут сюда
    pg.goto(URL+'#/'); pg.wait_for_timeout(500)
    check('home has card', pg.locator('a[href$="#/endgames"]').count()>=1)
    pg.goto(URL+'#/endgames'); pg.wait_for_selector('[data-testid=eg-topic-kqk]')
    pg.locator('[data-testid=eg-topic-kqk]').click(); pg.wait_for_selector('[data-testid=eg-trainer]')
    check('trainer open', pg.locator('[data-testid=eg-trainer]').get_attribute('data-topic')=='kqk')
    check('goal shown (mate)', 'мат' in pg.locator('[data-testid=eg-goal]').inner_text().lower())
    pg.wait_for_timeout(800)
    pg.screenshot(path='shots_endgames_trainer.png')
    # решаем «ферзь против короля» подсказками движка до мата
    n=0
    while n<40 and pg.locator('[data-testid=eg-trainer]').get_attribute('data-verdict')=='playing':
        n+=1
        btn=pg.locator('[data-testid=eg-hint-btn]')
        try: btn.wait_for(state='visible'); pg.wait_for_function("()=>{const b=document.querySelector('[data-testid=eg-hint-btn]');return b&&!b.disabled}",timeout=15000)
        except Exception: continue
        btn.click(); pg.wait_for_selector('[data-testid=eg-hint]',timeout=15000)
        u=pg.locator('[data-testid=eg-hint]').get_attribute('data-uci')
        B='[data-testid=eg-trainer] '; pg.locator(B+f'[data-square={u[:2]}]').click(); pg.locator(B+f'[data-square={u[2:4]}]').click()
        if len(u)==5: pg.locator('[data-testid=promo-q], [aria-label*="Queen"], [aria-label*="Ферзь"]').first.click()
        pg.wait_for_timeout(300)
        pg.wait_for_function("()=>{const t=document.querySelector('[data-testid=eg-trainer]');return t.dataset.verdict!=='playing' || document.querySelector('[data-testid=eg-hint-btn]:not([disabled])')}",timeout=20000)
    v=pg.locator('[data-testid=eg-trainer]').get_attribute('data-verdict'); print(' moves',n,'verdict',v)
    check('solved with checkmate', v=='solved')
    check('status says solved', 'решена' in pg.locator('[data-testid=eg-status]').inner_text())
    pg.screenshot(path='shots_endgames_solved.png')
    check('next button', pg.locator('[data-testid=eg-next]').count()==1)
    pg.locator('[data-testid=eg-next]').click(); pg.wait_for_selector('[data-testid=eg-trainer]')
    check('next position opened', pg.locator('[data-testid=eg-trainer]').get_attribute('data-id')!='kqk1')
    check('chip marks solved', pg.locator('[data-testid=eg-chip-kqk1]').get_attribute('data-solved')=='true')
    prog=json.loads(pg.evaluate("localStorage.getItem('chess-coach-ai:endgames:v1')")); check('progress saved', 'kqk1' in prog['solved'])
    # партия на ничью: ученик чёрными, бот ходит первым или ученик
    pg.goto(URL+'#/endgames/philidor1'); pg.wait_for_selector('[data-testid=eg-trainer]'); pg.wait_for_timeout(500)
    check('draw goal text', 'ничью' in pg.locator('[data-testid=eg-goal]').inner_text().lower())
    check('black at bottom', pg.locator('[data-testid=eg-trainer] .square').first.get_attribute('data-square')=='h1')
    pg.locator('[data-testid=eg-trainer] [data-square=b6]').click(); pg.locator('[data-testid=eg-trainer] [data-square=b1]').click(); pg.wait_for_timeout(3500)
    check('bot answered', pg.locator('[data-testid=eg-trainer]').get_attribute('data-verdict')=='playing' and 'Ваш ход' in pg.locator('[data-testid=eg-status]').inner_text())
    pg.locator('[data-testid=eg-restart]').click(); pg.wait_for_timeout(500)
    check('restart resets', 'Ваш ход' in pg.locator('[data-testid=eg-status]').inner_text())
    pg.set_viewport_size({'width':390,'height':900}); pg.goto(URL+'#/endgames'); pg.wait_for_selector('[data-testid=eg-overview]')
    check('no horizontal scroll on phone', pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"))
    check('no page errors', not errs); print(errs,'FAILS',F); b.close()
