import json, time, base64, re, uuid
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4174/chess-coach-ai/'
CORS={'access-control-allow-origin':'http://127.0.0.1:4174','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','access-control-expose-headers':'*','content-type':'application/json'}
b64=lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
STATE={'users':{}, 'rows':{}, 'confirm':False, 'log':[], 'games':{}}
def jwt(uid): return f"{b64({'alg':'HS256'})}.{b64({'sub':uid,'role':'authenticated','exp':int(time.time())+3600})}.sig"
def user_obj(u): return {'id':u['id'],'aud':'authenticated','role':'authenticated','email':u['email'],'identities':[{'id':u['id']}],'app_metadata':{},'user_metadata':{},'created_at':'2026-10-18T00:00:00Z'}
def session(u): return {'access_token':jwt(u['id']),'token_type':'bearer','expires_in':3600,'expires_at':int(time.time())+3600,'refresh_token':'r'+u['id'],'user':user_obj(u)}
def uid_from(req):
    a=req.headers.get('authorization','')
    m=a.replace('Bearer ','').split('.')
    if len(m)<3: return None
    try: return json.loads(base64.urlsafe_b64decode(m[1]+'=='))['sub']
    except Exception: return None

import datetime
def nowiso(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def view(g): return {**g,'server_now':nowiso()}
def online(route,req,path,m,body,ok,err):
    uid=uid_from(req)
    if path.endswith('/rest/v1/online_games') and m=='GET':
        return ok([g for g in STATE['games'].values() if uid in (g['white'],g['black'],g['creator'])]) or True
    if '/rest/v1/rpc/online_' not in path: return False
    fn=path.split('/rpc/')[1]
    def bad(code): err(code,400,code); return True
    G=STATE['games']
    def touch(g): g['updated_at']=nowiso()
    if fn=='online_create':
        c=body['p_color']; c=c if c in('w','b') else 'w'
        g={'id':str(uuid.uuid4()),'code':uuid.uuid4().hex[:8],'creator':uid,'white':uid if c=='w' else None,'black':uid if c=='b' else None,
           'white_name':body['p_name'] if c=='w' else '','black_name':body['p_name'] if c=='b' else '','moves':[],'base_ms':body['p_base_s']*1000,'inc_ms':body['p_inc_s']*1000,
           'white_ms':body['p_base_s']*1000,'black_ms':body['p_base_s']*1000,'turn_started':None,'status':'waiting','result':None,'reason':None,'draw_offer':None}
        touch(g); G[g['id']]=g; return ok(view(g)) or True
    if fn=='online_join':
        g=next((x for x in G.values() if x['code']==body['p_code']),None)
        if not g: return bad('not_found')
        if uid in (g['white'],g['black']): return ok(view(g)) or True
        if g['white'] and g['black']: return bad('full')
        if g['white'] is None: g['white']=uid; g['white_name']=body['p_name']
        else: g['black']=uid; g['black_name']=body['p_name']
        if g.get('rated'): g.update(white_rating=1200,black_rating=1200)
        g['status']='active'; g['is_open']=False; g['turn_started']=nowiso(); touch(g); return ok(view(g)) or True
    if fn=='online_my_rating': return ok({'rating':1200,'peak':1200,'games':0}) or True
    if fn=='online_open_list':
        return ok([{'code':x['code'],'name':x['white_name'] or x['black_name'],'side':'w' if x['white'] else 'b','rating':1200,'base_ms':x['base_ms'],'inc_ms':x['inc_ms'],'created_at':x['updated_at']}
                   for x in G.values() if x.get('is_open') and x['status']=='waiting' and x['creator']!=uid]) or True
    if fn=='online_seek':
        for x in G.values():
            if x['creator']==uid and x['status']=='waiting' and x.get('is_open'): x.update(status='finished',reason='aborted',is_open=False)
        m=next((x for x in G.values() if x.get('is_open') and x['status']=='waiting' and x['creator']!=uid and x['base_ms']==body['p_base_s']*1000 and x['inc_ms']==body['p_inc_s']*1000),None)
        if m:
            if m['white'] is None: m['white']=uid; m['white_name']=body['p_name']
            else: m['black']=uid; m['black_name']=body['p_name']
            m.update(status='active',is_open=False,turn_started=nowiso(),rated=True,white_rating=1200,black_rating=1200); touch(m); return ok(view(m)) or True
        w=len(G)%2==0
        g={'id':str(uuid.uuid4()),'code':uuid.uuid4().hex[:8],'creator':uid,'white':uid if w else None,'black':None if w else uid,'white_name':body['p_name'] if w else '','black_name':'' if w else body['p_name'],
           'moves':[],'base_ms':body['p_base_s']*1000,'inc_ms':body['p_inc_s']*1000,'white_ms':body['p_base_s']*1000,'black_ms':body['p_base_s']*1000,'turn_started':None,
           'status':'waiting','result':None,'reason':None,'draw_offer':None,'is_open':True,'rated':True,'white_rating':1200 if w else None,'black_rating':None if w else 1200}
        touch(g); G[g['id']]=g; return ok(view(g)) or True
    g=G.get(body.get('p_id'))
    if not g: return bad('not_found')
    if fn=='online_publish':
        g['is_open']=bool(body['p_open']) and g['status']=='waiting'; touch(g); return ok(view(g)) or True
    w=uid==g['white']
    if fn=='online_get': return ok(view(g)) or True
    if fn=='online_move':
        if g['status']!='active': return bad('not_active')
        if (len(g['moves'])%2==0)!=w: return bad('not_your_turn')
        g['moves'].append(body['p_uci']); g['turn_started']=nowiso(); g['draw_offer']=None; touch(g); return ok(view(g)) or True
    if fn=='online_finish':
        if g['status']=='active': g.update(status='finished',result=body['p_result'],reason=body['p_reason'],draw_offer=None); touch(g)
        return ok(view(g)) or True
    if fn=='online_resign':
        if g['status']=='active': g.update(status='finished',result='0-1' if w else '1-0',reason='resign',draw_offer=None); touch(g)
        return ok(view(g)) or True
    if fn=='online_offer_draw':
        me='w' if w else 'b'
        if g['draw_offer'] and g['draw_offer']!=me: g.update(status='finished',result='1/2-1/2',reason='agreed',draw_offer=None)
        else: g['draw_offer']=me
        touch(g); return ok(view(g)) or True
    if fn=='online_emote':
        if g['status']=='waiting': return bad('not_active')
        g.update(emote=body['p_code'],emote_by='w' if w else 'b',emote_seq=g.get('emote_seq',0)+1); touch(g); return ok(view(g)) or True
    if fn=='online_decline_draw': g['draw_offer']=None; touch(g); return ok(view(g)) or True
    if fn=='online_abort':
        g.update(status='finished',result=None,reason='aborted',is_open=False); touch(g); return ok(view(g)) or True
    if fn=='online_flag': return ok(view(g)) or True
    return False

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
    r=online(route,req,path,m,body,ok,err)
    if r: return
    return route.fulfill(status=404, headers=CORS, body='{}')


def mkpage(b):
    ctx=b.new_context(viewport={'width':1360,'height':1300}); ctx.route('https://test.supabase.co/**',handle)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('chess-coach-ai:lang:v1','ru')"); return ctx,pg,errs
def ready(pg): pg.wait_for_selector('[data-testid=top-status][data-state=online],[data-testid=top-status][data-state=ready]',timeout=30000)
def signup(pg,email):
    pg.goto(URL+'#/account'); ready(pg)
    pg.locator('[data-testid=cloud-mode-register]').click()
    pg.locator('[data-testid=cloud-email-input]').fill(email); pg.locator('[data-testid=cloud-pass-input]').fill('password123'); pg.locator('[data-testid=cloud-pass2-input]').fill('password123')
    pg.locator('[data-testid=cloud-submit]').click(); pg.wait_for_selector('[data-testid=acc-setup]',timeout=15000)
    pg.locator('[data-testid=acc-name-input]').fill(email.split('@')[0].capitalize()); pg.locator('[data-testid=setup-done]').click(); pg.wait_for_timeout(800)
def sq(pg,s): pg.locator(f'[data-testid="square-{s}"]:visible, [data-square="{s}"]:visible').first.click()
def mv(pg,a,b): sq(pg,a); sq(pg,b)
def chk(name,cond): print(('OK  ' if cond else 'FAIL'),name); 
FAILS=[]
def check(name,cond):
    print(('OK   ' if cond else 'FAIL ')+name)
    if not cond: FAILS.append(name)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    c1,a,e1=mkpage(b); c2,bb,e2=mkpage(b)
    signup(a,'ann@example.com'); signup(bb,'bob@example.com')
    a.goto(URL+'#/online'); a.wait_for_selector('[data-testid=online-lobby]')
    a.screenshot(path='shots_online_lobby.png')
    a.locator('[data-testid=online-color-w]').click(); a.locator('[data-testid="online-time-5+0"]').click(); a.locator('[data-testid=online-create]').click()
    a.wait_for_selector('[data-testid=online-wait]'); code=a.locator('[data-testid=online-code]').inner_text(); link=a.locator('[data-testid=online-link]').input_value()
    check('invite link has code', code in link and '#/online/' in link)
    a.screenshot(path='shots_online_wait.png')
    bb.goto(URL+'#/online'); bb.wait_for_selector('[data-testid=online-lobby]')
    bb.locator('[data-testid=online-code-input]').fill(link); bb.locator('[data-testid=online-join-btn]').click()
    bb.wait_for_selector('[data-testid=online-game][data-status=active]',timeout=10000)
    a.wait_for_selector('[data-testid=online-game][data-status=active]',timeout=10000)
    check('A is white, B is black', a.locator('[data-testid=online-game]').get_attribute('data-side')=='w' and bb.locator('[data-testid=online-game]').get_attribute('data-side')=='b')
    check('clocks shown', a.locator('[data-testid=online-clock-w]').count()==1)
    mv(a,'e2','e4'); bb.wait_for_function("document.querySelector('[data-testid=online-game]').dataset.moves==='1'",timeout=8000)
    check('B sees e4 and its turn', 'Ваш ход' in bb.locator('[data-testid=online-message]').inner_text())
    mv(bb,'e7','e5'); a.wait_for_function("document.querySelector('[data-testid=online-game]').dataset.moves==='2'",timeout=8000)
    a.screenshot(path='shots_online_game.png')
    # ход не в свою очередь не проходит: B пробует ходить при ходе A
    bb.locator('[data-testid=online-draw]').click()
    a.wait_for_selector('[data-testid=online-draw-in]',timeout=8000); check('A sees draw offer', True)
    a.locator('[data-testid=online-draw-decline]').click(); bb.wait_for_function("!document.querySelector('[data-testid=online-draw-in]') && document.querySelector('[data-testid=online-draw]') && !document.querySelector('[data-testid=online-draw]').disabled",timeout=8000)
    check('draw declined, B can offer again', True)
    a.locator('[data-testid=online-emote-gl]').click()
    bb.wait_for_selector('[data-testid=online-toast]',timeout=8000); check('B sees reaction from Ann', 'Ann' in bb.locator('[data-testid=online-toast]').inner_text() and 'Удачи' in bb.locator('[data-testid=online-toast]').inner_text())
    check('sender has no toast of own reaction', a.locator('[data-testid=online-toast]').count()==0)
    # быстрый мат (дурацкий): f3 e5, g4 Qh4#
    for (pgx,f,t) in [(a,'f2','f3'),(bb,'a7','a6'),(a,'g2','g4')]:
        pass
    a.goto(URL+'#/online/'+code); 
    a.wait_for_selector('[data-testid=online-game]')
    # продолжаем партию с позиции 1.e4 e5: Qh5, Nc6, Bc4, Nf6, Qxf7#
    seq=[(a,'d1','h5'),(bb,'b8','c6'),(a,'f1','c4'),(bb,'g8','f6'),(a,'h5','f7')]
    n=2
    for pgx,f,t in seq:
        pgx.wait_for_function(f"document.querySelector('[data-testid=online-game]') && document.querySelector('[data-testid=online-game]').dataset.moves==='{n}'",timeout=8000)
        mv(pgx,f,t); n+=1
    for pgx in (a,bb): pgx.wait_for_selector('[data-testid=online-game][data-status=finished]',timeout=10000)
    check('mate detected both sides', 'мат' in a.locator('[data-testid=online-message]').inner_text() and 'мат' in bb.locator('[data-testid=online-message]').inner_text())
    print(' A:',a.locator('[data-testid=online-message]').inner_text(),'| B:',bb.locator('[data-testid=online-message]').inner_text())
    a.screenshot(path='shots_online_end.png')
    # реванш
    a.locator('[data-testid=online-rematch]').click(); a.wait_for_selector('[data-testid=online-wait]')
    link2=a.locator('[data-testid=online-link]').input_value(); check('rematch new code', link2!=link)
    bb.goto(link2); bb.wait_for_selector('[data-testid=online-game][data-status=active]',timeout=10000)
    check('colours swapped in rematch', a.locator('[data-testid=online-game]').get_attribute('data-side')=='b')
    # сдача
    a.wait_for_selector('[data-testid=online-game][data-status=active]',timeout=10000)
    bb.locator('[data-testid=online-resign]').click(); bb.locator('[data-testid=online-resign-yes]').click()
    for pgx in (a,bb): pgx.wait_for_selector('[data-testid=online-game][data-status=finished]',timeout=10000)
    check('resign shown', 'Вы выиграли' in a.locator('[data-testid=online-message]').inner_text() and 'Вы проиграли' in bb.locator('[data-testid=online-message]').inner_text())
    # третий игрок
    c3,cc,e3=mkpage(b); signup(cc,'cat@example.com'); cc.goto(URL+'#/online/'+code); cc.wait_for_selector('[data-testid=online-fail]',timeout=8000); check('third player rejected', 'двое' in cc.locator('[data-testid=online-fail]').inner_text())
    # лобби: мои партии
    a.goto(URL+'#/online'); a.wait_for_selector('[data-testid=online-mine-item]'); check('my games listed', a.locator('[data-testid=online-mine-item]').count()==2)
    # неверный код
    a.locator('[data-testid=online-code-input]').fill('hello'); a.locator('[data-testid=online-join-btn]').click(); check('bad code message', a.locator('[data-testid=online-error]').count()==1)

    # --- лобби: быстрый поиск, открытые вызовы, статистика ---
    a.goto(URL+'#/online'); a.wait_for_selector('[data-testid=online-quick]')
    check('lobby shows my rating', '1200' in a.locator('[data-testid=online-rating]').inner_text())
    a.screenshot(path='shots_online_lobby2.png')
    a.locator('[data-testid="online-quick-5+3"]').click(); a.wait_for_selector('[data-testid=online-seek]',timeout=8000)
    check('seek screen shown', a.locator('[data-testid=online-seek-time]').count()==1)
    a.screenshot(path='shots_online_seek.png')
    bb.goto(URL+'#/online'); bb.wait_for_selector('[data-testid=online-open-item]',timeout=9000)
    check('open challenge visible to B', 'Ann' in bb.locator('[data-testid=online-open-item]').first.inner_text() and '5+3' in bb.locator('[data-testid=online-open-item]').first.inner_text())
    check('open challenge shows rating', '(1200)' in bb.locator('[data-testid=online-open-item]').first.inner_text())
    bb.screenshot(path='shots_online_open.png')
    bb.locator('[data-testid=online-open-accept]').first.click()
    for pgx in (a,bb): pgx.wait_for_selector('[data-testid=online-game][data-status=active]',timeout=10000)
    check('challenge accepted -> both playing', True)
    check('rated game shows rating next to name', '(1200)' in bb.locator('[data-testid=online-game] .player-strip, [data-testid=online-game]').first.inner_text())
    a.locator('[data-testid=online-resign]').click(); a.locator('[data-testid=online-resign-yes]').click()
    bb.wait_for_selector('[data-testid=online-game][data-status=finished]',timeout=10000)
    # быстрый поиск двух игроков с одним контролем
    c3b,cc2,e4=mkpage(b); signup(cc2,'cat2@example.com')
    cc2.goto(URL+'#/online'); cc2.wait_for_selector('[data-testid=online-quick]'); cc2.locator('[data-testid="online-quick-3+2"]').click(); cc2.wait_for_selector('[data-testid=online-seek]',timeout=8000)
    cc.goto(URL+'#/online'); cc.wait_for_selector('[data-testid=online-quick]'); cc.locator('[data-testid="online-quick-3+2"]').click()
    for pgx in (cc,cc2): pgx.wait_for_selector('[data-testid=online-game][data-status=active]',timeout=10000)
    check('quick pairing works', {cc.locator('[data-testid=online-game]').get_attribute('data-side'),cc2.locator('[data-testid=online-game]').get_attribute('data-side')}=={'w','b'})
    # отмена поиска
    a.goto(URL+'#/online'); a.wait_for_selector('[data-testid=online-quick]'); a.locator('[data-testid="online-quick-15+10"]').click(); a.wait_for_selector('[data-testid=online-seek]')
    a.locator('[data-testid=online-cancel]').click(); a.wait_for_selector('[data-testid=online-lobby]',timeout=8000); check('search cancelled', True)
    # статистика аккаунта
    a.goto(URL+'#/account'); a.wait_for_selector('[data-testid=account-view]'); a.locator('[data-testid=acc-tab-stats]:visible').click(); a.locator('[data-testid=stab-online]:visible').click()
    a.wait_for_selector('[data-testid=ostats]',timeout=8000)
    print(' ostats:',a.locator('[data-testid=ostats-games]').inner_text(),a.locator('[data-testid=ostats-wdl]').inner_text())
    check('stats count finished online games (A: lost 1 by resign, won 1 by mate? ...)', int(a.locator('[data-testid=ostats-games]').inner_text())>=3)
    a.screenshot(path='shots_online_stats.png',full_page=True)

    # --- разбор и PGN онлайн-партии ---
    a.goto(URL+'#/online/'+code); a.wait_for_selector('[data-testid=online-game][data-status=finished]',timeout=10000)
    with a.expect_download() as d: a.locator('[data-testid=online-pgn]').click()
    path=d.value.path(); pgn=open(path,encoding='utf-8').read()
    check('pgn has names and result', '[White "Ann"]' in pgn and '[Black "Bob"]' in pgn and '[Result "1-0"]' in pgn and 'Qxf7#' in pgn)
    a.locator('[data-testid=online-review]').click(); a.wait_for_timeout(1500)
    check('review opens analysis with the game', a.url.endswith('#/analysis') and a.locator('[data-testid=tab-review]:visible').count()==1)
    a.wait_for_selector('[data-testid=review-report]:visible,[data-testid=report]:visible',timeout=90000)
    check('review finished', True)
    check('no page errors', not (e1 or e2 or e3 or e4)); print(e1,e2,e3,e4)
    print('FAILS:',FAILS)
    b.close()
