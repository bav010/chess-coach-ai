from playwright.sync_api import sync_playwright
errs=[]; B='http://127.0.0.1:4173/chess-coach-ai/'
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':800}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'#/'); pg.wait_for_timeout(700)
    pg.keyboard.press('Control+k'); pg.wait_for_timeout(300); assert pg.locator('[data-testid=cmdk]').count()==1
    pg.screenshot(path='cmdk_open.png')
    pg.keyboard.type('nast'); pg.wait_for_timeout(100); print('nast ->',pg.locator('.cmdk-item').count())
    pg.fill('[data-testid=cmdk-input]','настр'); pg.wait_for_timeout(150); print('настр ->',[x for x in pg.locator('.cmdk-item span').all_inner_texts()])
    pg.keyboard.press('Enter'); pg.wait_for_timeout(400); print('hash',pg.evaluate('location.hash'), 'palette closed', pg.locator('[data-testid=cmdk]').count()==0)
    pg.keyboard.press('Control+k'); pg.fill('[data-testid=cmdk-input]','puzzle'); pg.wait_for_timeout(100); print('puzzle ->',pg.locator('.cmdk-item span').all_inner_texts())
    pg.keyboard.press('ArrowDown'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400); print('hash',pg.evaluate('location.hash'))
    pg.keyboard.press('Control+k'); pg.fill('[data-testid=cmdk-input]','light'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300); print('theme',pg.evaluate('document.documentElement.dataset.theme'))
    pg.keyboard.press('Control+k'); pg.fill('[data-testid=cmdk-input]','русск'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300); print('lang',pg.evaluate('document.documentElement.lang'))
    pg.keyboard.press('Control+k'); pg.wait_for_timeout(200); pg.screenshot(path='cmdk_ru.png'); pg.keyboard.press('Escape'); print('esc closed', pg.locator('[data-testid=cmdk]').count()==0)
    pg.set_viewport_size({'width':390,'height':800}); pg.wait_for_timeout(200); pg.screenshot(path='cmdk_btn_m.png'); print(errs); b.close()
