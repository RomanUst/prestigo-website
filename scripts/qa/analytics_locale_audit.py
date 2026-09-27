import sys, json, argparse, re
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright

"""Analytics locale audit (VER-01, D-10/D-12/T-75-13): captures GA4 collect
and Meta /tr requests on production, aborting every one so nothing reaches
Google/Meta, and asserts each carries a site_locale param for every locale.

Usage: python3 scripts/qa/analytics_locale_audit.py [base_url] [--locales en,ru,...]
Requires Python Playwright. Writes scripts/qa/out/analytics_locale_audit.json.
Exit code: 0 if every locale passes, 1 if any locale fails.
"""

PAGES = ['/', '/book']
OUT_PATH = 'scripts/qa/out/analytics_locale_audit.json'
# 25s, not the originally spec'd 8s — see the Rule 1 fix comment at the poll
# loop below (GA4 Consent Mode v2 wait_for_update: 20000 quiet period).
WAIT_MS = 25000
# Regular (non-headless) desktop Chrome UA — see the Rule 3 note in audit().
BROWSER_UA = (
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
)


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('base_url', nargs='?', default='https://rideprestigo.com')
    p.add_argument('--locales', default='en,ru,es,fr,ar,hi,zh')
    return p.parse_args()


def is_ga4_collect(url: str) -> bool:
    host = urlparse(url).netloc
    path = urlparse(url).path
    return '/g/collect' in path and (
        host.endswith('google-analytics.com') or host.endswith('analytics.google.com')
    )


def is_meta_tr(url: str) -> bool:
    host = urlparse(url).netloc
    path = urlparse(url).path
    return host.endswith('facebook.com') and path.startswith('/tr')


def contains_param(haystack: str | None, key_eq_value: str) -> bool:
    """Checks a raw or URL-encoded query string / POST body for a literal
    key=value pair (e.g. 'ep.site_locale=ru' or 'cd[site_locale]=ru'),
    accounting for GA4/Meta's URL-encoding of '.', '[' and ']'."""
    if not haystack:
        return False
    if key_eq_value in haystack:
        return True
    try:
        if key_eq_value in unquote(haystack):
            return True
    except Exception:
        pass
    # Rule 1 fix (plan 75-23): when the Meta /tr URL would be too long (e.g.
    # the Arabic pages) fbevents.js sends the hit as a sendBeacon POST with a
    # multipart/form-data body, where the pair is encoded as
    #   name="cd[site_locale]"\r\n\r\nar
    # rather than cd[site_locale]=ar.
    key, _, value = key_eq_value.partition('=')
    return re.search(
        r'name="' + re.escape(key) + r'"\r?\n\r?\n' + re.escape(value) + r'\r?\n',
        haystack,
    ) is not None


