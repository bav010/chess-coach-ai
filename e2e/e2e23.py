from playwright.sync_api import sync_playwright
errs=[]; B='http://127.0.0.1:4173/chess-coach-ai/'
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':1000}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'#/analysis'); pg.wait_for_timeout(800)
    mv=lambda a,c:(pg.locator(f'[data-square={a}]:visible').click(),pg.locator(f'[data-square={c}]:visible').click(),pg.wait_for_timeout(200))
    mv('e2','e4'); mv('e7','e5'); mv('g1','f3'); mv('b8','c6')
    assert pg.locator('[data-testid=review-now]').is_enabled()
    pg.click('[data-testid=nav-prev]'); pg.click('[data-testid=nav-next]')
    pg.get_by_role('button',name='Undo move').click(); pg.wait_for_timeout(200)
    # import PGN via position tab
    pg.click('[data-testid=import-btn]'); assert pg.locator('[data-testid=position-tab]').count()==1
    ta=pg.locator('[data-testid=position-tab] textarea'); ta.fill('1. d4 d5 2. c4 e6 3. Nc3 Nf6'); pg.locator('[data-testid=pgn-import] .btn.primary').click(); pg.wait_for_timeout(600)
    print('moves text:',pg.locator('.moves-panel').inner_text().replace('\n',' ')[:120])
    # editor
    pg.click('[data-testid=editor-btn]'); pg.wait_for_timeout(300); print('editor visible', pg.locator('.pos-editor').count())
    # review
    pg.click('[data-testid=review-now]'); pg.wait_for_timeout(1500); print('review tab active:', pg.locator('[data-testid=tab-review]').get_attribute('aria-selected'))
    pg.wait_for_timeout(15000); pg.screenshot(path='an_review.png',full_page=True)
    # new game confirm
    pg.click('[data-testid=new-game]'); print('confirm:',pg.locator('[data-testid=new-game]').inner_text()); pg.click('[data-testid=new-game]'); pg.wait_for_timeout(300)
    print('after new:',pg.locator('.moves-panel').inner_text().replace('\n',' ')[:80]); print('errors',errs); b.close()
