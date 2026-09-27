#!/usr/bin/env python3
"""GSC per-locale indexing baseline (D-14, VER-01).

For each of 7 locales x 6 key pages (/, /book, /fleet, /routes,
/routes/prague-vienna, /services/airport-transfer — EN unprefixed), calls
Search Console's urlInspection().index().inspect() with the existing
webmasters.readonly OAuth token and records verdict, coverageState,
indexingState, lastCrawlTime, googleCanonical and userCanonical for each of
the 42 URLs. An empty/missing indexStatusResult (URL never seen by Google)
is recorded as "not yet known to Google" rather than dropped.

This is a read-only inspection only — it never calls sitemaps().submit() or
any URL-submission endpoint (the existing token cannot write; see
75-RESEARCH.md Pitfall 7). Sitemap resubmit and Request Indexing are done
manually via the GSC web UI (Task 3 of this plan).

Usage:
    python3 scripts/qa/gsc_indexing_baseline.py \
        [--token ~/.config/google-ads/gsc_token.json] \
        [--site sc-domain:rideprestigo.com] \
        [--base-url https://rideprestigo.com]

Writes scripts/qa/out/gsc_indexing_baseline.json (deterministic order).
Never prints token contents.

Exit codes:
    0 = all 42 URLs inspected (per-URL errors are recorded, not fatal)
    3 = token missing / invalid_grant / refresh failed (auth gate — re-auth
        with gsc_auth_setup.py, then re-run this script)
"""
import argparse
import json
import os
import sys
import time

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.auth.exceptions import RefreshError

# i18n/locales.ts routing order. EN is unprefixed in the URL.
LOCS = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh']

# Fixed 6-page set per the plan's must_haves.truths.
PAGES = ['/', '/book', '/fleet', '/routes', '/routes/prague-vienna', '/services/airport-transfer']

DEFAULT_TOKEN_PATH = os.path.expanduser('~/.config/google-ads/gsc_token.json')
DEFAULT_SITE = 'sc-domain:rideprestigo.com'
DEFAULT_BASE_URL = 'https://rideprestigo.com'

OUT_DIR = os.path.join('scripts', 'qa', 'out')
OUT_PATH = os.path.join(OUT_DIR, 'gsc_indexing_baseline.json')

REAUTH_MESSAGE = (
    'GSC token expired — re-auth: '
    'python3 ~/Desktop/founder\\ prestigo/gsc_auth_setup.py'
)


def build_url(base: str, loc: str, path: str) -> str:
    if loc == 'en':
        return base + path
    return base + '/' + loc + (path if path != '/' else '')


def load_credentials(token_path: str) -> Credentials:
    """Load the authorized-user token and refresh it. Raises on any
    auth failure — caller maps that to the exit-3 re-auth gate."""
    with open(token_path) as f:
        t = json.load(f)
    creds = Credentials(
        token=None,
        refresh_token=t['refresh_token'],
        token_uri=t['token_uri'],
        client_id=t['client_id'],
        client_secret=t['client_secret'],
        scopes=t['scopes'],
    )
    creds.refresh(GoogleAuthRequest())
    return creds


def inspect_url(svc, site: str, url: str, retries: int = 1) -> dict:
    """Call urlInspection().index().inspect() for one URL. Returns a dict
    with verdict/coverageState/indexingState/lastCrawlTime/googleCanonical/
    userCanonical, or an 'error' key on failure. Never raises."""
    last_err = None
    for attempt in range(retries + 1):
        try:
            resp = svc.urlInspection().index().inspect(
                body={'inspectionUrl': url, 'siteUrl': site}
            ).execute()
            break
        except HttpError as e:
            last_err = e
            if attempt < retries:
                time.sleep(2)
                continue
            return {'error': f'HttpError {e.resp.status if e.resp else "?"}: {str(e)[:200]}'}
        except Exception as e:
            last_err = e
            if attempt < retries:
                time.sleep(2)
                continue
            return {'error': f'error: {str(e)[:200]}'}

    # Be defensive about the top-level key name — some client/version
    # combinations surface this as 'inspectionResult' rather than
    # 'urlInspectionResult'; try both rather than silently returning
    # "not yet known" for every URL if the key name differs.
    result = resp.get('urlInspectionResult') or resp.get('inspectionResult') or {}
    index_status = result.get('indexStatusResult') or {}

    if not index_status:
        return {
            'verdict': 'not yet known to Google',
            'coverageState': 'not yet known to Google',
            'indexingState': 'not yet known to Google',
            'lastCrawlTime': 'not yet known to Google',
            'googleCanonical': 'not yet known to Google',
            'userCanonical': 'not yet known to Google',
        }

    return {
        'verdict': index_status.get('verdict', 'not yet known to Google'),
        'coverageState': index_status.get('coverageState', 'not yet known to Google'),
        'indexingState': index_status.get('indexingState', 'not yet known to Google'),
        'lastCrawlTime': index_status.get('lastCrawlTime', 'not yet known to Google'),
        'googleCanonical': index_status.get('googleCanonical', 'not yet known to Google'),
        'userCanonical': index_status.get('userCanonical', 'not yet known to Google'),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description='gsc_indexing_baseline — D-14/VER-01 per-locale GSC indexing baseline')
    parser.add_argument('--token', default=DEFAULT_TOKEN_PATH)
    parser.add_argument('--site', default=DEFAULT_SITE)
    parser.add_argument('--base-url', default=DEFAULT_BASE_URL)
    args = parser.parse_args()

    if not os.path.isfile(args.token):
        print(REAUTH_MESSAGE)
        return 3

    try:
        creds = load_credentials(args.token)
    except (RefreshError, KeyError, json.JSONDecodeError) as e:
        print(REAUTH_MESSAGE, file=sys.stderr)
        print(f'(reason: {type(e).__name__})', file=sys.stderr)
        return 3
    except Exception as e:
        msg = str(e)
        if 'invalid_grant' in msg.lower():
            print(REAUTH_MESSAGE, file=sys.stderr)
            return 3
        # Any other unexpected failure while loading/refreshing credentials
        # is still treated as an auth gate — this script has nothing useful
        # to inspect without valid credentials.
        print(REAUTH_MESSAGE, file=sys.stderr)
        print(f'(reason: {type(e).__name__}: {msg[:200]})', file=sys.stderr)
        return 3

    svc = build('searchconsole', 'v1', credentials=creds, cache_discovery=False)

    os.makedirs(OUT_DIR, exist_ok=True)

    results: dict = {}
    total_urls = 0
    indexed_count = 0

    for loc in LOCS:
        results[loc] = {}
        for path in PAGES:
            url = build_url(args.base_url, loc, path)
            entry = inspect_url(svc, args.site, url)
            entry['url'] = url
            results[loc][path] = entry
            total_urls += 1
            if 'indexed' in str(entry.get('coverageState', '')).lower():
                indexed_count += 1
            # Be polite to the per-URL inspect quota.
            time.sleep(1)

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=1)

    for loc, pages in results.items():
        loc_indexed = sum(1 for e in pages.values() if 'indexed' in str(e.get('coverageState', '')).lower())
        print(f'{loc}: {loc_indexed}/{len(pages)} indexed')

    print(f'gsc_indexing_baseline: {total_urls} URLs inspected across {len(LOCS)} locales x {len(PAGES)} pages, {indexed_count} indexed')

    return 0


if __name__ == '__main__':
    sys.exit(main())
