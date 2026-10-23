from playwright.sync_api import sync_playwright
import json,datetime
B='http://127.0.0.1:4173/chess-coach-ai/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium'); pg=b.new_page(viewport={'width':1280,'height':900}); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B); pg.wait_for_timeout(800)
    print('fresh:', [r.get_attribute('data-testid') for r in pg.locator('[data-testid=home-plan] li').all()])
    pid=pg.locator('[data-testid=home-daily-solve]').get_attribute('href').split('/')[-1]
    d=datetime.date.today(); day=d.isoformat()
    pg.evaluate("([k,v])=>localStorage.setItem(k,v)",['chess-coach-ai:activity:v1',json.dumps({'v':1,'days':[day],'daily':{day:{'id':pid,'ok':True}}})])
    pg.reload(); pg.wait_for_timeout(800)
    r=pg.locator('[data-testid=plan-daily]'); print('solved:', r.get_attribute('data-done'), r.inner_text().replace('\n',' | '), 'go btn', pg.locator('[data-testid=plan-go-daily]').count())
    pg.locator('[data-testid=plan-go-play]').click(); pg.wait_for_timeout(500); print('hash', pg.evaluate('location.hash'), errs)
