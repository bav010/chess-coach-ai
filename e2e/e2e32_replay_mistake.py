import json
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
F=[]
def check(n,c):
    print(('OK   ' if c else 'FAIL ')+n)
    if not c: F.append(n)
FEN='rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
item={'id':'g1#2','gameKey':'g1','ply':2,'fen':FEN,'color':'b','bestUci':'e7e5','bestSan':'e5','playedSan':'a6','cls':'mistake','loss':12.5,'at':'2026-11-01T10:00:00Z'}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium'); ctx=b.new_context(viewport={'width':1360,'height':1300}); errs=[]
    ctx.add_init_script("localStorage.setItem('chess-coach-ai:lang:v1','ru'); if(!localStorage.getItem('chess-coach-ai:mistakes:v1')) localStorage.setItem('chess-coach-ai:mistakes:v1', %s)" % json.dumps(json.dumps({'v':1,'items':{item['id']:item},'cards':{}})))
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL+'#/tactics/mine'); pg.wait_for_selector('[data-testid=mine-play]:visible',timeout=20000)
    pg.locator('[data-testid=mine-play]:visible').click(); pg.wait_for_timeout(600)
    check('went to play', pg.url.endswith('#/play'))
    check('mistake notice', 'ошибку' in pg.locator('[data-testid=play-seed]:visible').inner_text())
    pg.screenshot(path='shots_replay_setup.png')
    check('black preselected', pg.locator('.color-opt.active:visible, [aria-pressed=true]:visible').filter(has_text='Чёрные').count()>=1)
    pg.locator('[data-testid=start-game]:visible').click(); pg.wait_for_timeout(800)
    st=pg.locator('[data-testid=play-status]:visible').inner_text().replace('\n',' | '); print(' ',st)
    check('user (black) to move from the mistake position', 'ваш' in st)
    pg.locator('[data-square=e7]:visible').click(); pg.locator('[data-square=e5]:visible').click(); pg.wait_for_timeout(5000)
    st=pg.locator('[data-testid=play-status]:visible').inner_text().replace('\n',' | '); print(' ',st)
    check('bot replied', 'ваш' in st and 'Последний ход: —' not in st)
    check('no page errors', not errs); print(errs,'FAILS',F); b.close()
