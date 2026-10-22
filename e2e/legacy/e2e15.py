import json, time, base64
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
open('/tmp/av.png','wb').write(PNG)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    ctx=b.new_context(viewport={'width':1360,'height':1300}); pg=ctx.new_page(); ctx.add_init_script("localStorage.setItem('chess-coach-ai:lang:v1','ru')")  # LANGFIX
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    print('avatar btn', pg.locator('[data-testid=account-btn]').inner_text(), '| mode-stats tab gone', pg.locator('[data-testid=mode-stats]').count()==0)
    # данные профиля по умолчанию
    g={"v":1,"games":[{"key":"a1","at":"2026-10-01T10:00:00.000Z","src":"bot","color":"w","result":"1-0","outcome":"win","opp":1200,"tc":"-","plies":40,"endgame":False}]}
    pg.evaluate("v=>localStorage.setItem('chess-coach-ai:games:v1',v)", json.dumps(g)); pg.reload(); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    pg.locator('[data-testid=account-btn]').click()
    print('view open', pg.locator('[data-testid=account-view]:visible').count(), '| games', pg.locator('[data-testid=kpi-games]').inner_text())
    pg.locator('[data-testid=account-back]').click(); print('back -> account hidden', pg.locator('[data-testid=account-view]:visible').count())
    pg.locator('[data-testid=account-btn]').click()
    # профиль
    pg.locator('[data-testid=acc-tab-profile]').click()
    pg.locator('[data-testid=acc-name-input]').fill('Магнус'); pg.locator('[data-testid=acc-name-save]').click()
    print('name', pg.locator('[data-testid=account-btn]').inner_text())
    pg.locator('[data-testid="emoji-♛"]').click(); pg.locator('[data-testid=color-6cb8ff]').click()
    pg.locator('[data-testid=avatar-file]').set_input_files('/tmp/av.png'); time.sleep(.6)
    print('photo set', pg.locator('[data-testid=account-btn] img').count(), '| remove btn', pg.locator('[data-testid=avatar-remove]').count())
    pg.screenshot(path='shot_account.png')
    pg.locator('[data-testid=avatar-remove]').click(); print('photo removed', pg.locator('[data-testid=account-btn] img').count())
    # второй аккаунт
    pg.locator('[data-testid=acc-tab-data]').click()
    pg.locator('[data-testid=acc-new-name]').fill('Аня'); pg.locator('[data-testid=acc-add]').click()
    item=pg.locator('[data-testid^=acc-switch-]'); print('switch buttons', item.count())
    item.first.click(); time.sleep(1.5); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    print('now', pg.locator('[data-testid=account-btn]').inner_text())
    pg.locator('[data-testid=account-btn]').click(); print('new acc games (empty state)', pg.locator('[data-testid=kpi-games]').count(), pg.locator('[data-testid=stats-view] .empty-state').count())
    # данные первого не затронуты, сохраняются после перезапуска
    pg.reload(); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000); print('after reload', pg.locator('[data-testid=account-btn]').inner_text())
    pg.locator('[data-testid=account-btn]').click(); pg.locator('[data-testid=acc-tab-data]').click()
    pg.locator('[data-testid=acc-switch-default]').click(); time.sleep(1.5); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    pg.locator('[data-testid=account-btn]').click(); print('first acc', pg.locator('[data-testid=account-btn]').inner_text(), 'games', pg.locator('[data-testid=kpi-games]').inner_text())
    # удалить второй
    pg.locator('[data-testid=acc-tab-data]').click(); pg.locator('[data-testid^=acc-delete-]').first.click(); print('items after delete', pg.locator('.acc-list li').count())
    print('errs', errs); b.close()
