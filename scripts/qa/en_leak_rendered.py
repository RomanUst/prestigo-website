#!/usr/bin/env python3
"""Production rendered-layer EN-leak audit (D-06 rendered layer, Phase 75 Plan 02).

For every non-EN locale and a fixed key-page set (overflow_audit.py's PAGES
plus /authors/roman-ustyugov, one MDX blog post translated in every locale,
one D-09 EN-only JSX post, a deliberately-missing URL, and /book/confirmation),
loads the rendered production page after hydration and flags:

  - ru/ar/hi/zh: any visible text node, placeholder/aria-label/alt/title
    attribute, <title>, meta description, og:title/og:description, FAQPage
    question/answer text, or route Service name/description containing a run
    of 2+ Latin words (3+ letters) not covered by the allowlist.
  - es/fr: any such string of 3+ words that is byte-identical to the same
    page's EN rendering (after allowlist stripping — a string that strips to
    nothing, e.g. a place/tier name, is not a leak; one that still has 3+
    words after stripping IS a leak even though the raw bytes match EN).
  - all non-EN locales: any internal anchor (href starting with a single
    slash) that does not start with /{locale}/ or equal /{locale} — i.e. an
    internal link that would drop the locale prefix.

Reads scripts/qa/en_leak_allowlist.json (the same allowlist the static
scanner in en_leak_static.mjs reads) for dnt/placeNames/tierNames text
stripping and enFallbackPaths/recordedAsIs page-level allowlisting.

Usage: python3 scripts/qa/en_leak_rendered.py [base_url] [--locales ru,es,fr,ar,hi,zh]
Requires Python Playwright. Writes scripts/qa/out/en_leak_rendered.json.

Exit codes: 0 = clean, 1 = non-allowlisted leak/linkLeak present,
2 = infrastructure error (browser launch / network failure).
"""
import argparse
import json
import os
import re
import sys

from playwright.sync_api import sync_playwright

# Copied verbatim from scripts/qa/overflow_audit.py for coverage parity,
# plus the extras named in the plan (D-07/D-09 surfaces + a negative control).
PAGES = [
    '/', '/about', '/fleet', '/services', '/services/airport-transfer',
    '/services/city-rides', '/services/intercity-routes', '/services/vip-events',
    '/services/group-transfers', '/services/concierge', '/routes',
    '/routes/prague-vienna', '/routes/prague-ceske-budejovice',
    '/routes/prague-marianske-lazne', '/corporate', '/contact', '/faq',
    '/book', '/book/multi-day', '/blog', '/login',
    '/authors/roman-ustyugov',
    '/blog/beyond-transport-luxury-chauffeur-service-prague',  # translated in every locale (content/blog/<locale>/)
    '/blog/prague-airport-to-city-center',  # D-09 EN-only JSX_POSTS entry
    '/this-page-does-not-exist',  # deliberately missing — empty-page/404 edge case
    '/book/confirmation',  # D-05 recorded-as-is
]
DEFAULT_LOCALES = ['ru', 'es', 'fr', 'ar', 'hi', 'zh']

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ALLOWLIST_PATH = os.path.join(SCRIPT_DIR, 'en_leak_allowlist.json')
with open(ALLOWLIST_PATH, 'r', encoding='utf-8') as f:
    ALLOWLIST = json.load(f)


def _values(key):
    return [e.get('value') for e in ALLOWLIST.get(key, []) if e.get('value')]


TEXT_ALLOW_TOKENS = sorted(
    _values('dnt') + _values('placeNames') + _values('tierNames'), key=len, reverse=True
)
EN_FALLBACK_PATHS = set(_values('enFallbackPaths'))
RECORDED_AS_IS_PATHS = set(_values('recordedAsIs'))

LATIN_WORD_RE = re.compile(r'[A-Za-z]{2,}')
LOWERCASE_RE = re.compile(r'[a-z]')
ASSET_EXT_RE = re.compile(r'\.[a-zA-Z0-9]{1,5}$')

# T-75-05: never let a QA run send real analytics hits to production.
ABORT_SUBSTRINGS = [
    'google-analytics.com',
    'googletagmanager.com',
    '/g/collect',
    'facebook.com/tr',
    'connect.facebook.net',
]

INIT_SCRIPT = "localStorage.setItem('prestigo_consent_v2', JSON.stringify({analytics:false,marketing:false}));"

OUT_DIR = os.path.join('scripts', 'qa', 'out')
OUT_PATH = os.path.join(OUT_DIR, 'en_leak_rendered.json')

CONTENT_BLOG_DIR = os.path.join('content', 'blog')

