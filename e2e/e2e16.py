import json, time, base64, re, uuid
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4174/chess-coach-ai/'
CORS={'access-control-allow-origin':'http://127.0.0.1:4174','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','access-control-expose-headers':'*','content-type':'application/json'}
b64=lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
STATE={'users':{}, 'rows':{}, 'confirm':False, 'log':[]}
def jwt(uid): return f"{b64({'alg':'HS256'})}.{b64({'sub':uid,'role':'authenticated','exp':int(time.time())+3600})}.sig"
def user_obj(u): return {'id':u['id'],'aud':'authenticated','role':'authenticated','email':u['email'],'identities':[{'id':u['id']}],'app_metadata':{},'user_metadata':{},'created_at':'2026-10-18T00:00:00Z'}
def session(u): return {'access_token':jwt(u['id']),'token_type':'bearer','expires_in':3600,'expires_at':int(time.time())+3600,'refresh_token':'r'+u['id'],'user':user_obj(u)}
def uid_from(req):
    a=req.headers.get('authorization','')
    m=a.replace('Bearer ','').split('.')
    if len(m)<3: return None
    try: return json.loads(base64.urlsafe_b64decode(m[1]+'=='))['sub']
    except Exception: return None
def handle(route, req):
    u=urlparse(req.url); path=u.path; q=parse_qs(u.query); m=req.method
    if m=='OPTIONS': return route.fulfill(status=200, headers=CORS, body='')
    body={}
    try: body=json.loads(req.post_data or '{}')
    except Exception: pass
    STATE['log'].append(f"{m} {path}")
    def ok(o,s=200): route.fulfill(status=s, headers=CORS, body=json.dumps(o))
    def err(msg,s=400,code='invalid_credentials'): route.fulfill(status=s, headers=CORS, body=json.dumps({'code':s,'error_code':code,'msg':msg,'message':msg}))
    if path.endswith('/auth/v1/signup'):
        e=body['email'].lower()
        if e in STATE['users']: return ok({**user_obj(STATE['users'][e]),'identities':[]})
        us={'id':str(uuid.uuid4()),'email':e,'password':body['password']}; STATE['users'][e]=us
        return ok(user_obj(us)) if STATE['confirm'] else ok(session(us))
    if path.endswith('/auth/v1/token'):
        if q.get('grant_type')==['password']:
            us=STATE['users'].get(body['email'].lower())
            if not us or us['password']!=body['password']: return err('Invalid login credentials')
            return ok(session(us))
        us=next((x for x in STATE['users'].values() if 'r'+x['id']==body.get('refresh_token')),None)
        return ok(session(us)) if us else err('bad refresh')
    if path.endswith('/auth/v1/user'):
        us=next((x for x in STATE['users'].values() if x['id']==uid_from(req)),None)
        if not us: return err('no user',401,'bad_jwt')
        if m=='PUT': us['password']=body.get('password',us['password'])
        return ok(user_obj(us))
    if path.endswith('/auth/v1/health'):
        return ok({'status':'ok'}) if not STATE.get('down') else route.abort()
    if path.endswith('/auth/v1/logout'): return route.fulfill(status=204, headers=CORS, body='')
    if path.endswith('/auth/v1/recover'): STATE['recover']=body.get('email'); return ok({})
    if path.endswith('/rest/v1/user_data'):
        uid=uid_from(req)
        if not uid: return err('jwt',401,'bad_jwt')
        if m=='GET':
            row=STATE['rows'].get(uid)
            return ok([row] if row else [])
        if m=='POST':
            rows=body if isinstance(body,list) else [body]
            for r in rows:
                if r['user_id']!=uid: return err('rls',403,'42501')
                STATE['rows'][uid]=r
            return route.fulfill(status=201, headers=CORS, body='')
    if path.endswith('/rest/v1/rpc/delete_my_account'):
        uid=uid_from(req)
        STATE['users']={k:v for k,v in STATE['users'].items() if v['id']!=uid}; STATE['rows'].pop(uid,None)
        return route.fulfill(status=204, headers=CORS, body='')
    return route.fulfill(status=404, headers=CORS, body='{}')

