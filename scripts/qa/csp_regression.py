#!/usr/bin/env python3
"""CSP regression snapshot/diff (VER-01, D-13, RESEARCH Pitfall 8).

Captures the Content-Security-Policy / Content-Security-Policy-Report-Only
header for a fixed set of route classes and either writes a golden baseline
(--capture) or diffs the current headers against it (--compare, default).
Redirects are NOT followed, so the FIRST response's headers are captured —
this is deliberate: middleware.ts sets the CSP header on every response
(including redirects), and a route class like /ru/account (redirects
unauthenticated) is exactly the case the baseline needs to see.

Every nonce token ('nonce-<value>') is normalized to a fixed placeholder so
the baseline is stable across requests (middleware.ts mints a fresh nonce
per request for /admin and /driver).

This script intentionally never widens the CSP to make a diff pass — a
detected drift is a regression to investigate, never something to "fix" by
loosening the policy (RESEARCH Pitfall 8 / plan prohibition).

--expect-added TOKEN [TOKEN ...] (compare mode only) verifies an intentional,
enumerated CSP addition (Phase 77-12: the chat origin tokens). It never
accepts any other drift. For every route class the drift passes only if
(a) the current CSP with every listed token removed (each occurrence, plus
its single leading space, at a token boundary) equals the baseline CSP
exactly, and (b) at least one listed token is present on every route class
whose baseline used the static policy (non-empty, no nonce). The
Report-Only header must still match the baseline exactly. The per-route
unified diff is printed for review. After it passes, re-capture the golden
with --capture so plain --compare is clean again.

Usage:
  python3 scripts/qa/csp_regression.py --capture [base_url]
  python3 scripts/qa/csp_regression.py --compare [base_url]   (default mode)
  python3 scripts/qa/csp_regression.py --compare [base_url] --expect-added TOKEN [TOKEN ...]
Writes scripts/qa/out/csp_regression.json (compare-mode diff report) and,
in --capture mode, scripts/qa/baselines/csp_baseline.json (the golden
snapshot).
Exit codes: 0 = clean/self-consistent, 1 = findings/drift present,
2 = infrastructure error.
"""
import argparse
import difflib
import json
import os
import re
import ssl
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, HTTPRedirectHandler, HTTPSHandler

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = None

# Fixed order (matches the plan's task description exactly).
ROUTE_CLASSES = [
    '/', '/ru', '/ru/fleet', '/routes/prague-vienna', '/ar/routes/prague-vienna',
    '/book', '/ru/book', '/login', '/ru/login', '/ru/account', '/api/health',
]

NONCE_RE = re.compile(r"nonce-[A-Za-z0-9+/=]+")
NONCE_PLACEHOLDER = 'nonce-<normalized>'

OUT_DIR = os.path.join('scripts', 'qa', 'out')
OUT_PATH = os.path.join(OUT_DIR, 'csp_regression.json')
BASELINE_DIR = os.path.join('scripts', 'qa', 'baselines')
BASELINE_PATH = os.path.join(BASELINE_DIR, 'csp_baseline.json')


