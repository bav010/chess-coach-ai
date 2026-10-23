# «Мои дебюты» + поиск Ctrl+K по новым функциям
import json
from playwright.sync_api import sync_playwright
B='http://127.0.0.1:4173/chess-coach-ai/'
def pgn(w,b,res,mv): return f'[Event "x"]\n[White "{w}"]\n[Black "{b}"]\n[Result "{res}"]\n\n{mv} {res}'
IT='1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 d6 5. O-O Be7'
IT2='1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4'
SI='1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6'
rows=[(IT,'1-0','w'),(IT,'0-1','w'),(IT2,'0-1','w'),(IT2,'0-1','w'),(SI,'1-0','b')]
sess=[]
for i,(m,r,c) in enumerate(rows):
    w,b=('You','Bot ~1200') if c=='w' else ('Bot ~1200','You')
    sess.append({'id':i+1,'created_at':f'2026-10-0{i+1}T10:00:00Z','result':r,'plies':10,'pgn':pgn(w,b,r,m)})
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    ctx=b.new_context(viewport={'width':1280,'height':1000}); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    ctx.add_init_script("if(!localStorage.getItem('chess-coach-ai:sessions:v1'))localStorage.setItem('chess-coach-ai:sessions:v1',%s)"%json.dumps(json.dumps(sess)))
    pg.goto(B+'#/openings/mine'); pg.wait_for_timeout(1800)
    print('1 count', pg.locator('[data-testid=op-mine-count]').inner_text(), '| cards', pg.locator('[data-testid=op-mine-card]:visible').count())
    for c in pg.locator('[data-testid=op-mine-card]:visible').all(): print('  ', c.inner_text().replace('\n',' | ')[:260])
    print('2 weak', pg.locator('[data-testid=op-mine-weak]:visible').inner_text().replace('\n',' | ')[:200] if pg.locator('[data-testid=op-mine-weak]:visible').count() else 'none')
    pg.click('[data-testid=op-mine-b]'); pg.wait_for_timeout(300); print('3 black only cards', pg.locator('[data-testid=op-mine-card]:visible').count())
    pg.screenshot(path='shot_opmine_en.png', full_page=True)
    # палитра
    pg.goto(B); pg.wait_for_timeout(800)
    for q,exp in (('fix mistakes','cmdk-mine'),('исправить ошибки','cmdk-mine'),('план','cmdk-plan'),('opening results','cmdk-myop'),('разбор','cmdk-review'),('sound','cmdk-style')):
        pg.keyboard.press('Control+k'); pg.wait_for_timeout(200); pg.fill('[data-testid=cmdk-input]',q); pg.wait_for_timeout(200)
        ids=[e.get_attribute('data-testid') for e in pg.locator('[data-testid^=cmdk-]:visible li, li[data-testid^=cmdk-]').all()]
        print('4', q, '->', ids[:3], 'OK' if exp in ids else 'MISSING')
        if q=='fix mistakes': pg.keyboard.press('Enter'); pg.wait_for_timeout(600); print('   hash', pg.evaluate('location.hash'), 'mine visible', pg.locator('[data-testid=mine-view]:visible').count()); 
        else: pg.keyboard.press('Escape')
    # ru
    pg.evaluate("localStorage.setItem('chess-coach-ai:lang:v1','ru')"); pg.goto(B+'#/openings/mine'); pg.reload(); pg.wait_for_timeout(1800)
    print('5 ru', pg.locator('[data-testid=op-mine-count]').inner_text(), '|', pg.locator('[data-testid=op-mine-card]:visible').first.inner_text().replace('\n',' | ')[:200])
    pg.screenshot(path='shot_opmine_ru.png', full_page=True)
    b.close()
print('errors', errs)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium'); errs=[]
    for th,vp in (('light',{'width':390,'height':844}),('dark',{'width':1280,'height':900})):
        ctx=b.new_context(viewport=vp); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
        ctx.add_init_script("if(!localStorage.getItem('chess-coach-ai:sessions:v1'))localStorage.setItem('chess-coach-ai:sessions:v1',%s);localStorage.setItem('chess-coach-ai:appearance:v1',JSON.stringify({theme:'%s'}))"%(json.dumps(json.dumps(sess)),th))
        pg.goto(B+'#/openings/mine'); pg.wait_for_timeout(1800)
        pg.click('[data-testid=op-mine-b]'); print('6', th, 'weak when Black filter:', pg.locator('[data-testid=op-mine-weak]:visible').count()); pg.click('[data-testid=op-mine-all]')
        pg.screenshot(path=f'shot_opmine_{th}_{vp["width"]}.png', full_page=True)
        pg.click('[data-testid=op-mine-study]'); pg.wait_for_timeout(400); print('7 study tab visible', pg.locator('[data-testid=catalog-panel]:visible').count(), pg.evaluate('location.hash'))
        ctx.close()
    print('errors2', errs)
