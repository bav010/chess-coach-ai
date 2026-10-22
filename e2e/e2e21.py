from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:4173/chess-coach-ai/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    pg=b.new_page(viewport={'width':1360,'height':1000}); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.evaluate("localStorage.setItem('chess-coach-ai:appearance:v1', JSON.stringify({theme:'light'}))"); pg.reload()
    for r in ['play','analysis','tactics','openings']:
        pg.goto(URL+'#/'+r); pg.wait_for_timeout(1800); pg.screenshot(path=f'shot_light_{r}.png')
    print(errs)
