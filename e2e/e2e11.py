import json, time
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    ctx=b.new_context(viewport={'width':1360,'height':1700}); pg=ctx.new_page(); ctx.add_init_script("localStorage.setItem('chess-coach-ai:lang:v1','ru')")  # LANGFIX
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    (pg.evaluate("location.hash='#/openings'"), pg.wait_for_timeout(600))
    print('attack', pg.locator('[data-testid=group-attack] .lesson-card').count(), 'defense', pg.locator('[data-testid=group-defense] .lesson-card').count())
    pg.locator('[data-testid=style-defense]').click(); print('defense only', pg.locator('.lesson-card').count(), 'attack group', pg.locator('[data-testid=group-attack]').count())
    pg.locator('[data-testid=side-filter-w]').click(); print('defense+white', pg.locator('.lesson-card').count())
    pg.locator('[data-testid=side-filter-b]').click()
    # урок защиты: детский мат
    pg.locator('[data-testid=lesson-def-scholar]').click()
    L='[data-testid=lesson-board]'
    def sq(a): pg.locator(f'{L} [data-square="{a}"]').click()
    def wait_turn(): pg.wait_for_function("()=>{const t=document.querySelector('[data-testid=lesson-progress]').innerText;return t.includes('Ваш ход')||t.includes('пройден')}",timeout=10000)
    for m in ['e7e5','b8c6','g7g6','g8f6','c6d4']:
        wait_turn(); sq(m[:2]); sq(m[2:4]); time.sleep(.2)
    wait_turn(); print(pg.locator('[data-testid=lesson-progress]').inner_text())
    pg.locator('[data-testid=lesson-close]').click()
    print('repeat btn', pg.locator('[data-testid=repeat-def-scholar]').count())
    pg.locator('[data-testid=repeat-def-scholar]').click()
    print('hint toggle checked', pg.locator('[data-testid=lesson-hint-toggle]').is_checked())
    pg.locator('[data-testid=lesson-close]').click()
    # прогнать урок в репертуар и выучить: симулируем интервалы
    pg.locator('[data-testid=lesson-def-scholar]').click()
    for m in ['e7e5','b8c6','g7g6','g8f6','c6d4']:
        wait_turn(); sq(m[:2]); sq(m[2:4]); time.sleep(.2)
    wait_turn(); print(pg.locator('[data-testid=lesson-info]').inner_text())
    st=json.loads(pg.evaluate("localStorage.getItem('chess-coach-ai:openings:v1')"))
    print('rep', [r['name'] for r in st['repertoires']])
    # помечаем карточки выученными
    pg.evaluate("""()=>{const k='chess-coach-ai:openings:v1';const d=JSON.parse(localStorage.getItem(k));const t=Date.now();
      const rep=d.repertoires[0];
      // карточки создаём через тренировку: проще проставить ivl по ключам позиций через добавление
      d.__rep=rep.id; localStorage.setItem(k,JSON.stringify(d));}""")
    pg.locator('[data-testid=sub-train]').click()
    print('learned chip', pg.locator('[data-testid=mode-learned]').inner_text())
    pg.locator('[data-testid=mode-learned]').click()
    print('empty msg:', (pg.locator('[data-testid=trainer-empty]').inner_text()[:80] if pg.locator('[data-testid=trainer-empty]').count() else 'none (learned lines present) | begin: '+pg.locator('[data-testid=trainer-begin]').inner_text()))
    # пройти тренировку 'К повторению' правильно 3 раза не получится быстро → ставим ivl напрямую
    pg.locator('[data-testid=mode-due]').click(); pg.locator('[data-testid=trainer-begin]').click()
    T='[data-testid=trainer-board]'
    def tsq(a): pg.locator(f'{T} [data-square="{a}"]').click()
    line=st['repertoires'][0]['lines'][0]['moves']
    def wait_my(timeout=8000):
        pg.wait_for_function("()=>{const b=document.querySelector('[data-testid=trainer-board] .board');return b&&!b.querySelector('button[disabled]')}",timeout=timeout)
    for _ in range(12):
        try: wait_my(4000)
        except Exception: break
        if pg.locator('[data-testid=trainer-summary]').count(): break
        pr=pg.locator('[data-testid=trainer-progress]').inner_text(); n=int(pr.split('ход')[1].split('·')[0]); mv=line[(n-1)*2+1]
        tsq(mv[:2]); tsq(mv[2:4]); time.sleep(.9)
    pg.wait_for_selector('[data-testid=trainer-summary]',timeout=30000); pg.locator('[data-testid=trainer-back]').click()
    # делаем карточки выученными
    pg.evaluate("""()=>{const k='chess-coach-ai:openings:v1';const d=JSON.parse(localStorage.getItem(k));for(const id in d.cards){d.cards[id].ivl=10;d.cards[id].due=Date.now()+864000000;d.cards[id].reps=4}localStorage.setItem(k,JSON.stringify(d))}""")
    pg.reload(); pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
    (pg.evaluate("location.hash='#/openings'"), pg.wait_for_timeout(600)); pg.locator('[data-testid=sub-train]').click()
    print('learned chip after', pg.locator('[data-testid=mode-learned]').inner_text())
    pg.locator('[data-testid=mode-learned]').click()
    print('begin', pg.locator('[data-testid=trainer-begin]').inner_text())
    pg.locator('[data-testid=trainer-begin]').click(); wait_my()
    print('drill progress', pg.locator('[data-testid=trainer-progress]').inner_text())
    print('errors',errs)
