import time
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    ctx=b.new_context(viewport={'width':1360,'height':1700}); pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    (pg.evaluate("location.hash='#/openings'"), pg.wait_for_timeout(600)); pg.locator('[data-testid=sub-study]').click()
    S='[data-testid=study-board]'
    pg.locator('[data-testid=opening-list] .opening-item').nth(3).click()
    arrows=lambda: pg.locator(f'{S} .board-arrows g').count()
    print('title', pg.locator('[data-testid=line-title]').inner_text(), '| arrows', arrows())
    # первый ход линии — сыграть на доске по стрелке
    g=pg.locator(f'{S} .board-arrows').first
    moves=pg.locator('[data-testid=line-moves] .line-move').all_inner_texts(); print('line', moves)
    def sq(x): pg.locator(f'{S} [data-square="{x}"]').click()
    M={'e4':('e2','e4'),'d4':('d2','d4'),'Nh3':('g1','h3'),'Nf3':('g1','f3'),'c4':('c2','c4'),'b4':('b2','b4'),'g4':('g2','g4'),'a3':('a2','a3'),'b3':('b2','b3'),'f4':('f2','f4'),'Nc3':('b1','c3'),'g3':('g2','g3'),'d3':('d2','d3'),'e3':('e2','e3'),'c3':('c2','c3'),'h4':('h2','h4'),'a4':('a2','a4'),'Na3':('b1','a3')}
    first=moves[0].strip(); print('first', first)
    a,b2=M[first]; sq(a); sq(b2); time.sleep(.3)
    print('after board move: arrows', arrows(), '| title kept', pg.locator('[data-testid=line-title]').count(), '| legend', pg.locator('[data-testid=arrow-legend]').count())
    for _ in range(len(moves)+6):
        if pg.locator('[data-testid=study-next]').is_disabled(): break
        pg.locator('[data-testid=study-next]').click()
    time.sleep(.3)
    print('end of line: hint arrows', arrows(), '| hint-legend', pg.locator('[data-testid=hint-legend]').count())
    pg.screenshot(path='shot_hint.png')
    pg.locator('[data-testid=ahead-toggle]').click(); print('hint off', arrows())
    pg.locator('[data-testid=ahead-toggle]').click(); print('hint on', arrows())
    pg.locator('[data-testid=study-prev]').click(); print('back one: arrows', arrows())
    print('errs', errs)
    b.close()
