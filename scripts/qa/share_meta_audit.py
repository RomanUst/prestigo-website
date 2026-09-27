#!/usr/bin/env python3
"""Raw-HTML share-metadata audit (Phase 75, Plan 32 — WR-01/WR-02/IN-05).

The curl-level proof the verifier used: for every locale x sample page this
fetches the RAW server HTML (plain HTTP GET, no JavaScript, no subresources,
redirects NOT followed) and checks the <title> / <meta> tags a crawler or a
link-preview bot (X, Facebook, Slack, WhatsApp) actually sees:

  - 'status'          NOT_FOUND_PATHS must answer 404, every other page 200
                      (any 3xx is a finding, never silently followed).
  - 'twitter-mirror'  every twitter:title must equal og:title and every
                      twitter:description must equal og:description; a
                      missing og:title or twitter:title is also a finding.
  - 'en-site-default' non-EN only: title, description, og:title,
                      og:description, og:image:alt, twitter:title or
                      twitter:description equal to the legacy EN site default
                      (EN_SITE_DEFAULT_TITLE / EN_SITE_DEFAULT_DESCRIPTION), or
                      — on a 404 path — equal to the EN NotFound.metaTitle.
  - 'notfound-title'  NOT_FOUND_PATHS: every <title> must equal the locale's
                      messages/<locale>.json NotFound.metaTitle (catches the
                      brand-doubled 'Page Not Found — PRESTIGO | PRESTIGO').

The raw HTML of a notFound() response is Next's error shell (no lang/dir), so
this script never checks lang/dir — the hydrated lang/dir/h1 of 404 pages is
notfound_audit.py's job. The two EN constants are a fixed legacy fingerprint
copied from the pre-75-31 siteMetadata, deliberately independent of the
catalogs (if a catalog ever regressed to them the audit still fires).

Usage: python3 scripts/qa/share_meta_audit.py [base_url] [--locales en,ru,...]
                                              [--pages /fleet,/login]
Stdlib only (certifi optional for TLS). Writes scripts/qa/out/share_meta_audit.json.

Exit codes: 0 = clean, 1 = findings present, 2 = infrastructure error
(network failure / unknown locale).
"""
import argparse
import json
import os
import sys
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.request import Request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from notfound_audit import _opener  # noqa: E402  (no-redirect opener + optional certifi SSL context)

LOCS = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh']

# All answered 200 or 404 (no 3xx) on production for all 7 locales on
# 2026-09-27 — confirmed before freezing this list (Plan 75-32 Task 3).
# Includes pages outside en_leak_rendered's PAGES (/data-deletion) and both
# 404 classes: the catch-all miss and the dynamic-segment blog miss (WR-01).
PAGES = [
    '/',
    '/fleet',
    '/login',
    '/blog',
    '/blog/beyond-transport-luxury-chauffeur-service-prague',
    '/authors/roman-ustyugov',
    '/routes/prague-vienna',
    '/services/airport-transfer',
    '/data-deletion',
    '/book/confirmation',
    '/this-page-does-not-exist',
    '/blog/this-post-does-not-exist',
]
NOT_FOUND_PATHS = ['/this-page-does-not-exist', '/blog/this-post-does-not-exist']

# Legacy EN site default (components/SiteChrome.tsx siteMetadata before 75-31).
EN_SITE_DEFAULT_TITLE = 'PRESTIGO — Premium Chauffeur Service Prague'
EN_SITE_DEFAULT_DESCRIPTION = (
    'Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. '
    'Fixed prices, flight tracking, meet & greet.'
)

# Keys (lowercased meta name/property; 'title' = the <title> elements) checked for the EN default.
EN_DEFAULT_KEYS = ('title', 'description', 'og:title', 'og:description', 'og:image:alt',
                   'twitter:title', 'twitter:description')

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_DIR = os.path.join('scripts', 'qa', 'out')
OUT_PATH = os.path.join(OUT_DIR, 'share_meta_audit.json')


def expected_404_title(loc: str):
    """messages/<loc>.json NotFound.metaTitle."""
    with open(os.path.join(REPO_ROOT, 'messages', f'{loc}.json'), encoding='utf-8') as f:
        return json.load(f).get('NotFound', {}).get('metaTitle')