G="chess-coach-ai:games:v1"
def games(n):
    return {"v":1,"games":[{"key":f"g{i}","at":f"2026-10-{1+i:02d}T10:00:00.000Z","src":"bot","color":"w","result":"1-0","outcome":"win","opp":1200,"tc":"-","plies":40,"endgame":False} for i in range(n)]}
def mkpage(b):
    ctx=b.new_context(viewport={'width':1360,'height':1500}); ctx.route('https://test.supabase.co/**',handle)
    pg=ctx.new_page(); pg.on('dialog',lambda d:d.accept()); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); return ctx,pg,errs
def ready(pg): pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
def cloud_tab(pg):
    if pg.locator('[data-testid=account-view]:visible').count()==0: pg.locator('[data-testid=account-btn]').click()
    pg.locator('[data-testid=acc-tab-cloud]').click()
def fill(pg,email,pw,pw2=None):
    pg.locator('[data-testid=cloud-email-input]').fill(email); pg.locator('[data-testid=cloud-pass-input]').fill(pw)
    if pw2 is not None: pg.locator('[data-testid=cloud-pass2-input]').fill(pw2)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    ctx,pg,errs=mkpage(b)
    pg.goto(URL); ready(pg)
    pg.evaluate("v=>localStorage.setItem('chess-coach-ai:games:v1',v)", json.dumps(games(3))); pg.reload(); ready(pg)
    cloud_tab(pg); print('login form', pg.locator('[data-testid=cloud-out]').count(), '| off panel', pg.locator('[data-testid=cloud-off]').count())
    pg.locator('[data-testid=cloud-mode-register]').click()
    fill(pg,'bad','123','123'); pg.locator('[data-testid=cloud-submit]').click(); print('bad email:', pg.locator('[data-testid=cloud-error]').inner_text())
    fill(pg,'ann@example.com','short','short'); pg.locator('[data-testid=cloud-submit]').click(); print('short pw:', pg.locator('[data-testid=cloud-error]').inner_text())
    fill(pg,'ann@example.com','password123','password999'); pg.locator('[data-testid=cloud-submit]').click(); print('mismatch:', pg.locator('.st-msg.bad').first.inner_text())
    # подтверждение почты включено
    STATE['confirm']=True
    fill(pg,'conf@example.com','password123','password123'); pg.locator('[data-testid=cloud-submit]').click(); time.sleep(.8); print('confirm info:', pg.locator('[data-testid=cloud-info]').inner_text()[:60])
    STATE['confirm']=False
    fill(pg,'ann@example.com','password123','password123'); pg.locator('[data-testid=cloud-submit]').click()
    pg.wait_for_selector('[data-testid=cloud-in]',timeout=15000); time.sleep(1.5)
    print('signed in as', pg.locator('[data-testid=cloud-email]').inner_text(), '| kind', pg.locator('[data-testid=account-kind]').inner_text(), '| avatar ring', 'cloud-on' in pg.locator('[data-testid=account-btn]').get_attribute('class'))
    row=next(iter(STATE['rows'].values())); print('cloud row games', len(row['data']['games']), 'profile', row['data']['profile']['name'])
    # повторная регистрация той же почты
    pg.locator('[data-testid=cloud-logout]').click(); pg.wait_for_selector('[data-testid=cloud-out]'); print('logout info:', pg.locator('[data-testid=cloud-info]').inner_text())
    print('local games kept', len(json.loads(pg.evaluate(f"localStorage.getItem('{G}')"))['games']))
    pg.locator('[data-testid=cloud-mode-register]').click(); fill(pg,'ann@example.com','password123','password123'); pg.locator('[data-testid=cloud-submit]').click(); time.sleep(.6); print('dup email:', pg.locator('[data-testid=cloud-error]').inner_text())
    pg.locator('[data-testid=cloud-mode-login]').click(); fill(pg,'ann@example.com','wrongpass1'); pg.locator('[data-testid=cloud-submit]').click(); time.sleep(.6); print('wrong pw:', pg.locator('[data-testid=cloud-error]').inner_text())
    pg.locator('[data-testid=cloud-forgot]').click(); time.sleep(.6); print('forgot:', pg.locator('[data-testid=cloud-info]').inner_text()[:50], '| recover for', STATE.get('recover'))
    fill(pg,'ann@example.com','password123'); pg.locator('[data-testid=cloud-submit]').click(); pg.wait_for_selector('[data-testid=cloud-in]',timeout=15000)
    # второе устройство: пустое хранилище, входит в тот же аккаунт
    ctx2,pg2,errs2=mkpage(b); pg2.goto(URL); ready(pg2)
    cloud_tab(pg2); fill(pg2,'ann@example.com','password123'); pg2.locator('[data-testid=cloud-submit]').click()
    time.sleep(4); ready(pg2)  # возможна перезагрузка после подтягивания данных
    print('device2 games in storage', len(json.loads(pg2.evaluate(f"localStorage.getItem('{G}')") or '{"games":[]}')['games']))
    pg2.locator('[data-testid=account-btn]').click(); pg2.locator('[data-testid=acc-tab-stats]').click(); print('device2 stats games', pg2.locator('[data-testid=kpi-games]').inner_text(), '| kind', pg2.locator('[data-testid=account-kind]').inner_text())
    # устройство 2 добавляет партию и отправляет; устройство 1 синхронизируется вручную и получает её
    g=json.loads(pg2.evaluate(f"localStorage.getItem('{G}')")); g['games'].append({**games(1)['games'][0],'key':'new-from-2','at':'2026-10-10T10:00:00.000Z'})
    pg2.evaluate("v=>localStorage.setItem('chess-coach-ai:games:v1',v)", json.dumps(g)); pg2.locator('[data-testid=acc-tab-cloud]').click(); pg2.locator('[data-testid=cloud-sync]').click(); time.sleep(5)
    print('pg2 msgs:', pg2.locator('[data-testid=cloud-info]').all_inner_texts(), pg2.locator('[data-testid=cloud-error]').all_inner_texts(), '| local after', len(json.loads(pg2.evaluate(f"localStorage.getItem('{G}')"))['games']), '| log tail', STATE['log'][-6:])
    print('cloud games now', len(next(iter(STATE['rows'].values()))['data']['games']))
    cloud_tab(pg); pg.locator('[data-testid=cloud-sync]').click(); time.sleep(3); ready(pg)
    print('device1 games after sync', len(json.loads(pg.evaluate(f"localStorage.getItem('{G}')"))['games']))
    # смена пароля и удаление
    pg.locator('[data-testid=account-btn]').click(); cloud_tab(pg)
    pg.locator('[data-testid=cloud-in] details.acc-details summary').first.click(); pg.locator('[data-testid=cloud-changepass]').fill('newpassword9'); pg.locator('[data-testid=cloud-changepass-save]').click(); time.sleep(.8)
    print('password now', STATE['users']['ann@example.com']['password'])
    pg.locator('[data-testid=cloud-in] details.acc-details.danger summary').click(); pg.locator('[data-testid=cloud-delete]').click(); time.sleep(1.2)
    print('after delete: users', list(STATE['users']), 'rows', len(STATE['rows']), '| form', pg.locator('[data-testid=cloud-out]').count(), '| local games kept', len(json.loads(pg.evaluate(f"localStorage.getItem('{G}')"))['games']))
    pg.screenshot(path='shot_cloud.png')
    print('errs', errs, errs2); print('requests', len(STATE['log']))
    b.close()
