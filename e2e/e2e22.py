import json,datetime
from playwright.sync_api import sync_playwright
P={p['id']:p for p in json.load(open('../out3/chess-coach-ai/src/data/puzzles.json'))}
B='http://127.0.0.1:4173/chess-coach-ai/'
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':1000}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'#/'); pg.wait_for_timeout(800)
    print('streak before:', pg.locator('[data-testid=home-stats]').inner_text().replace('\n',' | ') if pg.locator('[data-testid=home-stats]').count() else 'no stats')
    href=pg.locator('[data-testid=home-daily-solve]').get_attribute('href'); pid=href.split('/')[-1]; line=P[pid]['line']; print(pid,line)
    assert pg.locator('[data-testid=home-daily-solved]').count()==0
    pg.locator('[data-testid=home-daily-solve]').click(); pg.wait_for_timeout(1000)
    for i in range(0,len(line),2):
        u=line[i]; pg.locator(f'[data-square={u[:2]}]:visible').click(); pg.locator(f'[data-square={u[2:4]}]:visible').click(); pg.wait_for_timeout(1500)
    pg.goto(B+'#/'); pg.wait_for_timeout(800)
    print('solved shown:', pg.locator('[data-testid=home-daily-solved]').count())
    print('stats:', pg.locator('[data-testid=home-stats]').inner_text().replace('\n',' | '))
    pg.screenshot(path='daily_solved.png')
    # reload keeps it
    pg.reload(); pg.wait_for_timeout(800); print('after reload:', pg.locator('[data-testid=home-daily-solved]').count())
    print('errors',errs); b.close()