class NoRedirect(HTTPRedirectHandler):
    """Capture the FIRST response's headers — never follow a redirect."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def normalize_csp(value: str) -> str:
    return NONCE_RE.sub(NONCE_PLACEHOLDER, value) if value else value


def fetch_headers(url: str, timeout: int = 20) -> dict:
    handlers = [NoRedirect()]
    if SSL_CONTEXT is not None:
        handlers.append(HTTPSHandler(context=SSL_CONTEXT))
    opener = build_opener(*handlers)
    req = Request(url, headers={'User-Agent': 'PrestigoQA/1.0'})
    try:
        with opener.open(req, timeout=timeout) as resp:
            return {
                'status': resp.status,
                'csp': normalize_csp(resp.headers.get('Content-Security-Policy', '')),
                'cspReportOnly': normalize_csp(resp.headers.get('Content-Security-Policy-Report-Only', '')),
            }
    except HTTPError as e:
        # A redirect (3xx) or an error status (401/403/etc.) both raise
        # HTTPError under urllib once redirects are disabled — the headers
        # are still present on e.headers and must be captured, not discarded.
        return {
            'status': e.code,
            'csp': normalize_csp(e.headers.get('Content-Security-Policy', '') if e.headers else ''),
            'cspReportOnly': normalize_csp(e.headers.get('Content-Security-Policy-Report-Only', '') if e.headers else ''),
        }


def do_capture(base: str) -> int:
    os.makedirs(BASELINE_DIR, exist_ok=True)
    baseline = {}
    try:
        for route_class in ROUTE_CLASSES:
            url = base + route_class
            baseline[route_class] = fetch_headers(url)
    except URLError as e:
        print(f'INFRA ERROR: {e}', file=sys.stderr)
        return 2

    with open(BASELINE_PATH, 'w', encoding='utf-8') as f:
        json.dump(baseline, f, ensure_ascii=False, indent=1)

    print(f'csp_regression --capture: wrote {len(baseline)} route-class entries to {BASELINE_PATH}')
    return 0


def strip_tokens(csp: str, tokens) -> str:
    """Remove every occurrence of each token (plus its single leading space)
    at a source-list token boundary (followed by space, ';' or end)."""
    for tok in tokens:
        csp = re.sub(' ' + re.escape(tok) + r'(?=[ ;]|$)', '', csp)
    return csp


def csp_unified_diff(route_class: str, before: str, after: str) -> str:
    """Unified diff of the two policies, one directive per line."""
    a = [d.strip() + ';' for d in before.split(';') if d.strip()]
    b = [d.strip() + ';' for d in after.split(';') if d.strip()]
    return '\n'.join(difflib.unified_diff(
        a, b, fromfile=f'baseline {route_class}', tofile=f'current {route_class}', lineterm='', n=0))


def do_compare(base: str, expect_added=None) -> int:
    if not os.path.exists(BASELINE_PATH):
        print(f'INFRA ERROR: no baseline at {BASELINE_PATH} — run --capture first', file=sys.stderr)
        return 2

    with open(BASELINE_PATH, 'r', encoding='utf-8') as f:
        baseline = json.load(f)

    os.makedirs(OUT_DIR, exist_ok=True)
    current = {}
    findings = []

    try:
        for route_class in ROUTE_CLASSES:
            url = base + route_class
            current[route_class] = fetch_headers(url)
    except URLError as e:
        print(f'INFRA ERROR: {e}', file=sys.stderr)
        return 2

    for route_class in ROUTE_CLASSES:
        base_entry = baseline.get(route_class)
        cur_entry = current.get(route_class)
        if base_entry is None:
            findings.append(f'{route_class}: no baseline entry to compare against')
            continue
        if base_entry.get('status') != cur_entry.get('status'):
            # Status drift is reported but never fails the check on its own.
            print(f"NOTE {route_class}: status changed {base_entry.get('status')} -> {cur_entry.get('status')}")
        if expect_added:
            base_csp = base_entry.get('csp') or ''
            cur_csp = cur_entry.get('csp') or ''
            if strip_tokens(cur_csp, expect_added) != base_csp:
                findings.append(f'{route_class}: CSP differs from baseline by more than the expected tokens')
                print(f'--- baseline CSP [{route_class}]')
                print(base_csp)
                print(f'+++ current CSP [{route_class}]')
                print(cur_csp)
            else:
                is_static = bool(base_csp) and 'nonce-' not in base_csp
                if is_static and not any(t in cur_csp for t in expect_added):
                    findings.append(f'{route_class}: static-policy route has none of the expected tokens')
                diff = csp_unified_diff(route_class, base_csp, cur_csp)
                print(f'REVIEWED DIFF [{route_class}]' + ('' if diff else ' (no difference)'))
                if diff:
                    print(diff)
        elif base_entry.get('csp') != cur_entry.get('csp'):
            findings.append(f'{route_class}: Content-Security-Policy header drift')
            print(f'--- baseline CSP [{route_class}]')
            print(base_entry.get('csp'))
            print(f'+++ current CSP [{route_class}]')
            print(cur_entry.get('csp'))
        if base_entry.get('cspReportOnly') != cur_entry.get('cspReportOnly'):
            findings.append(f'{route_class}: Content-Security-Policy-Report-Only header drift')

    result = {'baseUrl': base, 'routeClassesChecked': len(ROUTE_CLASSES), 'findings': findings, 'current': current}
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=1)

    print(f'csp_regression --compare: {len(ROUTE_CLASSES)} route classes checked, {len(findings)} findings')
    return 1 if findings else 0


def main() -> int:
    parser = argparse.ArgumentParser(description='csp_regression — VER-01/D-13 CSP snapshot/diff (never a rewrite)')
    parser.add_argument('base_url', nargs='?', default='https://rideprestigo.com')
    parser.add_argument('--locales', default='')  # accepted for CLI-shape parity; CSP is not locale-scoped
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--capture', action='store_true', help='write scripts/qa/baselines/csp_baseline.json')
    mode.add_argument('--compare', action='store_true', help='diff against the existing baseline (default)')
    parser.add_argument('--expect-added', nargs='+', metavar='TOKEN', default=None,
                        help='(--compare only) pass only if the current CSP minus these exact tokens equals the baseline')
    args = parser.parse_args()
    base = args.base_url.rstrip('/')
    if args.expect_added and args.capture:
        parser.error('--expect-added is compare-mode only')

    if args.capture:
        return do_capture(base)
    return do_compare(base, args.expect_added)


if __name__ == '__main__':
    sys.exit(main())
