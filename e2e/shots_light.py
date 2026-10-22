from playwright.sync_api import sync_playwright
from seed import JS
errs=[]; B='http://127.0.0.1:4173/chess-coach-ai/'
PAGES=[('home','#/'),('analysis','#/analysis'),('play','#/play'),('tactics','#/tactics'),('openings','#/openings'),('stats','#/stats'),('profile','#/profile'),('account','#/account'),('settings','#/settings'),('help','#/help')]
with sync_playwright() as p:
    b=p.chromium.launch()
    for name,vp in (('d',{'width':1280,'height':900}),('m',{'width':390,'height':844})):
        ctx=b.new_context(viewport=vp); ctx.add_init_script(JS); ctx.add_init_script("localStorage.setItem('chess-coach-ai:appearance:v1',JSON.stringify({theme:'light'}))")
        pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
        for n,h in PAGES:
            pg.goto(B+h); pg.wait_for_timeout(1200); pg.screenshot(path=f'lt_{n}_{name}.png',full_page=True)
        pg.goto(B+'#/analysis'); pg.wait_for_timeout(500)
        for t in ('review','position','saved'):
            pg.click(f'[data-testid=tab-{t}]'); pg.wait_for_timeout(300); pg.screenshot(path=f'lt_an_{t}_{name}.png',full_page=True)
        pg.goto(B+'#/stats'); pg.wait_for_timeout(800)
        for t in ('overview','mistakes','learning','advice'):
            pg.click(f'[data-testid=stab-{t}]'); pg.wait_for_timeout(400); pg.screenshot(path=f'lt_st_{t}_{name}.png',full_page=True)
        ctx.close()
    b.close()
print(errs)