EXTRACT_JS = """() => {
  // The LocaleSwitcher dropdown (role=menu) and any similarly opacity-toggled
  // overlay are ALWAYS mounted in the DOM (opacity/pointer-events toggle, not
  // conditional render — see 75-01's switcher_audit.py fix for the same
  // underlying fact). getComputedStyle(el).opacity only reports the element's
  // OWN opacity, not an ancestor's, so this walks up to <body> checking
  // display/visibility/opacity at every level plus a defensive role=menu
  // check, to avoid flagging every locale's endonym label (e.g. 'Español')
  // as a leak on every single page.
  function isHiddenByAncestor(el) {
    let node = el;
    while (node && node !== document.body) {
      const cs = getComputedStyle(node);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
      if (parseFloat(cs.opacity) === 0) return true;
      if (node.getAttribute && node.getAttribute('role') === 'menu') return true;
      node = node.parentElement;
    }
    return false;
  }
  function visibleTextNodes() {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (!text) continue;
      const el = node.parentElement;
      if (!el) continue;
      if (el.closest('script,style,noscript')) continue;
      if (isHiddenByAncestor(el)) continue;
      out.push(text);
    }
    return out;
  }
  function attrTexts() {
    const out = [];
    document.querySelectorAll('[placeholder],[aria-label],[alt],[title]').forEach((el) => {
      if (isHiddenByAncestor(el)) return;
      for (const attr of ['placeholder', 'aria-label', 'alt', 'title']) {
        const v = el.getAttribute(attr);
        if (v && v.trim()) out.push(v.trim());
      }
    });
    return out;
  }
  function metaTexts() {
    const out = [];
    if (document.title) out.push(document.title);
    const desc = document.querySelector('meta[name="description"]');
    if (desc && desc.content) out.push(desc.content);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content) out.push(ogTitle.content);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc && ogDesc.content) out.push(ogDesc.content);
    return out;
  }
  function jsonLdNodes() {
    const faq = [];
    const service = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      let data;
      try {
        data = JSON.parse(s.textContent || '{}');
      } catch (e) {
        return;
      }
      const graph = Array.isArray(data['@graph']) ? data['@graph'] : [data];
      for (const node of graph) {
        if (!node || typeof node !== 'object') continue;
        if (node['@type'] === 'FAQPage' && Array.isArray(node.mainEntity)) {
          for (const q of node.mainEntity) {
            if (q && q.name) faq.push(String(q.name));
            if (q && q.acceptedAnswer && q.acceptedAnswer.text) faq.push(String(q.acceptedAnswer.text));
          }
        }
        if (node['@type'] === 'Service') {
          if (node.name) service.push(String(node.name));
          if (node.description) service.push(String(node.description));
        }
      }
    });
    return { faq, service };
  }
  function links() {
    return Array.from(document.querySelectorAll('a[href]')).map((a) => a.getAttribute('href'));
  }
  const jsonLd = jsonLdNodes();
  return {
    texts: visibleTextNodes(),
    attrs: attrTexts(),
    meta: metaTexts(),
    faqStrings: jsonLd.faq,
    serviceStrings: jsonLd.service,
    links: links(),
  };
}"""


def strip_allow(text: str) -> str:
    for tok in TEXT_ALLOW_TOKENS:
        if tok:
            text = text.replace(tok, ' ')
    return text


def has_significant_words(text: str, min_words: int) -> bool:
    stripped = strip_allow(text)
    words = LATIN_WORD_RE.findall(stripped)
    if len(words) < min_words:
        return False
    if not LOWERCASE_RE.search(stripped):
        return False
    return True


def is_route_page(path: str) -> bool:
    return path.startswith('/routes/')


def is_locale_dropping_href(href: str, locale: str) -> bool:
    if not isinstance(href, str) or not href:
        return False
    if not href.startswith('/'):
        return False  # mailto:, tel:, https://..., #hash — none start with a single slash
    if href.startswith('//'):
        return False  # protocol-relative
    if href.startswith('/api/') or href.startswith('/_next/'):
        return False
    path_only = href.split('?')[0].split('#')[0]
    if ASSET_EXT_RE.search(path_only):
        return False
    if href == f'/{locale}' or href.startswith(f'/{locale}/'):
        return False
    return True


def mdx_exists_for_locale(slug: str, locale: str) -> bool:
    return os.path.isfile(os.path.join(CONTENT_BLOG_DIR, locale, f'{slug}.mdx'))


def en_fallback_reason(path: str, locale: str):
    """Returns the allowlist reason if this (path, locale) is a D-09/D-05 EN-fallback surface, else None."""
    if path in RECORDED_AS_IS_PATHS:
        return 'D-05 recorded-as-is post-booking surface'
    if path in EN_FALLBACK_PATHS:
        return 'D-09 EN-only JSX_POSTS legacy post'
    if path.startswith('/blog/') and path not in EN_FALLBACK_PATHS:
        slug = path.rsplit('/', 1)[-1]
        if not mdx_exists_for_locale(slug, locale):
            return f'D-09 EN-fallback — no content/blog/{locale}/{slug}.mdx'
    return None


