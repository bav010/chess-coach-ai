src=open('e2e16.py').read().split('with sync_playwright() as p:')[0]
exec(src)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    ctx,pg,errs=mkpage(b); pg.set_viewport_size({'width':1360,'height':900})
    pg.goto(URL); pg.wait_for_timeout(1500); pg.locator('[data-testid=signin-btn]').click(); pg.wait_for_timeout(500); pg.screenshot(path='shot_gate.png')
    pg.locator('[data-testid=cloud-mode-register]').click(); fill(pg,'zed@example.com','password123','password123'); pg.locator('[data-testid=cloud-submit]').click(); pg.wait_for_selector('[data-testid=acc-setup]'); pg.wait_for_timeout(800); pg.screenshot(path='shot_setup.png')
