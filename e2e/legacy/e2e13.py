import json, time
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
G="chess-coach-ai:games:v1"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    ctx=b.new_context(viewport={'width':1360,'height':2200},accept_downloads=True); pg=ctx.new_page(); ctx.add_init_script("localStorage.setItem('chess-coach-ai:lang:v1','ru')")  # LANGFIX
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    def openstats():
        if pg.locator('[data-testid=account-view]:visible').count()==0: pg.locator('[data-testid=account-btn]').click()
        pg.locator('[data-testid=acc-tab-stats]').click()
    def opendata():
        if pg.locator('[data-testid=account-view]:visible').count()==0: pg.locator('[data-testid=account-btn]').click()
        pg.locator('[data-testid=acc-tab-data]').click()
    pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    pg.evaluate("localStorage.setItem('chess-coach-ai:prefs:v1', JSON.stringify({autoReview:false}))")
    pg.reload(); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    openstats()
    print('empty state', pg.locator('.empty-state').count(), 'kpis', pg.locator('[data-testid=stats-kpis]').count())
    # реальная партия
    (pg.evaluate("location.hash='#/play'"), pg.wait_for_timeout(600))
    pg.locator('[data-testid=elo-input]').fill('1000')
    pg.locator('[data-testid=tc-custom]').click()
    pg.locator('[data-testid=custom-you]').fill('1'); pg.locator('[data-testid=custom-bot]').fill('1'); pg.locator('[data-testid=custom-inc]').fill('2')
    pg.locator('[data-testid=start-game]').click(); pg.wait_for_selector('[data-testid=play-board]')
    pg.locator('[data-testid=play-board] [data-square="e2"]').click(); pg.locator('[data-testid=play-board] [data-square="e4"]').click()
    pg.wait_for_function("()=>document.querySelector('[data-testid=play-status]').innerText.includes('Ход: ваш')",timeout=30000)
    pg.locator('[data-testid=resign]').click(); pg.locator('[data-testid=resign]').click()
    time.sleep(.5)
    openstats()
    print('games', pg.locator('[data-testid=kpi-games]').inner_text(), 'wdl', pg.locator('[data-testid=kpi-wdl]').inner_text(), 'rating', pg.locator('[data-testid=kpi-rating]').inner_text())
    st=json.loads(pg.evaluate(f"localStorage.getItem('{G}')")); g0=st['games'][0]; print('rec', g0['src'], g0['color'], g0['outcome'], g0['opp'], g0['tc'])
    # перезапуск — данные на месте, без дублей
    pg.reload(); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000); openstats()
    print('after reload', pg.locator('[data-testid=kpi-games]').inner_text())
    # синтетические партии с разбором
    def rv(i):
        return {"v":1,"moves":30,"acc":60+i*3,"counts":{"blunder":2 if i<5 else 0,"mistake":1,"inaccuracy":2},"phases":{"opening":{"n":10,"acc":90,"bad":0},"middlegame":{"n":15,"acc":70,"bad":2},"endgame":{"n":5,"acc":50,"bad":1}},"hung":1 if i<4 else 0,"missed":1,"peakWin":85 if i%2 else 55,"endEntry":70}
    games=[]
    for i in range(8):
        out=['win','loss','draw','loss'][i%4]
        games.append({"key":f"syn{i}","at":f"2026-10-{1+i:02d}T10:00:00.000Z","src":"bot","color":'w' if i%2==0 else 'b',"result":{'win':'1-0','loss':'0-1','draw':'1/2-1/2'}[out] if i%2==0 else {'win':'0-1','loss':'1-0','draw':'1/2-1/2'}[out],"outcome":out,"opp":1000+i*50,"tc":"-" if i<4 else "300+3","plies":50,"endgame":i%2==0,"review":rv(i)})
    cur=json.loads(pg.evaluate(f"localStorage.getItem('{G}')")); cur['games']+=games
    pg.evaluate("v=>localStorage.setItem('"+G+"',v)", json.dumps(cur))
    pg.reload(); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000); openstats()
    print('games', pg.locator('[data-testid=kpi-games]').inner_text(), 'wdl', pg.locator('[data-testid=kpi-wdl]').inner_text(), 'rating', pg.locator('[data-testid=kpi-rating]').inner_text(), 'acc', pg.locator('[data-testid=kpi-acc]').inner_text(), 'err', pg.locator('[data-testid=kpi-err]').inner_text())
    print('charts svg', pg.locator('.st-chart svg').count(), 'recs', pg.locator('.st-rec').count(), [pg.locator('.st-rec b').nth(i).inner_text() for i in range(pg.locator('.st-rec').count())])
    print('basis', pg.locator('.st-basis').first.inner_text())
    pg.screenshot(path='shot_stats.png',full_page=True)
    pg.locator('[data-testid=f-color]').select_option('b'); print('black only', pg.locator('[data-testid=kpi-games]').inner_text())
    pg.locator('[data-testid=f-result]').select_option('win'); print('black wins', pg.locator('[data-testid=kpi-games]').inner_text())
    pg.locator('[data-testid=f-reset]').click()
    pg.locator('[data-testid=f-mode]').select_option('botClock'); print('with clock', pg.locator('[data-testid=kpi-games]').inner_text())
    pg.locator('[data-testid=f-reset]').click()
    pg.locator('[data-testid=f-period]').select_option('7'); print('period 7 (старые партии за 2026-10-xx)', pg.locator('[data-testid=kpi-games]').inner_text(), pg.locator('[data-testid=stats-nomatch]').count())
    pg.locator('[data-testid=f-reset]').click()
    # резервная копия
    opendata()
    with pg.expect_download() as dl: pg.locator('[data-testid=backup-download]').click()
    path=dl.value.path(); bk=json.load(open(path)); print('backup games', len(bk['games']), 'sessions', len(bk['sessions']))
    pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000); openstats()
    print('cleared', pg.locator('.empty-state').count())
    opendata(); pg.locator('[data-testid=backup-file]').set_input_files(path); time.sleep(2.5)
    pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000); openstats()
    print('restored', pg.locator('[data-testid=kpi-games]').inner_text())
    # повторное восстановление не дублирует
    opendata(); pg.locator('[data-testid=backup-file]').set_input_files(path); time.sleep(2.5)
    pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000); openstats()
    print('restored twice', pg.locator('[data-testid=kpi-games]').inner_text())
    # мало данных
    cur=json.loads(pg.evaluate(f"localStorage.getItem('{G}')")); cur['games']=cur['games'][:3]
    pg.evaluate("v=>localStorage.setItem('"+G+"',v)", json.dumps(cur)); pg.reload(); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000); openstats()
    print('few data msg', pg.locator('[data-testid=recs-more]').count(), pg.locator('.st-rec').count())
    print('errs', errs)
    b.close()