class _HeadMetaParser(HTMLParser):
    """Collects <title> text and <meta name|property content> pairs.

    Content inside script/style/template/svg/math is ignored (a '<title>' in a
    JS string or an SVG icon title is not document metadata).
    """

    SKIP = {'script', 'style', 'template', 'svg', 'math', 'noscript'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.titles = []
        self.meta = {}
        self._skip_depth = 0
        self._in_title = False
        self._buf = []

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if tag == 'title':
            self._in_title = True
            self._buf = []
        elif tag == 'meta':
            self._meta(attrs)

    def handle_startendtag(self, tag, attrs):
        if tag == 'meta' and not self._skip_depth:
            self._meta(attrs)
        # a self-closing <svg/> etc. opens nothing

    def handle_endtag(self, tag):
        if tag in self.SKIP:
            if self._skip_depth:
                self._skip_depth -= 1
            return
        if tag == 'title' and self._in_title and not self._skip_depth:
            self.titles.append(''.join(self._buf).strip())
            self._in_title = False

    def handle_data(self, data):
        if self._in_title and not self._skip_depth:
            self._buf.append(data)

    def _meta(self, attrs):
        a = {k.lower(): (v or '') for k, v in attrs}
        key = a.get('name') or a.get('property')
        if not key or 'content' not in a:
            return
        self.meta.setdefault(key.strip().lower(), []).append(a['content'])


def parse_head_meta(html: str) -> dict:
    """Returns {'titles': [..all <title> texts..], 'meta': {name/property (lowercased): [content, ...]}}."""
    p = _HeadMetaParser()
    p.feed(html or '')
    p.close()
    return {'titles': p.titles, 'meta': p.meta}


def check_page(parsed: dict, locale: str, path: str, status, expected_404_title_value, en_404_title=None) -> list:
    """All findings for one (locale, path) raw-HTML response. See module docstring for the kinds."""
    findings = []
    meta = parsed.get('meta', {})
    titles = parsed.get('titles', [])
    is_404_path = path in NOT_FOUND_PATHS

    expected_status = 404 if is_404_path else 200
    if status != expected_status:
        findings.append({'kind': 'status', 'value': f'{status} (expected {expected_status})'})

    og_t, tw_t = meta.get('og:title', []), meta.get('twitter:title', [])
    og_d, tw_d = meta.get('og:description', []), meta.get('twitter:description', [])
    if not og_t:
        findings.append({'kind': 'twitter-mirror', 'value': 'og:title missing'})
    if not tw_t:
        findings.append({'kind': 'twitter-mirror', 'value': 'twitter:title missing'})
    for v in tw_t:
        if og_t and v not in og_t:
            findings.append({'kind': 'twitter-mirror', 'key': 'twitter:title', 'value': v[:200],
                             'og': og_t[0][:200]})
    for v in tw_d:
        if v not in og_d:
            findings.append({'kind': 'twitter-mirror', 'key': 'twitter:description', 'value': v[:200],
                             'og': og_d[0][:200] if og_d else None})

    if locale != 'en':
        if en_404_title is None:
            en_404_title = expected_404_title('en')
        banned = {EN_SITE_DEFAULT_TITLE, EN_SITE_DEFAULT_DESCRIPTION}
        if is_404_path and en_404_title:
            banned.add(en_404_title)
        for key in EN_DEFAULT_KEYS:
            values = titles if key == 'title' else meta.get(key, [])
            for v in values:
                if v in banned:
                    findings.append({'kind': 'en-site-default', 'key': key, 'value': v[:200]})

    if is_404_path:
        if not titles:
            findings.append({'kind': 'notfound-title', 'value': '<title> missing',
                             'expected': expected_404_title_value})
        for t in titles:
            if not expected_404_title_value or t != expected_404_title_value:
                findings.append({'kind': 'notfound-title', 'value': t[:200], 'expected': expected_404_title_value})
    return findings


def build_url(base: str, loc: str, path: str) -> str:
    if loc == 'en':
        return base + path
    return base + '/' + loc + (path if path != '/' else '')


def fetch_raw(url: str, timeout: int = 90, retries: int = 1):
    """(status, html) via a plain GET; redirects are NOT followed (a 3xx comes back as its status)."""
    opener = _opener()
    last_err = None
    for _ in range(retries + 1):
        try:
            req = Request(url, headers={'User-Agent': 'PrestigoQA/1.0'})
            with opener.open(req, timeout=timeout) as resp:
                return resp.status, resp.read().decode('utf-8', errors='replace')
        except HTTPError as e:
            try:
                body = e.read().decode('utf-8', errors='replace')
            except Exception:
                body = ''
            return e.code, body
        except URLError as e:
            last_err = e
    raise last_err


def parse_list(arg, default):
    if not arg:
        return list(default)
    items = [x.strip() for x in arg.split(',') if x.strip()]
    return items or list(default)


def main() -> int:
    parser = argparse.ArgumentParser(description='share_meta_audit — raw-HTML title/og/twitter/404 metadata audit')
    parser.add_argument('base_url', nargs='?', default='https://rideprestigo.com')
    parser.add_argument('--locales', default=','.join(LOCS))
    parser.add_argument('--pages', default='', help='comma-separated paths (default: the full PAGES list)')
    args = parser.parse_args()

    locales = parse_list(args.locales, LOCS)
    unknown = [l for l in locales if l not in LOCS]
    if unknown:
        print(f'unknown locale(s): {unknown}', file=sys.stderr)
        return 2
    pages = parse_list(args.pages, PAGES)
    base = args.base_url.rstrip('/')
    os.makedirs(OUT_DIR, exist_ok=True)

    en_404 = expected_404_title('en')
    results: dict = {}
    counts: dict = {}
    total = 0
    try:
        for loc in locales:
            exp_404 = expected_404_title(loc)
            results[loc] = {}
            counts[loc] = {}
            for path in pages:
                url = build_url(base, loc, path)
                status, html = fetch_raw(url)
                parsed = parse_head_meta(html)
                findings = check_page(parsed, loc, path, status, exp_404, en_404_title=en_404)
                meta = parsed['meta']
                results[loc][path] = {
                    'url': url,
                    'status': status,
                    'titles': parsed['titles'],
                    'meta': {k: meta.get(k, []) for k in EN_DEFAULT_KEYS if k != 'title'},
                    'findings': findings,
                }
                for f_ in findings:
                    counts[loc][f_['kind']] = counts[loc].get(f_['kind'], 0) + 1
                total += len(findings)
    except (URLError, OSError) as e:
        print(f'infrastructure error: {e}', file=sys.stderr)
        return 2

    report = {'base_url': base, 'counts': counts, 'results': results}
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=1)

    for loc, by_path in results.items():
        for path, r in by_path.items():
            if r['findings']:
                ks = sorted({x['kind'] for x in r['findings']})
                print(f"FINDING {loc} {path}: {len(r['findings'])} ({', '.join(ks)})")
    print(f'share_meta_audit: {len(locales)} locales x {len(pages)} pages checked, {total} findings')
    print(f'wrote {OUT_PATH}')
    return 1 if total else 0


if __name__ == '__main__':
    sys.exit(main())