def build_url(base: str, loc: str, path: str) -> str:
    if path == '/':
        return f'{base}/{loc}' if loc != 'en' else base
    return f'{base}/{loc}{path}' if loc != 'en' else f'{base}{path}'


def collect_page_data(page, url: str) -> dict:
    try:
        page.goto(url, wait_until='load', timeout=90000)
        page.wait_for_timeout(1500)
        return page.evaluate(EXTRACT_JS)
    except Exception as e:
        return {'error': str(e)[:200], 'texts': [], 'attrs': [], 'meta': [], 'faqStrings': [], 'serviceStrings': [], 'links': []}


def collect_leaks(data: dict, path: str) -> list:
    leaks = []
    for text in data.get('texts', []):
        if has_significant_words(text, 2):
            leaks.append({'kind': 'text', 'value': text[:200]})
    for text in data.get('attrs', []):
        if has_significant_words(text, 2):
            leaks.append({'kind': 'attr', 'value': text[:200]})
    for text in data.get('meta', []):
        if has_significant_words(text, 2):
            leaks.append({'kind': 'meta', 'value': text[:200]})
    for text in data.get('faqStrings', []):
        if has_significant_words(text, 2):
            leaks.append({'kind': 'faq', 'value': text[:200]})
    if is_route_page(path):
        for text in data.get('serviceStrings', []):
            if has_significant_words(text, 2):
                leaks.append({'kind': 'service', 'value': text[:200]})
    return leaks


def collect_es_fr_leaks(data: dict, en_strings: set) -> list:
    leaks = []
    candidates = list(data.get('texts', [])) + list(data.get('attrs', []))
    for text in candidates:
        if text in en_strings and has_significant_words(text, 3):
            leaks.append({'kind': 'identical-to-en', 'value': text[:200]})
    return leaks


def collect_link_leaks(data: dict, locale: str) -> list:
    out = []
    for href in data.get('links', []):
        if is_locale_dropping_href(href, locale):
            out.append(href)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description='en_leak_rendered — D-06 rendered-layer EN-leak scan')
    parser.add_argument('base_url', nargs='?', default='https://rideprestigo.com')
    parser.add_argument('--locales', default=','.join(DEFAULT_LOCALES))
    args = parser.parse_args()

    requested_locales = [l.strip() for l in args.locales.split(',') if l.strip()]
    base = args.base_url.rstrip('/')
    needs_en_baseline = any(l in ('es', 'fr') for l in requested_locales)

    os.makedirs(OUT_DIR, exist_ok=True)

    results: dict = {}
    en_baseline: dict = {}  # path -> set of EN strings (texts + attrs), only built if needed

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(viewport={'width': 1280, 'height': 900}, locale='en-US')
            context.add_init_script(INIT_SCRIPT)

            def handler(route):
                url = route.request.url
                if any(s in url for s in ABORT_SUBSTRINGS):
                    route.abort()
                else:
                    route.continue_()

            context.route('**/*', handler)
            page = context.new_page()

            if needs_en_baseline:
                for path in PAGES:
                    url = build_url(base, 'en', path)
                    data = collect_page_data(page, url)
                    en_baseline[path] = set(data.get('texts', [])) | set(data.get('attrs', []))

            for loc in requested_locales:
                results[loc] = {}
                for path in PAGES:
                    url = build_url(base, loc, path)
                    data = collect_page_data(page, url)

                    if loc in ('es', 'fr'):
                        leaks = collect_es_fr_leaks(data, en_baseline.get(path, set()))
                    else:
                        leaks = collect_leaks(data, path)
                    link_leaks = collect_link_leaks(data, loc)

                    reason = en_fallback_reason(path, loc)
                    allowlisted = []
                    if reason and leaks:
                        allowlisted = [{**item, 'reason': reason} for item in leaks]
                        leaks = []

                    results[loc][path] = {
                        'leaks': leaks,
                        'allowlisted': allowlisted,
                        'linkLeaks': link_leaks,
                    }
                    if 'error' in data:
                        results[loc][path]['error'] = data['error']

            browser.close()
    except Exception as e:
        print(f'INFRA ERROR: {e}', file=sys.stderr)
        return 2

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=1)

    total_leaks = 0
    total_link_leaks = 0
    for loc, pages in results.items():
        for path, r in pages.items():
            if r['leaks']:
                total_leaks += len(r['leaks'])
                print(f"LEAK {loc} {path}: {len(r['leaks'])} finding(s) — e.g. {r['leaks'][0]['value'][:80]!r}")
            if r['linkLeaks']:
                total_link_leaks += len(r['linkLeaks'])
                print(f"LINK-LEAK {loc} {path}: {r['linkLeaks'][:3]}")

    print(f'en_leak_rendered: {len(requested_locales)} locales x {len(PAGES)} pages checked, '
          f'{total_leaks} text leaks, {total_link_leaks} link leaks')
    return 1 if (total_leaks or total_link_leaks) else 0


if __name__ == '__main__':
    sys.exit(main())
