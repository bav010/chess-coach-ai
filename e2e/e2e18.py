import json
src=open('e2e16.py').read().split('with sync_playwright() as p:')[0]
exec(src)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    ctx,pg,errs=mkpage(b)
    pg.goto(URL); pg.wait_for_timeout(2500)
    s=pg.locator('[data-testid=top-status]'); print('up:', s.get_attribute('data-state'), '|', s.inner_text(), '|', s.get_attribute('class'), '| dot', pg.locator('.top-status i').get_attribute('class'))
    STATE['down']=True
    pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); pg.wait_for_timeout(1500)
    print('down:', s.get_attribute('data-state'), '|', s.inner_text(), '| dot', pg.locator('.top-status i').get_attribute('class'), '| tip', s.get_attribute('title').replace('\n',' / '))
    STATE['down']=False
    pg.evaluate("window.dispatchEvent(new Event('online'))"); pg.wait_for_timeout(1500)
    print('back:', s.get_attribute('data-state'), '|', s.inner_text())
    pg.locator('[data-testid=lang-ru]').first.evaluate('e=>e.click()'); print('ru:', s.inner_text())
    print(errs)
