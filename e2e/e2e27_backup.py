# Резервная копия: выгрузка → очистка → предпросмотр → объединение; поиск Ctrl+K
import json, time
from playwright.sync_api import sync_playwright
B='http://127.0.0.1:4173/chess-coach-ai/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    ctx=b.new_context(viewport={'width':1280,'height':1000},accept_downloads=True); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B); pg.wait_for_timeout(800)
    games=[{'key':f'k{i}','at':f'2026-10-0{i}T10:00:00Z','src':'bot','color':'w','result':'1-0','outcome':'win','opp':1200,'tc':'-','plies':20,'endgame':False} for i in (1,2,3)]
    pg.evaluate("g=>localStorage.setItem('chess-coach-ai:games:v1',JSON.stringify({v:1,games:g}))",games)
    pg.keyboard.press('Control+k'); pg.fill('[data-testid=cmdk-input]','экспорт'); pg.wait_for_timeout(200)
    print('1 palette backup:', pg.locator('[data-testid=cmdk-backup]').count()); pg.keyboard.press('Enter'); pg.wait_for_timeout(700)
    print('   hash', pg.evaluate('location.hash'), 'panel', pg.locator('[data-testid=backup-download]:visible').count())
    pg.reload(); pg.wait_for_timeout(800)
    with pg.expect_download() as dl: pg.click('[data-testid=backup-download]')
    path='/tmp/backup_test.json'; dl.value.save_as(path); data=json.load(open(path))
    print('2 file v', data['v'], 'games', len(data['games']), 'keys', sorted(k for k in data if k not in ('app','kind','v')))
    # другое «устройство»: пустое хранилище + одна своя партия
    pg.evaluate("localStorage.clear()"); pg.evaluate("g=>localStorage.setItem('chess-coach-ai:games:v1',JSON.stringify({v:1,games:[g]}))",{**games[0],'key':'own','at':'2026-10-09T10:00:00Z'}); pg.reload(); pg.wait_for_timeout(800)
    pg.set_input_files('[data-testid=backup-file]',path); pg.wait_for_timeout(400)
    print('3 preview:', pg.locator('[data-testid=backup-preview]').inner_text().replace('\n',' | ')[:230])
    pg.click('[data-testid=backup-cancel]'); print('4 cancelled, preview gone', pg.locator('[data-testid=backup-preview]').count()==0)
    pg.set_input_files('[data-testid=backup-file]',path); pg.wait_for_timeout(300); pg.click('[data-testid=backup-apply]'); pg.wait_for_timeout(1800)
    ks=sorted(g['key'] for g in json.loads(pg.evaluate("localStorage.getItem('chess-coach-ai:games:v1')"))['games'])
    print('5 merged games', ks)
    # не-резервный файл
    open('/tmp/bad.json','w').write('{"hello":1}'); pg.goto(B+'#/account'); pg.wait_for_timeout(600); pg.set_input_files('[data-testid=backup-file]','/tmp/bad.json'); pg.wait_for_timeout(300)
    print('6 bad file:', pg.locator('[data-testid=backup-msg]').inner_text())
    pg.screenshot(path='shot_backup.png')
    b.close()
print('errors', errs)
