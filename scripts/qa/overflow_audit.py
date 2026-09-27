import argparse, json
from playwright.sync_api import sync_playwright
"""Text-overflow audit: every locale x key page at one viewport width.
Usage: python3 scripts/qa/overflow_audit.py [base_url] [width] [--pages /a,/b] [--locales en,ru]
Requires Python Playwright. Writes overflow_<width>.json to the cwd.
--pages/--locales are optional comma-list filters restricting the default
sweep to a subset; omitted = full 7-locale x 21-page sweep (unchanged)."""
PAGES=['/','/about','/fleet','/services','/services/airport-transfer','/services/city-rides','/services/intercity-routes','/services/vip-events','/services/group-transfers','/services/concierge','/routes','/routes/prague-vienna','/routes/prague-ceske-budejovice','/routes/prague-marianske-lazne','/corporate','/contact','/faq','/book','/book/multi-day','/blog','/login']
LOCS=['en','ru','es','fr','ar','hi','zh']

parser=argparse.ArgumentParser(add_help=True)
parser.add_argument('base_url', nargs='?', default='https://rideprestigo.com')
parser.add_argument('width', nargs='?', type=int, default=375)
parser.add_argument('--pages', default=None, help='comma-separated list of paths to restrict the sweep to (default: all)')
parser.add_argument('--locales', default=None, help='comma-separated list of locales to restrict the sweep to (default: all)')
args=parser.parse_args()
B=args.base_url
W=args.width
if args.pages:
    PAGES=[(p if p.startswith('/') else '/'+p) for p in (s.strip() for s in args.pages.split(',')) if p]
if args.locales:
    LOCS=[l.strip() for l in args.locales.split(',') if l.strip()]
JS="""(vw)=>{
 const out=[];
 const all=document.querySelectorAll('h1,h2,h3,h4,p,a,span,button,li,label,div');
 for(const el of all){
   if(el.closest('[role=dialog]')) continue;
   const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden'||cs.position==='fixed') continue;
   const hasText=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>1);
   if(!hasText) continue;
   const r=el.getBoundingClientRect(); if(r.width===0||r.height===0) continue;
   // text wider than its own box, or box past viewport edge
   const over = el.scrollWidth>el.clientWidth+2 && cs.overflowX!=='auto' && cs.overflowX!=='scroll';
   const past = r.right>vw+2 || r.left<-2;
   if(over||past){ out.push({tag:el.tagName.toLowerCase(), txt:el.textContent.trim().slice(0,50), right:Math.round(r.right), sw:el.scrollWidth, cw:el.clientWidth, fs:cs.fontSize, ls:cs.letterSpacing}); }
 }
 return {docW:document.documentElement.scrollWidth, items:out.slice(0,12)};
}"""
res={}
with sync_playwright() as p:
    br=p.chromium.launch()
    c=br.new_context(viewport={'width':W,'height':812}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='en-US')
    c.add_init_script("localStorage.setItem('prestigo_consent_v2', JSON.stringify({analytics:false,marketing:false}))")
    pg=c.new_page()
    for loc in LOCS:
        for path in PAGES:
            url=B+('' if loc=='en' else '/'+loc)+(path if path!='/' or loc=='en' else '')
            try:
                pg.goto(url, wait_until='load', timeout=240000); pg.wait_for_timeout(1200)
                r=pg.evaluate(JS, W)
            except Exception as e:
                r={'error':str(e)[:100]}
            if r.get('error') or r['items'] or r['docW']>W:
                res[url]=r
    br.close()
json.dump(res,open(f'overflow_{W}.json','w'),ensure_ascii=False,indent=1)
for u,r in res.items():
    if 'error' in r: print('ERR',u,r['error']); continue
    print(u,'docW',r['docW'])
    for it in r['items'][:6]: print('   ',it['tag'],repr(it['txt']),'right',it['right'],'sw/cw',it['sw'],it['cw'],it['fs'],it['ls'])
print('pages with issues:',len(res))
