import json
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
F=[]
def check(n,c):
    print(('OK   ' if c else 'FAIL ')+n)
    if not c: F.append(n)
KN=[(1,2),(2,1),(2,-1),(1,-2),(-1,-2),(-2,-1),(-2,1),(-1,2)]
def nm(f,r): return 'abcdefgh'[f]+str(r+1)
def kmoves(s):
    f,r=ord(s[0])-97,int(s[1])-1; return [nm(f+a,r+b) for a,b in KN if 0<=f+a<8 and 0<=r+b<8]
def path(a,b):
    prev={a:None}; q=[a]
    while q:
        s=q.pop(0)
        if s==b: break
        for n in kmoves(s):
            if n not in prev: prev[n]=s; q.append(n)
    out=[]; s=b
    while s!=a: out.append(s); s=prev[s]
    return out[::-1]
def attacks(p,s):
    f,r=ord(s[0])-97,int(s[1])-1; out=[]
    if p=='n': return kmoves(s)
    dirs={'b':[(1,1),(1,-1),(-1,1),(-1,-1)],'r':[(1,0),(-1,0),(0,1),(0,-1)]}; dirs['q']=dirs['b']+dirs['r']; dirs['k']=dirs['q']
    for a,b in dirs[p]:
        for k in range(1,8):
            ff,rr=f+a*k,r+b*k
            if not(0<=ff<8 and 0<=rr<8): break
            out.append(nm(ff,rr))
            if p=='k': break
    return out
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium'); ctx=b.new_context(viewport={'width':1360,'height':1200}); errs=[]
    ctx.add_init_script("localStorage.setItem('chess-coach-ai:lang:v1','ru')")
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    V='[data-testid=vision-view] '
    pg.goto(URL+'#/vision'); pg.wait_for_selector('[data-testid=vision-view]',timeout=20000)
    # --- координаты ---
    pg.locator(V+'[data-testid=vision-start]').click(); pg.wait_for_selector(V+'[data-testid=vision-target]')
    for i in range(6):
        t=pg.locator(V+'[data-testid=vision-target]').inner_text().strip()
        pg.locator(V+f'[data-square={t}]').click(); pg.wait_for_timeout(60)
    check('score counted', '6' in pg.locator(V+'[data-testid=vision-score]').inner_text())
    t=pg.locator(V+'[data-testid=vision-target]').inner_text().strip(); wrong='a1' if t!='a1' else 'h8'
    pg.locator(V+f'[data-square={wrong}]').click(); pg.wait_for_timeout(100)
    check('wrong click flashes red', pg.locator(V+f'[data-square={wrong}]').get_attribute('data-mark')=='bad')
    pg.screenshot(path='shots_vision_coords.png')
    pg.wait_for_selector(V+'[data-testid=vision-summary]',timeout=40000)
    check('final result 6', '6' in pg.locator(V+'[data-testid=vision-final]').inner_text())
    check('record shown first time', pg.locator(V+'[data-testid=vision-record]').count()==1)
    check('best saved', '6' in pg.locator(V+'[data-testid=vision-best]').inner_text())
    # --- конь ---
    pg.locator(V+'[data-testid=vision-tab-knight]').click(); pg.locator(V+'[data-testid=vision-start]').click()
    for rnd in range(10):
        pg.wait_for_selector(V+'[data-testid=vision-target]')
        a,bb=[x.strip() for x in pg.locator(V+'[data-testid=vision-target]').inner_text().split('→')]
        for s in path(a,bb): pg.locator(V+f'[data-square={s}]').click(); pg.wait_for_timeout(40)
        if rnd==0:
            check('shortest route praised', 'Кратчайший' in pg.locator(V+'[data-testid=vision-info]').inner_text()); pg.screenshot(path='shots_vision_knight.png')
        pg.locator(V+'[data-testid=vision-next]').click()
    check('knight 10 of 10', '10 из 10' in pg.locator(V+'[data-testid=vision-final]').inner_text())
    # --- поля под боем ---
    pg.locator(V+'[data-testid=vision-tab-attacks]').click(); pg.locator(V+'[data-testid=vision-start]').click()
    for rnd in range(8):
        pg.wait_for_selector(V+'[data-testid=vision-target]')
        txt=pg.locator(V+'[data-testid=vision-target]').inner_text().split(); name,sqr=txt[0],txt[1]
        pc={'Конь':'n','Слон':'b','Ладья':'r','Ферзь':'q','Король':'k'}[name]
        truth=attacks(pc,sqr)
        if rnd==1: truth=truth[:-1]   # намеренно пропускаем одну клетку
        for s in truth: pg.locator(V+f'[data-square={s}]').click()
        pg.locator(V+'[data-testid=vision-check]').click()
        if rnd==0: check('perfect answer', 'верно' in pg.locator(V+'[data-testid=vision-info]').inner_text().lower()); pg.screenshot(path='shots_vision_attacks.png')
        if rnd==1: check('missed square marked orange', pg.locator(V+'[data-mark=miss]').count()==1)
        pg.locator(V+'[data-testid=vision-next]').click()
    check('attacks 7 of 8', '7 из 8' in pg.locator(V+'[data-testid=vision-final]').inner_text())
    check('home card', (pg.goto(URL+'#/') or True) and pg.locator('[data-testid=home-card-vision]').count()==1)
    pg.set_viewport_size({'width':390,'height':900}); pg.goto(URL+'#/vision'); pg.wait_for_selector('[data-testid=vision-view]')
    check('no horizontal scroll on phone', pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"))
    check('no page errors', not errs); print(errs,'FAILS',F); b.close()
