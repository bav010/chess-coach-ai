import json, time, datetime
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
F=[]
def check(n,c):
    print(('OK   ' if c else 'FAIL ')+n)
    if not c: F.append(n)
today=datetime.date.today().isoformat()
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium'); ctx=b.new_context(viewport={'width':1360,'height':1100}); errs=[]
    ctx.add_init_script("localStorage.setItem('chess-coach-ai:lang:v1','ru')")
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL+'#/train'); pg.wait_for_selector('[data-testid=train-view]',timeout=20000)
    check('daily+endgame+puzzles blocks', all(pg.locator(f'[data-testid=train-{k}]').count()==1 for k in ('daily','endgames','puzzles')))
    check('no mistakes/openings block without data', pg.locator('[data-testid=train-mistakes]').count()==0)
    check('starts at 0', pg.locator('[data-testid=train-count]').inner_text().startswith('0 из'))
    check('endgame points to a new position', '#/endgames/' in pg.locator('[data-testid=train-go-endgames]').get_attribute('href'))
    pg.screenshot(path='shots_train.png')
    # повторение эндшпилей: карточка просрочена -> блок «пора повторить», кнопка на обзоре
    keys=pg.evaluate("Object.keys(localStorage).filter(x=>x.includes('endgames'))"); print(' keys',keys)
    now=int(time.time()*1000)
    card={'ivl':1,'ease':2.5,'due':now-3600000,'reps':1,'lapses':0,'correct':1,'wrong':0,'last':now-90000000}
    prog={'v':1,'solved':{'krk1':{'at':now-90000000,'hints':0}},'tries':{'krk1':1},'cards':{'krk1':card}}
    pg.evaluate("([k,v])=>localStorage.setItem(k,v)",['chess-coach-ai:endgames:v1',json.dumps(prog)])
    act={'v':1,'days':[today],'daily':{},'counts':{today:{'puzzles':2,'endgames':0}}}
    pg.evaluate("([k,v])=>localStorage.setItem(k,v)",['chess-coach-ai:activity:v1',json.dumps(act)])
    pg.reload(); pg.wait_for_selector('[data-testid=train-view]')
    check('endgame review due shown', 'Пора повторить' in pg.locator('[data-testid=train-endgames]').inner_text())
    check('links to the due position', pg.locator('[data-testid=train-go-endgames]').get_attribute('href').endswith('#/endgames/krk1'))
    check('puzzle counter from activity', pg.locator('[data-testid=train-n-puzzles]').inner_text()=='2/5')
    pg.goto(URL+'#/endgames'); pg.wait_for_selector('[data-testid=eg-overview]')
    check('overview shows due button', pg.locator('[data-testid=eg-due-go]').count()==1)
    # решённое сегодня: все цели выполнены
    act2={'v':1,'days':[today],'daily':{today:{'id':'x','ok':True}},'counts':{today:{'puzzles':6,'endgames':1}}}
    pg.evaluate("([k,v])=>localStorage.setItem(k,v)",['chess-coach-ai:activity:v1',json.dumps(act2)])
    pg.goto(URL+'#/train'); pg.reload(); pg.wait_for_selector('[data-testid=train-view]')
    check('endgame done counts', pg.locator('[data-testid=train-n-endgames]').inner_text()=='1/2')
    st=pg.locator('[data-testid=train-bar]').get_attribute('aria-valuenow'); print(' percent',st)
    check('bar has progress', int(st)>0)
    pg.screenshot(path='shots_train2.png')
    # главная ведёт на тренировку, меню тоже
    pg.goto(URL+'#/'); pg.wait_for_selector('[data-testid=home-view]')
    check('home link to training', pg.locator('[data-testid=home-train-link]').count()==1 and pg.locator('[data-testid=home-card-train]').count()==1)
    pg.set_viewport_size({'width':390,'height':900}); pg.goto(URL+'#/train'); pg.wait_for_selector('[data-testid=train-view]')
    check('no horizontal scroll on phone', pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"))
    check('no page errors', not errs); print(errs,'FAILS',F); b.close()
