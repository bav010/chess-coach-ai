# «Мои ошибки»: пустой банк → разбор в хранилище → задачи → верный/неверный ответ → повтор
import json
from playwright.sync_api import sync_playwright
B='http://127.0.0.1:4173/chess-coach-ai/'
START='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
ucis=['e2e4','e7e5','d1h5','b8c6','f1c4','g8f6','h5f7']
ev=lambda cp,b:{'depth':12,'lines':[{'multipv':1,'depth':12,'cp':cp,'mate':None,'pv':[b]},{'multipv':2,'depth':12,'cp':cp-300,'mate':None,'pv':['a7a6']}]}
evals=[ev(30,'e2e4'),ev(-30,'e7e5'),ev(30,'g1f3'),ev(-30,'b8c6'),ev(30,'g1f3'),ev(-20,'g7g6'),{'depth':12,'lines':[{'multipv':1,'depth':12,'cp':None,'mate':1,'pv':['h5f7']}]},{'depth':0,'lines':[]}]
review=[{'key':'k1','created_at':'2026-10-01T10:00:00Z','startFen':START,'ucis':ucis,'userColor':'b','evals':evals,'trainer':{}}]
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    def page(seed):
        ctx=b.new_context(viewport={'width':1280,'height':1000}); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
        if seed: ctx.add_init_script("if(!localStorage.getItem('chess-coach-ai:reviews:v1'))localStorage.setItem('chess-coach-ai:reviews:v1',%s)"%json.dumps(json.dumps(review)))
        return ctx,pg
    # 1. пусто
    ctx,pg=page(False); pg.goto(B+'#/tactics'); pg.wait_for_timeout(800); pg.click('[data-testid=ptab-mine]'); pg.wait_for_timeout(400)
    print('1 empty:', pg.locator('[data-testid=mine-empty]:visible').count(), 'cta', pg.locator('[data-testid=mine-to-analysis]').count(), 'total', pg.locator('[data-testid=mine-total]').inner_text()); ctx.close()
    # 2. банк из сохранённого разбора
    ctx,pg=page(True); pg.goto(B+'#/tactics'); pg.wait_for_timeout(800); pg.click('[data-testid=ptab-mine]'); pg.wait_for_timeout(600)
    print('2 total', pg.locator('[data-testid=mine-total]').inner_text(), 'progress', pg.locator('[data-testid=mine-progress]').inner_text(), '|', pg.locator('[data-testid=mine-task]').inner_text())
    sq=lambda s: pg.locator(f'[data-testid=mine-view] [data-square="{s}"]:visible')
    # неверный ход
    sq('a7').click(); sq('a6').click(); pg.wait_for_timeout(300)
    print('3 wrong:', pg.locator('[data-testid=mine-message]').inner_text())
    # верный ход g7g6
    sq('g7').click(); sq('g6').click(); pg.wait_for_timeout(400)
    print('4 right:', pg.locator('[data-testid=mine-message]').inner_text())
    pg.screenshot(path='shot_mine_en.png')
    st=json.loads(pg.evaluate("localStorage.getItem('chess-coach-ai:mistakes:v1')")); c=list(st['cards'].values())[0]
    print('5 card wrong', c['wrong'], 'correct', c['correct'], 'due in min', round((c['due']-pg.evaluate('Date.now()'))/60000))
    pg.click('[data-testid=mine-next]'); pg.wait_for_timeout(300)
    print('6 after next:', pg.locator('[data-testid=mine-empty]:visible').count(), pg.locator('.empty-state:visible p').first.inner_text())
    # язык ru без потери
    pg.evaluate("localStorage.setItem('chess-coach-ai:lang:v1','ru')"); pg.reload(); pg.wait_for_timeout(800); pg.click('[data-testid=ptab-mine]'); pg.wait_for_timeout(400)
    print('7 ru:', pg.locator('[data-testid=ptab-mine]').inner_text(), '|', pg.locator('.empty-state:visible p').first.inner_text(), '| total', pg.locator('[data-testid=mine-total]').inner_text())
    pg.screenshot(path='shot_mine_ru.png')
    # библиотека не сломана
    pg.click('[data-testid=ptab-library]'); pg.wait_for_timeout(400); print('8 library visible', pg.locator('[data-testid=puzzle-view]:visible').count())
    ctx.close(); b.close()
print('errors', errs)
# 9. шаг плана на главной ведёт в «Мои ошибки»
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium'); ctx=b.new_context(viewport={'width':1280,'height':1000}); pg=ctx.new_page(); e2=[]; pg.on('pageerror',lambda e:e2.append(str(e)))
    ctx.add_init_script("if(!localStorage.getItem('chess-coach-ai:reviews:v1'))localStorage.setItem('chess-coach-ai:reviews:v1',%s)"%json.dumps(json.dumps(review)))
    pg.goto(B); pg.wait_for_timeout(1000)
    r=pg.locator('[data-testid=plan-mine]'); print('9 plan mine:', r.inner_text().replace('\n',' | ') if r.count() else 'none')
    # банк создаётся при открытии вкладки; откроем её и вернёмся на главную
    pg.goto(B+'#/tactics/mine'); pg.wait_for_timeout(700); print('10 deep link mine visible', pg.locator('[data-testid=mine-view]:visible').count(), pg.locator('[data-testid=mine-total]').inner_text())
    pg.goto(B+'#/'); pg.wait_for_timeout(800); r=pg.locator('[data-testid=plan-mine]'); print('11 plan mine:', r.inner_text().replace('\n',' | ') if r.count() else 'none')
    pg.click('[data-testid=plan-go-mine]'); pg.wait_for_timeout(600); print('12 hash', pg.evaluate('location.hash'), pg.locator('[data-testid=mine-view]:visible').count(), e2)
    b.close()
