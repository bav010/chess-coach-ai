from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    pg=b.new_page(viewport={'width':1360,'height':1300})
    errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('console',lambda m: errs.append(m.text) if m.type=='error' and 'ERR_' not in m.text and 'fonts' not in m.text else None)
    pg.goto(URL); pg.wait_for_selector('.square'); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    def mv(a,b_):
        pg.locator(f'[data-square=\"{a}\"]:visible').click(); pg.locator(f'[data-square=\"{b_}\"]:visible').click()
    mv('e2','e4'); mv('e7','e5'); mv('g1','f3')
    pg.wait_for_function("()=>document.querySelector('[data-testid=analysis-indicator]')?.textContent.includes('готов')",timeout=40000)
    print('eval',pg.locator('[data-testid=eval-text]').inner_text(),'best',pg.locator('[data-testid=best-move]').inner_text())
    print('bar pct',pg.locator('.eval-bar').get_attribute('data-pct'),'arrows',pg.locator('.board-arrows g').count())
    # navigation back
    pg.locator('[data-testid=nav-prev]').click()
    pg.wait_for_function("()=>document.querySelector('[data-testid=analysis-indicator]')?.textContent.includes('готов')",timeout=40000)
    print('after prev eval',pg.locator('[data-testid=eval-text]').inner_text())
    pg.locator('[data-testid=nav-next]').click()
    # toggle panel off keeps board
    pg.locator('[data-testid=toggle-panel]').uncheck()
    print('panel hidden, squares', pg.locator('.square').count(), 'bar still', pg.locator('.eval-bar').count())
    pg.locator('[data-testid=toggle-panel]').check()
    pg.locator('[data-testid=flip]').click()
    print('orientation', pg.locator('.board').get_attribute('data-orientation'))
    pg.screenshot(path='../shot_analysis.png',full_page=True)
    # PGN import: bad then good
    pg.locator('[data-testid=import-btn]').click()
    pg.locator('textarea').fill('rubbish'); pg.get_by_text('Загрузить партию').click()
    print('pgn err:',pg.locator('.error-text').inner_text())
    pg.locator('textarea').fill('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 5. O-O f6 6. d4 exd4 7. Nxd4 c5 8. Nb3 Qxd1 9. Rxd1 Bg4 10. f3 Be6 11. Nc3 O-O-O 12. Be3 b6 13. Ne4 Bd5 14. Nbd2 Bxe4 15. fxe4 Ne7 16. Nc4 Nc6 17. Rxd8+ Rxd8 18. Rd1 Re8 19. Rd7 1-0')
    pg.get_by_text('Загрузить партию').click()
    pg.locator('[data-testid=tab-review]').click()
    pg.locator('[data-testid=start-review]').click()
    pg.wait_for_selector('[data-testid=review-report]',timeout=120000)
    print('acc w/b',pg.locator('[data-testid=accuracy-w]').inner_text(),pg.locator('[data-testid=accuracy-b]').inner_text())
    print('moves in list', pg.locator('.move-btn').count(), 'game ucis unchanged')
    pg.screenshot(path='../shot_review.png',full_page=True)
    print('errors',errs); b.close()
