from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
PGN='1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 Nb4 9. O-O c6 10. Re1+ Kd7 11. d4 Qf6 12. Qxd5+ Ke8 1-0'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    pg=b.new_page(viewport={'width':1360,'height':1500})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    pg.locator('[data-testid=import-btn]').click()
    pg.locator('textarea').fill(PGN); pg.get_by_text('Загрузить партию').click()
    pg.locator('[data-testid=tab-review]').click(); pg.locator('[data-testid=start-review]').click()
    pg.wait_for_selector('[data-testid=review-report]',timeout=180000)
    rows=pg.locator('[data-testid=class-table] tr').all_inner_texts()
    print([r.replace('\n',' ') for r in rows])
    print('list icons',pg.locator('.move-btn .mark').count())
    pg.locator('.move-btn[data-ply="12"]').click()
    print('board mark',pg.locator('.sq-mark').count(), pg.locator('.sq-mark').first.get_attribute('data-cls') if pg.locator('.sq-mark').count() else None)
    pg.locator('[data-testid=tab-review]').click()
    pg.screenshot(path='../shot_marks.png',full_page=True)
    print('errors',errs); b.close()
