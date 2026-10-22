import json, time
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    ctx=b.new_context(viewport={'width':1360,'height':1900}); pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    (pg.evaluate("location.hash='#/openings'"), pg.wait_for_timeout(600))
    pg.wait_for_function("()=>document.querySelector('[data-testid=catalog-panel]:not([hidden])')&&document.querySelectorAll('[data-testid=opening-list] li').length>0",timeout=20000)
    print('catalog pill', pg.locator('[data-testid=catalog-panel] .pill').inner_text())
    S='[data-testid=study-board]'
    def sq(a): pg.locator(f'{S} [data-square="{a}"]').click()
    pg.locator('[data-testid=catalog-search]').fill('Italian Game')
    print('search results', pg.locator('[data-testid=opening-list] li').count(), pg.locator('[data-testid=opening-list] li').first.inner_text().replace('\n',' '))
    pg.locator('[data-testid=opening-list] .opening-item').first.click()
    print('opening name', pg.locator('[data-testid=opening-name]').inner_text(), '| line', pg.locator('[data-testid=line-moves]').inner_text().replace('\n',' '))
    pg.locator('[data-testid=study-prev]').click(); pg.locator('[data-testid=study-prev]').click()
    print('after back', pg.locator('[data-testid=opening-name]').inner_text())
    pg.locator('[data-testid=study-reset]').click()
    sq('e2'); sq('e4')
    pg.locator('[data-testid=otab-next]').click()
    print('continuations', pg.locator('[data-testid=cont-list] li').count(), 'rec', pg.locator('[data-testid=cont-rec]').count())
    pg.locator('[data-testid=cont-rec]').click()
    print('after rec', pg.locator('[data-testid=opening-name]').inner_text())
    pg.locator('[data-testid=ask-engine]').click(); pg.wait_for_selector('[data-testid=engine-lines]',timeout=30000)
    print('engine', pg.locator('[data-testid=engine-lines]').inner_text().replace('\n',' | '))
    # репертуар
    pg.locator('[data-testid=otab-rep]').click()
    pg.locator('[data-testid=rep-new-name]').fill('Мои белые'); pg.locator('[data-testid=rep-new-w]').click(); pg.locator('[data-testid=rep-create]').click()
    for q in ['Italian Game: Giuoco Piano','Ruy Lopez: Morphy Defense']:
        pg.locator('[data-testid=otab-catalog]').click()
        pg.locator('[data-testid=catalog-search]').fill(q)
        pg.locator('[data-testid=opening-list] .opening-item').first.click()
        pg.locator('[data-testid=otab-rep]').click(); pg.locator('[data-testid=add-line]').click()
    pg.locator('[data-testid=pos-note]').fill('Главная идея: развитие и центр')
    print('rep lines', pg.locator('[data-testid=rep-line]').count(), pg.locator('[data-testid=study-info]').inner_text())
    pg.reload(); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    (pg.evaluate("location.hash='#/openings'"), pg.wait_for_timeout(600)); pg.locator('[data-testid=otab-rep]').click()
    print('after reload lines', pg.locator('[data-testid=rep-line]').count())
    data=json.loads(pg.evaluate("localStorage.getItem('chess-coach-ai:openings:v1')"))
    lines=data['repertoires'][0]['lines']; print([len(l['moves']) for l in lines])
    # тренировка
    pg.locator('[data-testid=sub-train]').click()
    print('due', pg.locator('[data-testid=cnt-due]').inner_text())
    pg.locator('[data-testid=trainer-begin]').click()
    T='[data-testid=trainer-board]'
    def tsq(a): pg.locator(f'{T} [data-square="{a}"]').click()
    def wait_my(timeout=8000):
        pg.wait_for_function("()=>{const b=document.querySelector('[data-testid=trainer-board] .board');return b&&!b.querySelector('button[disabled]')}",timeout=timeout)
    wait_my()
    first=pg.locator('[data-testid=trainer-progress]').inner_text(); print('progress',first)
    # неверный ход: a2a3
    tsq('a2'); tsq('a3'); time.sleep(.3)
    print('msg wrong:', pg.locator('[data-testid=trainer-message]').inner_text())
    # правильный ход из первой линии
    lname=first.split('·')[-1].strip()
    mv=[l for l in lines if l['name'].strip()==lname][0]['moves']
    tsq(mv[0][:2]); tsq(mv[0][2:4]); time.sleep(.3)
    print('msg after learn:', pg.locator('[data-testid=trainer-message]').inner_text())
    # проходим линии правильно
    for _ in range(12):
        try: wait_my(5000)
        except Exception: break
        if pg.locator('[data-testid=trainer-summary]').count(): break
        pr=pg.locator('[data-testid=trainer-progress]').inner_text(); name=pr.split('·')[-1].strip()
        cur=[l for l in lines if l['name'].strip()==name][0]['moves']
        # определить ход по числу ходов на доске невозможно -> берем ход из msg: вычислим по "ход N"
        n=int(pr.split('ход')[1].split('·')[0]); idx=(n-1)*2
        mvv=cur[idx]; tsq(mvv[:2]); tsq(mvv[2:4]); time.sleep(.9)
    pg.wait_for_selector('[data-testid=trainer-summary]',timeout=40000)
    print('summary:', pg.locator('[data-testid=trainer-summary]').inner_text().replace('\n',' | '))
    pg.locator('[data-testid=trainer-back]').click()
    print('stats', pg.locator('[data-testid=cnt-due]').inner_text(), pg.locator('[data-testid=cnt-percent]').inner_text())
    st=json.loads(pg.evaluate("localStorage.getItem('chess-coach-ai:openings:v1')"))
    print({k:(v['ivl'],v['lapses']) for k,v in st['cards'].items()})
    pg.screenshot(path='shot_openings.png')
    print('errors',errs)
