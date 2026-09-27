#!/usr/bin/env python3
"""Catalog-layer EN-leak inventory (Phase 75 Plan 26, informational).

The rendered scanner (en_leak_rendered.py) only loads a fixed key-page list.
This tool walks the translation CATALOGS instead, so English left inside
translated content on pages outside that list (the other route pages,
privacy/terms, …) is inventoried too:

  - content/pages/<loc>/**/*.json
  - content/routes/<loc>/*.json
  - messages/<loc>.json

for the non-Latin locales ru/ar/hi/zh (es/fr can only be judged against the
rendered EN page, which the rendered scanner does). Every JSON string leaf is
cleaned — ICU argument placeholders ({name}), plural/select syntax (the
`{n, plural,` header and `one {`/`other {` selectors — branch text is kept),
`#` and rich-text tags (<b>, </link>) are removed — and then judged with the
SAME helpers and allowlist as the rendered scanner (structural strip,
boundary-aware properNouns/inlineTerms/dnt/place/tier tokens, 2+ Latin words
with a lowercase letter).

Usage:
  python3 scripts/qa/en_leak_catalog.py [--locales ru,ar,hi,zh]
                                        [--files content/pages/hi/book.json,...]
Writes scripts/qa/out/en_leak_catalog.json:
  { "<file>": { "locale", "page", "inRenderedPages", "count", "rows": [{key, value}] } }

Always exits 0 — this is an inventory, not a gate.
"""
import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import en_leak_rendered as scanner  # noqa: E402  (pure helpers + allowlist; Playwright is imported lazily)

DEFAULT_LOCALES = ['ru', 'ar', 'hi', 'zh']
OUT_PATH = os.path.join('scripts', 'qa', 'out', 'en_leak_catalog.json')

# Keys whose values are identifiers/URLs/asset refs, not language content.
NON_TEXT_KEYS = {'slug', 'href', 'url', 'src', 'image', 'img', 'icon', 'id', 'key', 'canonical', 'path', 'cover', 'coverImage', 'photo'}
IDENTIFIER_RE = re.compile(r'^[a-z0-9]+(?:[-_][a-z0-9]+)+$')

ICU_ARG_RE = re.compile(r'\{\s*[A-Za-z_][\w]*\s*(?:,\s*(?:number|date|time)[^{}]*)?\}')
ICU_COMPLEX_HEADER_RE = re.compile(r'\{\s*[A-Za-z_][\w]*\s*,\s*(?:plural|select|selectordinal)\s*,')
ICU_SELECTOR_RE = re.compile(r'(?:=\d+|[A-Za-z_][\w]*)\s*\{')
RICH_TAG_RE = re.compile(r'</?[A-Za-z][\w-]*\s*/?>')


def clean_icu(text: str) -> str:
    text = RICH_TAG_RE.sub(' ', text)
    text = ICU_ARG_RE.sub(' ', text)
    if ICU_COMPLEX_HEADER_RE.search(text):
        text = ICU_COMPLEX_HEADER_RE.sub(' ', text)
        text = ICU_SELECTOR_RE.sub(' ', text)
        text = text.replace('#', ' ')
    text = text.replace('{', ' ').replace('}', ' ')
    return text


def iter_leaves(node, prefix=''):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from iter_leaves(v, f'{prefix}.{k}' if prefix else str(k))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from iter_leaves(v, f'{prefix}[{i}]')
    elif isinstance(node, str):
        yield prefix, node


def leaf_key_name(key: str) -> str:
    last = key.rsplit('.', 1)[-1]
    return re.sub(r'\[\d+\]$', '', last)


def is_catalog_leak(key: str, value: str, locale: str) -> bool:
    if leaf_key_name(key) in NON_TEXT_KEYS:
        return False
    if IDENTIFIER_RE.match(value.strip()):
        return False
    return scanner.has_significant_words(clean_icu(value), 2, locale)


def page_for_file(rel: str, locale: str):
    """Maps a catalog file to the rendered page path it feeds (None for shared messages)."""
    if rel == f'messages/{locale}.json':
        return None
    routes_prefix = f'content/routes/{locale}/'
    if rel.startswith(routes_prefix):
        return '/routes/' + rel[len(routes_prefix):-len('.json')]
    pages_prefix = f'content/pages/{locale}/'
    if rel.startswith(pages_prefix):
        stem = rel[len(pages_prefix):-len('.json')]
        return '/' if stem == 'home' else '/' + stem
    return None


def catalog_files(locale: str) -> list:
    files = []
    pages_dir = os.path.join('content', 'pages', locale)
    for root, _dirs, names in os.walk(pages_dir):
        for n in sorted(names):
            if n.endswith('.json'):
                files.append(os.path.join(root, n).replace(os.sep, '/'))
    routes_dir = os.path.join('content', 'routes', locale)
    if os.path.isdir(routes_dir):
        files += [f'content/routes/{locale}/{n}' for n in sorted(os.listdir(routes_dir)) if n.endswith('.json')]
    msg = f'messages/{locale}.json'
    if os.path.isfile(msg):
        files.append(msg)
    return sorted(files)


def main() -> int:
    parser = argparse.ArgumentParser(description='en_leak_catalog — informational catalog-layer EN-leak inventory')
    parser.add_argument('--locales', default=','.join(DEFAULT_LOCALES))
    parser.add_argument('--files', default='', help='comma-separated repo-relative catalog files (default: all for the locales)')
    args = parser.parse_args()

    locales = [l.strip() for l in args.locales.split(',') if l.strip()]
    only_files = {f.strip() for f in args.files.split(',') if f.strip()}
    rendered_pages = set(scanner.PAGES)

    out = {}
    try:
        for loc in locales:
            for rel in catalog_files(loc):
                if only_files and rel not in only_files:
                    continue
                try:
                    with open(rel, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                except (OSError, ValueError) as e:
                    out[rel] = {'locale': loc, 'error': str(e)[:200], 'count': 0, 'rows': []}
                    continue
                rows = [{'key': k, 'value': v[:200]} for k, v in iter_leaves(data) if is_catalog_leak(k, v, loc)]
                page = page_for_file(rel, loc)
                out[rel] = {
                    'locale': loc,
                    'page': page if page is not None else '(shared messages)',
                    'inRenderedPages': page is None or page in rendered_pages,
                    'count': len(rows),
                    'rows': rows,
                }
        os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
        with open(OUT_PATH, 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
    except Exception as e:  # informational tool — never fail the caller
        print(f'en_leak_catalog: error {e}', file=sys.stderr)
        return 0

    total = 0
    for rel, r in out.items():
        if r['count']:
            total += r['count']
            flag = '' if r.get('inRenderedPages') else '  [not in rendered page list]'
            print(f"{r['count']:4d}  {rel}{flag}")
    print(f'en_leak_catalog: {len(out)} files, {total} catalog findings (informational) -> {OUT_PATH}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
