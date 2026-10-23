from playwright.sync_api import sync_playwright
from seed import JS
B='http://127.0.0.1:4173/chess-coach-ai/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    for lang in ('en','ru'):
      for th in ('dark','light'):
        for name,vp in (('d',{'width':1280,'height':900}),('m',{'width':390,'height':844})):
            ctx=b.new_context(viewport=vp); ctx.add_init_script(JS)
            ctx.add_init_script(f"localStorage.setItem('chess-coach-ai:lang:v1','{lang}');localStorage.setItem('chess-coach-ai:appearance:v1',JSON.stringify({{theme:'{th}'}}))")
            pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
            pg.goto(B); pg.wait_for_timeout(1200)
            if lang=='en' and name=='d' and th=='dark':
                print([ (r.get_attribute('data-testid'), r.inner_text().replace('\n',' | ')) for r in pg.locator('[data-testid=home-plan] li').all()])
            pg.locator('[data-testid=home-plan]').screenshot(path=f'plan_{lang}_{th}_{name}.png')
            ctx.close()
    b.close()
print(errs)
