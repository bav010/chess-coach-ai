from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
PGN='1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 Nb4 9. O-O c6 10. Re1+ Kd7 11. d4 Qf6 12. Qxd5+ Ke8 1-0'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    pg=b.new_page(viewport={'width':1360,'height':1300})
    errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    pg.locator('[data-testid=import-btn]').click()
    pg.locator('textarea').fill(PGN); pg.get_by_text('Загрузить партию').click()
    print('err:',pg.locator('.error-text').all_inner_texts(),'moves',pg.locator('.move-btn').count())
    pg.locator('[data-testid=tab-review]').click()
    pg.locator('[data-testid=start-review]').click()
    pg.wait_for_selector('[data-testid=review-report]',timeout=180000)
    print('acc',pg.locator('[data-testid=accuracy-w]').inner_text(),pg.locator('[data-testid=accuracy-b]').inner_text())
    print(pg.locator('.moment-list').first.inner_text()[:500] if pg.locator('.moment-list').count() else 'no moments')
    pg.screenshot(path='../shot_review.png',full_page=True)
    # trainer
    if pg.get_by_text('Все ошибки').count():
        orig=pg.locator('.move-btn').count()
        pg.get_by_text('Все ошибки').first.click()
        pg.wait_for_selector('[data-testid=trainer]')
        print('trainer msg:',pg.locator('[data-testid=trainer-message]').inner_text())
        pg.get_by_text('Показать лучший ход').click()
        print('solution:',pg.locator('[data-testid=trainer-solution]').inner_text()[:300])
        print('stats',pg.locator('[data-testid=trainer-stats]').inner_text().replace('\n',' '))
        pg.screenshot(path='../shot_trainer.png',full_page=True)
        pg.get_by_text('Вернуться к исходной партии').click()
        print('original moves',pg.locator('.move-btn').count(),'==',orig)
    print('errors',errs); b.close()
