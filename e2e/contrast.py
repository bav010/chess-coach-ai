import sys
from playwright.sync_api import sync_playwright
from seed import JS
B='http://127.0.0.1:4173/chess-coach-ai/'
PAGES=['#/','#/analysis','#/play','#/tactics','#/openings','#/stats','#/profile','#/account','#/settings','#/help']
SCAN="""()=>{
const parse=c=>{const m=c.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;const p=m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}};
const lum=({r,g,b})=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)};
const blend=(f,b)=>({r:f.r*f.a+b.r*(1-f.a),g:f.g*f.a+b.g*(1-f.a),b:f.b*f.a+b.b*(1-f.a),a:1});
const bgOf=el=>{let layers=[];for(let e=el;e;e=e.parentElement){const cs=getComputedStyle(e);const c=parse(cs.backgroundColor);if(cs.backgroundImage!=='none'&&!cs.backgroundImage.startsWith('linear-gradient(rgba(0, 0, 0, 0)'))return null;if(c&&c.a>0){layers.push(c);if(c.a>=1)break}}let base={r:255,g:255,b:255,a:1};if(!layers.length||layers[layers.length-1].a<1){const bc=parse(getComputedStyle(document.body).backgroundColor);if(bc&&bc.a>0)base=bc}for(let i=layers.length-1;i>=0;i--)base=blend(layers[i],base);return base};
const out=[];const seen=new Set();
for(const el of document.querySelectorAll('body *')){
 if(!el.offsetParent&&getComputedStyle(el).position!=='fixed')continue;
 const hasText=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>0);if(!hasText)continue;
 const cs=getComputedStyle(el);if(cs.visibility==='hidden'||parseFloat(cs.opacity)===0)continue;
 const r=el.getBoundingClientRect();if(r.width<2||r.height<2)continue;
 let fg=parse(cs.color);const bg=bgOf(el);if(!fg||!bg)continue;
 let op=1;for(let e=el;e;e=e.parentElement)op*=parseFloat(getComputedStyle(e).opacity);
 fg=blend({...fg,a:fg.a*op},bg);
 const L1=lum(fg),L2=lum(bg);const ratio=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
 const size=parseFloat(cs.fontSize),bold=parseInt(cs.fontWeight)>=700;const large=size>=24||(size>=18.66&&bold);
 const need=large?3:4.5;
 if(ratio<need){const k=el.tagName+'.'+el.className+'|'+el.textContent.trim().slice(0,30);if(seen.has(k))continue;seen.add(k);
  out.push({ratio:+ratio.toFixed(2),need,size,txt:el.textContent.trim().slice(0,40),cls:(el.className&&el.className.baseVal===undefined?el.className:'')+'',tag:el.tagName,disabled:!!(el.disabled||el.closest('button:disabled'))})}}
return out}"""
with sync_playwright() as p:
    b=p.chromium.launch()
    for theme in sys.argv[1:] or ['light']:
        ctx=b.new_context(viewport={'width':1280,'height':900}); ctx.add_init_script(JS); ctx.add_init_script("localStorage.setItem('chess-coach-ai:appearance:v1',JSON.stringify({theme:'%s'}))"%theme)
        pg=ctx.new_page()
        for h in PAGES:
            pg.goto(B+h); pg.wait_for_timeout(1000)
            tabs=[]
            if h=='#/stats': tabs=['stab-overview','stab-mistakes','stab-learning','stab-advice']
            if h=='#/analysis': tabs=['tab-analysis','tab-review','tab-position','tab-saved']
            runs=[None]+tabs if not tabs else tabs
            for t in runs:
                if t: pg.click(f'[data-testid={t}]'); pg.wait_for_timeout(300)
                res=[r for r in pg.evaluate(SCAN) if not r['disabled']]
                for r in res: print(theme,h,t or '',r['ratio'],'/',r['need'],r['tag'],r['cls'][:30],'|',r['txt'])
        ctx.close()
    b.close()
