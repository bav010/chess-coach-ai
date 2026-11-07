import json, datetime
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
F=[]
def check(n,c):
    print(('OK   ' if c else 'FAIL ')+n)
    if not c: F.append(n)
today=datetime.date.today(); mon=today-datetime.timedelta(days=today.weekday())
k=lambda d:d.isoformat()
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    ctx=b.new_context(viewport={'width':1360,'height':1500}); errs=[]
    ctx.add_init_script("localStorage.setItem('chess-coach-ai:lang:v1','ru')")
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL+'#/home'); pg.wait_for_selector('[data-testid=home-goal]')
    check('home goal at zero', pg.locator('[data-testid=home-goal] [data-testid=goal-puzzles]').inner_text().replace('\n',' ').find('0 / 20')>=0)
    # реальное действие: показать решение в задачах => провал, счётчик +1
    pg.locator('[data-testid=home-daily-solve]').click(); pg.wait_for_selector('[data-testid=solution-btn]:visible:not([disabled])',timeout=20000); pg.locator('[data-testid=solution-btn]:visible').click(); pg.wait_for_timeout(500)
    pg.goto(URL+'#/home'); pg.wait_for_selector('[data-testid=home-goal]'); pg.wait_for_timeout(300)
    t=pg.locator('[data-testid=home-goal] [data-testid=goal-puzzles]').inner_text().replace('\n',' '); print(' ',t)
    check('puzzle attempt counted', '1 / 20' in t)
    check('active day counted', '1 / 4' in pg.locator('[data-testid=home-goal] [data-testid=goal-days]').inner_text().replace('\n',' '))
    # подставим данные на неделю и на прошлую
    act={"v":1,"days":[k(mon),k(mon+datetime.timedelta(days=1)),k(today),k(mon-datetime.timedelta(days=2))],"daily":{},
         "counts":{k(mon):{"puzzles":8,"solved":6,"openings":4},k(mon+datetime.timedelta(days=1)):{"puzzles":14,"solved":11,"mistakes":3},k(today):{"puzzles":1},k(mon-datetime.timedelta(days=2)):{"puzzles":10,"solved":5}}}
    keys=pg.evaluate("Object.keys(localStorage).filter(x=>x.includes('activity'))"); print(' keys',keys)
    pg.evaluate("([k,v])=>localStorage.setItem(k,v)",[keys[0],json.dumps(act)])
    pg.goto(URL+'#/stats'); pg.wait_for_selector('[data-testid=stab-week]:visible'); pg.locator('[data-testid=stab-week]:visible').click()
    pg.reload(); pg.wait_for_selector('[data-testid=stab-week]:visible'); pg.locator('[data-testid=stab-week]:visible').click(); pg.wait_for_selector('[data-testid=weekly]:visible')
    check('puzzles tried summed', '23' in pg.locator('[data-testid=wk-puzzles]:visible').inner_text() and '17' in pg.locator('[data-testid=wk-puzzles]:visible').inner_text())
    check('focus: puzzles at 23>=10 -> play (games 0)', pg.locator('[data-testid=week-focus]:visible').get_attribute('data-focus')=='play')
    pg.locator('[data-testid=goal-plus-puzzles]:visible').click(); pg.locator('[data-testid=goal-plus-games]:visible').click()
    check('goal edit', pg.locator('[data-testid=goal-val-puzzles]:visible').inner_text()=='25' and pg.locator('[data-testid=goal-val-games]:visible').inner_text()=='4')
    pg.screenshot(path='shots_weekly.png',full_page=True)
    pg.locator('[data-testid=week-prev]:visible').click()
    check('previous week shows 10 puzzles', '10' in pg.locator('[data-testid=wk-puzzles]:visible').inner_text())
    pg.reload(); pg.wait_for_selector('[data-testid=stab-week]:visible'); pg.locator('[data-testid=stab-week]:visible').click()
    check('goal persisted', pg.locator('[data-testid=goal-val-puzzles]:visible').inner_text()=='25')
    pg.goto(URL+'#/home'); pg.wait_for_selector('[data-testid=home-goal]'); pg.screenshot(path='shots_home_goal.png')
    check('no page errors', not errs); print(errs, 'FAILS', F); b.close()