def audit(base_url: str, locales: list[str]) -> dict:
    results: dict[str, dict] = {}

    with sync_playwright() as p:
        # Rule 3 fix (plan 75-23): Meta's fbevents.js processes the PageView
        # (fbq.getState().pixels[0].eventCount === 1) but silently never
        # sends the /tr hit from an automated headless browser
        # (navigator.webdriver === true / "HeadlessChrome" UA) — which made
        # metaHits permanently 0 regardless of the site. Present as a regular
        # desktop Chrome so the real hit is emitted (and then aborted below).
        browser = p.chromium.launch(args=['--disable-blink-features=AutomationControlled'])
        context = browser.new_context(locale='en-US', user_agent=BROWSER_UA)
        # Grant both analytics and marketing consent (per-category v2 key +
        # legacy enum) so GA4 and the Meta Pixel both load and fire.
        context.add_init_script(
            "localStorage.setItem('prestigo_consent_v2', "
            "JSON.stringify({analytics:true,marketing:true}));"
            "localStorage.setItem('prestigo_cookie_consent','granted');"
        )

        # Rule 1 fix (plan 75-23): a fresh page per URL, and only hits issued
        # by that page are counted. Reusing one page let the previous page's
        # unload beacon (a GA4 time_on_page event carrying the previous dl,
        # no site_locale) land first in the next URL's window, and the early
        # break below then stopped before the real page_view arrived.
        current: dict = {'page': None, 'hits': []}

        def matcher(url: str) -> bool:
            return is_ga4_collect(url) or is_meta_tr(url)

        def handler(route, request):
            try:
                own = request.frame.page == current['page']
            except Exception:
                own = False
            if own:
                current['hits'].append({
                    'url': request.url,
                    'body': request.post_data,
                    'kind': 'ga4' if is_ga4_collect(request.url) else 'meta',
                })
            # Context-level route: every GA4/Meta hit from any page is
            # aborted, so nothing reaches Google/Meta (T-75-13).
            route.abort()

        context.route(matcher, handler)

        for locale in locales:
            for path in PAGES:
                if current['page'] is not None:
                    current['page'].close()
                page = context.new_page()
                current['page'] = page
                current['hits'] = []
                captured = current['hits']
                url = (
                    base_url
                    + ('' if locale == 'en' else '/' + locale)
                    + (path if path != '/' or locale == 'en' else '')
                )
                try:
                    page.goto(url, wait_until='load', timeout=60000)
                except Exception as e:
                    results.setdefault(locale, {})[path] = {
                        'error': str(e)[:200],
                        'ga4Hits': 0,
                        'ga4SiteLocale': None,
                        'metaHits': 0,
                        'metaSiteLocale': None,
                        'pass': False,
                    }
                    continue

                # Poll up to WAIT_MS, break early once both a GA4 and a Meta
                # hit have arrived (Rule 1 fix: production's Consent Mode v2
                # ga-consent-default script sets wait_for_update: 20000 —
                # gtag.js queues hits in a "quiet period" for up to 20s
                # before actually sending, even when the default already
                # grants analytics_storage. An 8s window (as originally
                # spec'd) never observes a real GA4 hit and would make this
                # check permanently unable to verify D-10 post-deploy too,
                # not just on this pre-deploy baseline run. Verified via a
                # manual capture session this run: GA4 collect fired at
                # ~21s, never within 8-20s.
                waited_ms = 0
                while waited_ms < WAIT_MS:
                    has_ga4 = any(c['kind'] == 'ga4' for c in captured)
                    has_meta = any(c['kind'] == 'meta' for c in captured)
                    if has_ga4 and has_meta:
                        break
                    page.wait_for_timeout(500)
                    waited_ms += 500

                ga4_hits = [c for c in captured if c['kind'] == 'ga4']
                meta_hits = [c for c in captured if c['kind'] == 'meta']

                ga4_target = f'ep.site_locale={locale}'
                meta_target = f'cd[site_locale]={locale}'

                ga4_site_locale_ok = any(
                    contains_param(c['url'], ga4_target) or contains_param(c['body'], ga4_target)
                    for c in ga4_hits
                )
                meta_site_locale_ok = any(
                    contains_param(c['url'], meta_target) or contains_param(c['body'], meta_target)
                    for c in meta_hits
                )

                results.setdefault(locale, {})[path] = {
                    'ga4Hits': len(ga4_hits),
                    'ga4SiteLocale': ga4_site_locale_ok,
                    'metaHits': len(meta_hits),
                    'metaSiteLocale': meta_site_locale_ok,
                    'pass': len(ga4_hits) > 0 and ga4_site_locale_ok and len(meta_hits) > 0 and meta_site_locale_ok,
                }

        browser.close()

    return results


def main():
    args = parse_args()
    locales = [l.strip() for l in args.locales.split(',') if l.strip()]
    results = audit(args.base_url, locales)

    json.dump(results, open(OUT_PATH, 'w'), ensure_ascii=False, indent=1)

    all_pass = True
    for locale in locales:
        for path in PAGES:
            r = results.get(locale, {}).get(path, {})
            status = 'PASS' if r.get('pass') else 'FAIL'
            if not r.get('pass'):
                all_pass = False
            print(
                locale, path, status,
                'ga4Hits', r.get('ga4Hits'), 'ga4SiteLocale', r.get('ga4SiteLocale'),
                'metaHits', r.get('metaHits'), 'metaSiteLocale', r.get('metaSiteLocale'),
                r.get('error', ''),
            )
    print('all_pass:', all_pass)
    sys.exit(0 if all_pass else 1)


if __name__ == '__main__':
    main()
