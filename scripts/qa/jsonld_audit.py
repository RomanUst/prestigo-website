#!/usr/bin/env python3
"""JSON-LD regression audit (D-07/D-14, VER-01).

For each locale x sampled page, parses every <script type="application/
ld+json"> block in the server-rendered HTML and fails on: invalid JSON; a
missing top-level @context; a FAQPage Question.acceptedAnswer.text that is
not a plain string (Phase 73 CR-02 backstop — must never regress to a
ReactNode/object); or a Service node on a /routes/prague-* page whose
inLanguage does not match the locale's BCP-47 tag (zh -> zh-Hans).

English Service/BreadcrumbList `name` values on non-EN locales are recorded
(not failed) — Phase 74 D-09 by-design EN-fallback for untranslated
structured-data label fields.

Usage: python3 scripts/qa/jsonld_audit.py [base_url] [--locales en,ru,...]
Writes scripts/qa/out/jsonld_audit.json.
Exit codes: 0 = clean, 1 = findings present, 2 = infrastructure error.
"""
import argparse
import json
import os
import re
import ssl
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = None

# i18n/locales.ts routing order.
LOCS = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh']
# i18n/locales.ts BCP47_TAG — zh maps to zh-Hans, every other locale to itself.
BCP47_TAG = {'en': 'en', 'ru': 'ru', 'es': 'es', 'fr': 'fr', 'ar': 'ar', 'hi': 'hi', 'zh': 'zh-Hans'}

# Fixed order, per the plan's task description.
PAGES = ['/', '/routes/prague-vienna', '/faq', '/fleet', '/routes', '/services/airport-transfer', '/book']

OUT_DIR = os.path.join('scripts', 'qa', 'out')
OUT_PATH = os.path.join(OUT_DIR, 'jsonld_audit.json')

SCRIPT_RE = re.compile(
    r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)


def fetch(url: str, timeout: int = 20, retries: int = 1):
    last_err = None
    for _ in range(retries + 1):
        try:
            req = Request(url, headers={'User-Agent': 'PrestigoQA/1.0'})
            with urlopen(req, timeout=timeout, context=SSL_CONTEXT) as resp:
                return resp.status, resp.read()
        except HTTPError as e:
            return e.code, b''
        except URLError as e:
            last_err = e
    raise last_err


def build_url(base: str, loc: str, path: str) -> str:
    if loc == 'en':
        return base + path
    return base + '/' + loc + (path if path != '/' else '')


def walk_nodes(obj):
    """Yield every dict node reachable from a parsed JSON-LD document,
    including nested @graph arrays and Question.acceptedAnswer sub-objects."""
    if isinstance(obj, dict):
        yield obj
        for v in obj.values():
            yield from walk_nodes(v)
    elif isinstance(obj, list):
        for item in obj:
            yield from walk_nodes(item)


def audit_page(url: str, loc: str, path: str) -> dict:
    entry = {'findings': [], 'byDesignEnFallback': [], 'blockCount': 0}
    try:
        status, body = fetch(url)
    except Exception as e:
        entry['findings'].append(f'error: {str(e)[:200]}')
        return entry
    if status != 200:
        entry['findings'].append(f'status={status} (expected 200)')
        return entry

    html = body.decode('utf-8', errors='replace')
    blocks = SCRIPT_RE.findall(html)
    entry['blockCount'] = len(blocks)
    if not blocks:
        entry['findings'].append('no application/ld+json blocks found')
        return entry

    expected_tag = BCP47_TAG.get(loc, loc)
    is_route_page = path.startswith('/routes/prague-')

    for i, raw in enumerate(blocks):
        try:
            doc = json.loads(raw)
        except json.JSONDecodeError as e:
            entry['findings'].append(f'block {i}: invalid JSON ({str(e)[:120]})')
            continue

        if isinstance(doc, dict) and '@context' not in doc:
            entry['findings'].append(f'block {i}: missing top-level @context')

        for node in walk_nodes(doc):
            node_type = node.get('@type')
            types = node_type if isinstance(node_type, list) else [node_type]

            if 'FAQPage' in types or 'Question' in types:
                main_entity = node.get('mainEntity')
                questions = main_entity if isinstance(main_entity, list) else (
                    [node] if 'Question' in types else []
                )
                for q in questions:
                    if not isinstance(q, dict):
                        continue
                    answer = q.get('acceptedAnswer')
                    if isinstance(answer, dict):
                        text = answer.get('text')
                        if not isinstance(text, str):
                            entry['findings'].append(
                                f"block {i}: FAQPage acceptedAnswer.text is {type(text).__name__}, not a plain string"
                            )

            if 'Service' in types and is_route_page:
                in_language = node.get('inLanguage')
                if in_language != expected_tag:
                    entry['findings'].append(
                        f"block {i}: Service inLanguage={in_language!r} (expected {expected_tag!r} for locale {loc})"
                    )

            if types and ('Service' in types or 'BreadcrumbList' in types) and loc != 'en':
                name = node.get('name')
                if isinstance(name, str) and name and re.search(r'[A-Za-z]{3,}', name) and not re.search(r'[^\x00-\x7F]', name):
                    entry['byDesignEnFallback'].append({'type': types, 'name': name})

    return entry


def main() -> int:
    parser = argparse.ArgumentParser(description='jsonld_audit — VER-01/D-07/D-14 JSON-LD regression check')
    parser.add_argument('base_url', nargs='?', default='https://rideprestigo.com')
    parser.add_argument('--locales', default=','.join(LOCS))
    args = parser.parse_args()
    base = args.base_url.rstrip('/')
    requested_locales = [l.strip() for l in args.locales.split(',') if l.strip()]

    os.makedirs(OUT_DIR, exist_ok=True)

    results: dict = {}
    total_findings = 0

    try:
        for loc in requested_locales:
            results[loc] = {}
            for path in PAGES:
                url = build_url(base, loc, path)
                entry = audit_page(url, loc, path)
                results[loc][path] = entry
                total_findings += len(entry['findings'])
    except Exception as e:
        print(f'INFRA ERROR: {e}', file=sys.stderr)
        return 2

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=1)

    for loc, pages in results.items():
        for path, entry in pages.items():
            for finding in entry['findings']:
                print(f'FAIL {loc} {path}: {finding}')

    total_blocks = sum(entry['blockCount'] for pages in results.values() for entry in pages.values())
    print(f'jsonld_audit: {total_blocks} ld+json blocks checked across {len(requested_locales)} locales x {len(PAGES)} pages, {total_findings} findings')

    return 1 if total_findings else 0


if __name__ == '__main__':
    sys.exit(main())
