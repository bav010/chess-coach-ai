# «На время»: старт → решение по записанным ходам → конец по времени → рекорд → отмена без записи
import json
from playwright.sync_api import sync_playwright
B='http://127.0.0.1:4173/chess-coach-ai/'; errs=[]
PZ={p['id']:p for p in json.load(open('../out3/chess-coach-ai/src/data/puzzles.json'))}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    ctx=b.new_context(viewport={'width':1280,'height':1000}); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'#/tactics/sprint'); pg.wait_for_timeout(1500)
    print('1 idle', pg.locator('[data-testid=sprint-idle]:visible').count(), 'best', pg.locator('[data-testid=sprint-best]').inner_text())
    pg.click('[data-testid=sprint-level-1]'); pg.click('[data-testid=sprint-start]'); pg.wait_for_timeout(500)
    sq=lambda s: pg.locator(f'[data-testid=sprint-board] [data-square="{s}"]:visible')
    def solve():
        pid=pg.locator('[data-testid=sprint-board]').get_attribute('data-puzzle-id'); pz=PZ[pid]; line=pz['line']
        for i in range(0,len(line),2):
            pg.wait_for_function("()=>!document.querySelector('[data-testid=sprint-board] .board button[disabled]')",timeout=8000) if i else None
            m=line[i]; sq(m[:2]).click(); sq(m[2:4]).click()
            if len(m)==5: pg.click('.promo-picker button >> nth=0')
            pg.wait_for_timeout(900)
        return pid
    seen=[]
    for n in range(2):
        pg.wait_for_timeout(300); seen.append(solve()); pg.wait_for_timeout(900)
    print('2 score', pg.locator('[data-testid=sprint-score]').inner_text(), 'mistakes', pg.locator('[data-testid=sprint-mistakes]').inner_text(), 'ids differ', len(set(seen))==2, 'time', pg.locator('[data-testid=sprint-time]').inner_text())
    pg.screenshot(path='shot_sprint_run.png')
    # досрочное завершение кнопкой не пишет результат
    pg.click('[data-testid=sprint-stop]'); pg.wait_for_timeout(300)
    print('3 stop: done', pg.locator('[data-testid=sprint-done]:visible').count(), 'runs', pg.locator('[data-testid=sprint-runs]').inner_text(), 'record badge', pg.locator('[data-testid=sprint-record]').count())
    pg.click('[data-testid=sprint-back]')
    # переключение вкладки отменяет забег
    pg.click('[data-testid=sprint-start]'); pg.wait_for_timeout(400); pg.click('[data-testid=ptab-library]'); pg.wait_for_timeout(600); pg.click('[data-testid=ptab-sprint]'); pg.wait_for_timeout(400)
    print('4 after tab switch phase', pg.locator('[data-testid=sprint-view]').get_attribute('data-phase'), 'runs', pg.locator('[data-testid=sprint-runs]').inner_text())
    ctx.close()
    # конец по времени: быстрые часы
    ctx=b.new_context(viewport={'width':1280,'height':1000}); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'#/tactics/sprint'); pg.wait_for_timeout(1500)
    pg.click('[data-testid=sprint-start]'); pg.wait_for_timeout(500)
    sq=lambda s: pg.locator(f'[data-testid=sprint-board] [data-square="{s}"]:visible')
    pid=pg.locator('[data-testid=sprint-board]').get_attribute('data-puzzle-id'); line=PZ[pid]['line']
    for i in range(0,len(line),2):
        if i: pg.wait_for_function("()=>!document.querySelector('[data-testid=sprint-board] .board button[disabled]')",timeout=8000)
        m=line[i]; sq(m[:2]).click(); sq(m[2:4]).click(); pg.wait_for_timeout(900)
    pg.wait_for_timeout(700)
    # подменяем Date.now, чтобы время вышло
    pg.evaluate("()=>{const o=Date.now;Date.now=()=>o()+200000}"); pg.wait_for_timeout(700)
    print('5 time up: done', pg.locator('[data-testid=sprint-done]:visible').count(), '|', pg.locator('[data-testid=sprint-final]').inner_text(), '| record', pg.locator('[data-testid=sprint-record]').count())
    st=json.loads(pg.evaluate("localStorage.getItem('chess-coach-ai:sprint:v1')")); print('6 stored best', st['best'], 'runs', st['runs'], 'history', len(st['history']))
    pg.screenshot(path='shot_sprint_done.png')
    pg.evaluate("localStorage.setItem('chess-coach-ai:lang:v1','ru')"); pg.reload(); pg.wait_for_timeout(1500)
    pg.goto(B+'#/tactics/sprint'); pg.wait_for_timeout(800)
    print('7 ru:', pg.locator('[data-testid=ptab-sprint]').inner_text(), '|', pg.locator('[data-testid=sprint-idle] p').inner_text(), '| best', pg.locator('[data-testid=sprint-best]').inner_text())
    b.close()
print('errors', errs)
