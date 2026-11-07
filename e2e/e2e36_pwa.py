import json, os, shutil, subprocess, time
from playwright.sync_api import sync_playwright
SRC='/tmp/claude-0/-home-claude/760528a8-3f06-50ab-9015-c4d3390fc528/scratchpad/out3/chess-coach-ai/dist'
ROOT='/tmp/s3'; shutil.rmtree(ROOT,ignore_errors=True); os.makedirs(ROOT); shutil.copytree(SRC,ROOT+'/chess-coach-ai')
srv=subprocess.Popen(['python3','-m','http.server','4175','--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
URL='http://127.0.0.1:4175/chess-coach-ai/'
F=[]
def check(n,c):
    print(('OK   ' if c else 'FAIL ')+n)
    if not c: F.append(n)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium'); ctx=b.new_context(viewport={'width':1360,'height':1100}); errs=[]
    ctx.add_init_script("localStorage.setItem('chess-coach-ai:lang:v1','ru')")
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('[data-testid=home-view]',timeout=20000)
    # --- установка воркера и кэша ---
    pg.wait_for_function("navigator.serviceWorker.getRegistration().then(r=>!!(r&&r.active))",timeout=20000)
    pg.wait_for_function("caches.keys().then(k=>k.some(x=>x.startsWith('chess-coach-')))",timeout=20000)
    n=pg.evaluate("caches.keys().then(async ks=>{const k=ks.find(x=>x.startsWith('chess-coach-')&&!x.includes('fonts'));return (await (await caches.open(k)).keys()).length})")
    print(' cached files',n); check('app shell + engine cached', n>=10)
    man=pg.evaluate("fetch(document.querySelector('link[rel=manifest]').href).then(r=>r.json())")
    check('manifest reachable via link', man['short_name']=='Chess Coach' and man['display']=='standalone')
    check('icon reachable', pg.evaluate("fetch('icons/icon-192.png').then(r=>r.ok)"))
    # --- установка (синтетическое событие браузера) ---
    check('no install card before the browser offers it', pg.locator('[data-testid=home-install]').count()==0)
    pg.evaluate("""()=>{const e=new Event('beforeinstallprompt');e.prompt=()=>{window.__prompted=true;return Promise.resolve()};e.userChoice=Promise.resolve({outcome:'accepted'});window.dispatchEvent(e)}""")
    pg.wait_for_selector('[data-testid=home-install]',timeout=5000)
    pg.screenshot(path='shots_pwa_install.png')
    pg.locator('[data-testid=home-install-btn]').click(); pg.wait_for_timeout(300)
    check('install prompt called', pg.evaluate("window.__prompted===true"))
    check('install card gone after accept', pg.locator('[data-testid=home-install]').count()==0)
    # --- без сети: перезагрузка, навигация, бот ---
    pg.reload(); pg.wait_for_function("!!navigator.serviceWorker.controller",timeout=10000)
    ctx.set_offline(True)
    pg.reload(); pg.wait_for_selector('[data-testid=home-view]',timeout=20000)
    check('app loads offline', True)
    pg.wait_for_selector('[data-testid=pwa-offline]',timeout=5000); check('offline notice shown', True)
    pg.screenshot(path='shots_pwa_offline.png')
    pg.goto(URL+'#/endgames/philidor1'); pg.wait_for_selector('[data-testid=eg-trainer]',timeout=15000)
    B='[data-testid=eg-trainer] '
    pg.locator(B+'[data-square=b6]').click(); pg.locator(B+'[data-square=b1]').click()
    try:
        pg.wait_for_function("()=>{const s=document.querySelector('[data-testid=eg-status]');return s&&s.textContent.includes('Ваш ход')&&document.querySelectorAll('[data-testid=eg-moves] span').length>=2}",timeout=30000); bot=True
    except Exception: bot=False
    check('engine answers offline (worker + wasm from cache)', bot)
    check('wasm served from cache offline', pg.evaluate("fetch('engine/stockfish-19-lite-single.wasm').then(r=>r.ok)"))
    check('online-only API is not intercepted (fails fast, no hang)', pg.evaluate("fetch('https://example.invalid/x',{mode:'no-cors'}).then(()=>false).catch(()=>true)"))
    ctx.set_offline(False); pg.wait_for_selector('[data-testid=pwa-offline]',state='detached',timeout=5000); check('offline notice disappears online', True)
    # --- обновление: подменяем версию воркера на «сервере» ---
    sw=open(ROOT+'/chess-coach-ai/sw.js').read(); import re
    open(ROOT+'/chess-coach-ai/sw.js','w').write(re.sub(r'const VERSION = "[^"]+"','const VERSION = "newversion1"',sw))
    pg.goto(URL); pg.wait_for_selector('[data-testid=home-view]')
    pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>r.update())")
    pg.wait_for_selector('[data-testid=pwa-update]',timeout=20000); check('update banner appears', True)
    pg.screenshot(path='shots_pwa_update.png')
    pg.evaluate("window.__marker=1")
    pg.locator('[data-testid=pwa-update]').click(); pg.wait_for_function("window.__marker===undefined",timeout=15000); pg.wait_for_selector('[data-testid=home-view]')
    check('page reloaded on the new version', pg.locator('[data-testid=pwa-update]').count()==0)
    keys=pg.evaluate("caches.keys()"); check('old cache removed', any('newversion1' in k for k in keys) and sum(1 for k in keys if k.startswith('chess-coach-') and 'fonts' not in k)==1)
    check('no page errors', not errs); print(errs,'FAILS',F); b.close()
finally:
    srv.terminate()
