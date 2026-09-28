#!/usr/bin/env python3
"""chat_widget_probe — Phase 77 (INBOX-02/INBOX-04, D-02/D-09) launch-gate probe
for the Chatwoot website chat launcher.

Five independent modes, selected by exactly one flag (--consent/--click/
--overlap ship in a follow-up commit on this same file; this commit
implements --cwv-capture and --cwv-compare first, per the tracer task):

  --cwv-capture BASE
      Lab Core Web Vitals ("before") reference. For each of 3 pages (/,
      /routes/prague-vienna, /book), runs 5 fresh-browser-context page loads
      under a fixed throttling profile, takes the median LCP/CLS/TBT across
      the 5 runs, and writes scripts/qa/baselines/cwv_chat_baseline.json
      (capturedAt, base, profile, thresholds, per-page medians + raw runs).
      This is the ONLY mode that writes the baseline file.

  --cwv-compare BASE
      Same measurement as --cwv-capture, plus (when the chat launcher
      element exists on the page) one click of the launcher per run,
      recording launcher_inp_ms — the worst pointerdown/pointerup/click
      Event Timing duration (durationThreshold 16ms) observed after the
      click. Compares the fresh medians against the committed baseline and
      prints a `page | metric | before | after | limit | OK/REGRESSION`
      table. Never mutates the baseline file. Exit 1 if any row regresses.

  --consent BASE [--expect-launcher] [--locales ...] [--pages ...]
      Per locale x page combination: asserts zero requests to the chat
      subdomain, zero `cw_*` cookies, and zero `cw_*`/`chatwoot*`
      localStorage keys BEFORE any click. With --expect-launcher, also
      asserts exactly one qualifying launcher button exists and that its
      on-screen center sits on the correct side of the viewport (left of
      center under Arabic RTL, right of center otherwise).

  --click BASE [--locales ...] [--pages ...]
      Opens the launcher, clicks the first item in its menu ("Chat on
      site"), and waits up to 15s for a chat-subdomain iframe to appear.
      Collects `securitypolicyviolation` events (via a `window.__cspViolations`
      listener installed with `add_init_script`, before any navigation) and
      console messages mentioning "Content Security Policy". Asserts no
      chat-host request happened before the click timestamp. Exits 3 the
      moment no launcher element is found on any checked page (this mode is
      exercised for real only against a live production deployment carrying
      the launcher — see Phase 77-12).

  --overlap BASE [--pages ...]
      At a 375x812 viewport, compares the launcher's bounding rect against
      every OTHER visible element on the page whose computed position is
      `fixed` or `sticky` (excluding the launcher's own subtree, its open
      menu, and its fixed/sticky ancestor wrapper). Fails on any rectangle
      intersection (e.g. the booking price bar, the wizard action row, the
      cookie-consent banner).

Throttling profile used by --cwv-capture/--cwv-compare (Chrome DevTools'
own "Fast 3G" preset — matches this plan's "slow-4G" spec exactly):
  - Mobile viewport 412x823, deviceScaleFactor 2.625, isMobile, hasTouch
  - CDP Emulation.setCPUThrottlingRate rate=4
  - CDP Network.emulateNetworkConditions: 150ms RTT, 1.6 Mbps down
    (1.6*1024*1024/8 B/s), 750 Kbps up (750*1024/8 B/s)
  - Fresh browser context per run (no cache reuse across runs)
  - Metrics read after `load` + 5s of idle time

Regression thresholds (stored in the baseline file itself, under
`thresholds`, never edited by --cwv-compare):
  lcp_pct=0.10, lcp_ms=150   -> LCP regression if delta > max(before*10%, 150ms)
  tbt_pct=0.10, tbt_ms=50    -> TBT regression if delta > max(before*10%, 50ms)
  cls_abs=0.02               -> CLS regression if delta > 0.02 (absolute)
  launcher_inp_ms=200        -> launcher-click regression if after > 200ms

This script never loosens a threshold or rewrites the baseline to make a
--cwv-compare pass. A regression is investigated, never absorbed.

Exit codes: 0 = clean, 1 = findings (regression / violation / overlap /
consent leak), 2 = infrastructure error (e.g. missing baseline), 3 = the
chat launcher element could not be found at all (--click mode only).

Usage:
  python3 scripts/qa/chat_widget_probe.py --cwv-capture [base_url]
  python3 scripts/qa/chat_widget_probe.py --cwv-compare [base_url]
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from statistics import median

from playwright.sync_api import sync_playwright

# The chat host is referenced only inside this script (scripts/qa is outside
# the isolation guard's scan set, per this plan's interfaces block) — never
# imported from site code, never used as an env-driven value.
CHAT_HOST = 'chat.rideprestigo.com'

# The launcher is located by its stable attribute contract (a button
# carrying aria-controls whose value starts with "chat-launcher"), never by
# visible text, so every mode works identically in all 7 locales.
LAUNCHER_SELECTOR = 'button[aria-controls^="chat-launcher"]'

LOCALES = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh']
CWV_PAGES = ['/', '/routes/prague-vienna', '/book']

BASELINE_DIR = os.path.join('scripts', 'qa', 'baselines')
CWV_BASELINE_PATH = os.path.join(BASELINE_DIR, 'cwv_chat_baseline.json')

THRESHOLDS = {
    'lcp_pct': 0.10,
    'lcp_ms': 150,
    'tbt_pct': 0.10,
    'tbt_ms': 50,
    'cls_abs': 0.02,
    'launcher_inp_ms': 200,
}

PROFILE = {
    'viewport': {'width': 412, 'height': 823},
    'deviceScaleFactor': 2.625,
    'isMobile': True,
    'hasTouch': True,
    'cpuThrottlingRate': 4,
    'network': {'latencyMs': 150, 'downloadMbps': 1.6, 'uploadKbps': 750},
    'runsPerPage': 5,
    'idleAfterLoadMs': 5000,
}

RUNS_PER_PAGE = 5

# Installed via add_init_script BEFORE the first navigation in a context —
# never injected after the fact, so no LCP/CLS/longtask/event-timing entry
# that fires before this script runs can be missed. hadRecentInput-excluded
# CLS sum, LCP last-entry renderTime/loadTime, longtask duration-50ms tasks
# after first-contentful-paint (D-09/INBOX-04 method), plus a
# durationThreshold:16 Event Timing observer for the launcher-click INP
# proxy (pointerdown/pointerup/click).
PERF_INIT_JS = """
window.__prestigoPerf = { lcp: 0, cls: 0, fcp: 0, longtasks: [], eventDurations: [] };
try {
  new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const last = entries[entries.length - 1];
    if (last) window.__prestigoPerf.lcp = last.renderTime || last.loadTime || last.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
} catch (e) {}
try {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) window.__prestigoPerf.cls += entry.value;
    }
  }).observe({ type: 'layout-shift', buffered: true });
} catch (e) {}
try {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__prestigoPerf.longtasks.push({ startTime: entry.startTime, duration: entry.duration });
    }
  }).observe({ type: 'longtask', buffered: true });
} catch (e) {}
try {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === 'first-contentful-paint') window.__prestigoPerf.fcp = entry.startTime;
    }
  }).observe({ type: 'paint', buffered: true });
} catch (e) {}
try {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === 'pointerdown' || entry.name === 'pointerup' || entry.name === 'click') {
        window.__prestigoPerf.eventDurations.push(entry.duration);
      }
    }
  }).observe({ type: 'event', durationThreshold: 16, buffered: true });
} catch (e) {}
"""

READ_CWV_JS = """
() => {
  const p = window.__prestigoPerf || {};
  const fcp = p.fcp || 0;
  let tbt = 0;
  for (const t of (p.longtasks || [])) {
    if (t.startTime >= fcp) tbt += Math.max(0, t.duration - 50);
  }
  return { lcp_ms: p.lcp || 0, cls: p.cls || 0, tbt_ms: tbt };
}
"""

READ_EVENT_DURATIONS_JS = "() => (window.__prestigoPerf && window.__prestigoPerf.eventDurations) || []"


def iso_now() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def page_url(base: str, locale: str, path: str) -> str:
    """en at /<path>; others at /<L>/<path> (as-needed prefix; / for en
    home, /ru for ru home) — matches overflow_audit.py's convention."""
    prefix = '' if locale == 'en' else '/' + locale
    suffix = path if (path != '/' or locale == 'en') else ''
    return base + prefix + suffix


def parse_csv(value, default):
    if not value:
        return list(default)
    return [v.strip() for v in value.split(',') if v.strip()]


def parse_pages_csv(value, default):
    if not value:
        return list(default)
    out = []
    for p in value.split(','):
        p = p.strip()
        if not p:
            continue
        out.append(p if p.startswith('/') else '/' + p)
    return out


def measure_once(browser, url: str, click_launcher: bool = False) -> dict:
    """One fresh-context, no-cache CWV measurement run under the throttled
    mobile profile. When click_launcher, clicks the launcher (if present)
    after metrics settle and records launcher_inp_ms separately."""
    context = browser.new_context(
        viewport={'width': 412, 'height': 823},
        device_scale_factor=2.625,
        is_mobile=True,
        has_touch=True,
        locale='en-US',
    )
    context.add_init_script(PERF_INIT_JS)
    page = context.new_page()
    cdp = context.new_cdp_session(page)
    try:
        cdp.send('Network.enable')
        cdp.send('Network.emulateNetworkConditions', {
            'offline': False,
            'latency': 150,
            'downloadThroughput': 1.6 * 1024 * 1024 / 8,
            'uploadThroughput': 750 * 1024 / 8,
        })
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
        page.goto(url, wait_until='load', timeout=90000)
        page.wait_for_timeout(5000)
        metrics = page.evaluate(READ_CWV_JS)
        if click_launcher:
            launcher = page.query_selector(LAUNCHER_SELECTOR)
            if launcher:
                launcher.click()
                page.wait_for_timeout(300)
                durations = page.evaluate(READ_EVENT_DURATIONS_JS)
                if durations:
                    metrics['launcher_inp_ms'] = max(durations)
        return metrics
    finally:
        context.close()


def do_cwv_capture(base: str) -> int:
    os.makedirs(BASELINE_DIR, exist_ok=True)
    pages_out = {}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            try:
                for path in CWV_PAGES:
                    url = base + path
                    runs = []
                    for _ in range(RUNS_PER_PAGE):
                        runs.append(measure_once(browser, url, click_launcher=False))
                    pages_out[path] = {
                        'lcp_ms': median(sorted(r['lcp_ms'] for r in runs)),
                        'cls': median(sorted(r['cls'] for r in runs)),
                        'tbt_ms': median(sorted(r['tbt_ms'] for r in runs)),
                        'runs': runs,
                    }
            finally:
                browser.close()
    except Exception as e:
        print(f'INFRA ERROR: {e}', file=sys.stderr)
        return 2

    baseline = {
        'capturedAt': iso_now(),
        'base': base,
        'profile': PROFILE,
        'thresholds': THRESHOLDS,
        'pages': pages_out,
    }
    with open(CWV_BASELINE_PATH, 'w', encoding='utf-8') as f:
        json.dump(baseline, f, ensure_ascii=False, indent=1)

    print(f'cwv-capture: wrote {len(pages_out)} page entries to {CWV_BASELINE_PATH}')
    for path, entry in pages_out.items():
        print(f"  {path}: lcp={entry['lcp_ms']:.0f}ms cls={entry['cls']:.3f} tbt={entry['tbt_ms']:.0f}ms")
    return 0


def do_cwv_compare(base: str) -> int:
    if not os.path.exists(CWV_BASELINE_PATH):
        print(f'INFRA ERROR: no baseline at {CWV_BASELINE_PATH} — run --cwv-capture first', file=sys.stderr)
        return 2

    with open(CWV_BASELINE_PATH, 'r', encoding='utf-8') as f:
        baseline = json.load(f)
    thresholds = baseline.get('thresholds', THRESHOLDS)
    pages = list(baseline['pages'].keys())

    current = {}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            try:
                for path in pages:
                    url = base + path
                    runs = []
                    for _ in range(RUNS_PER_PAGE):
                        runs.append(measure_once(browser, url, click_launcher=True))
                    inp_values = sorted(r['launcher_inp_ms'] for r in runs if 'launcher_inp_ms' in r)
                    entry = {
                        'lcp_ms': median(sorted(r['lcp_ms'] for r in runs)),
                        'cls': median(sorted(r['cls'] for r in runs)),
                        'tbt_ms': median(sorted(r['tbt_ms'] for r in runs)),
                        'runs': runs,
                    }
                    if inp_values:
                        entry['launcher_inp_ms'] = median(inp_values)
                    current[path] = entry
            finally:
                browser.close()
    except Exception as e:
        print(f'INFRA ERROR: {e}', file=sys.stderr)
        return 2

    rows = []
    findings = []
    for path in pages:
        b = baseline['pages'][path]
        c = current[path]

        limit = max(b['lcp_ms'] * thresholds['lcp_pct'], thresholds['lcp_ms'])
        delta = c['lcp_ms'] - b['lcp_ms']
        ok = delta <= limit
        rows.append((path, 'lcp_ms', f"{b['lcp_ms']:.0f}", f"{c['lcp_ms']:.0f}", f"{limit:.0f}", 'OK' if ok else 'REGRESSION'))
        if not ok:
            findings.append(f'{path}: LCP regression +{delta:.0f}ms > {limit:.0f}ms')

        limit = max(b['tbt_ms'] * thresholds['tbt_pct'], thresholds['tbt_ms'])
        delta = c['tbt_ms'] - b['tbt_ms']
        ok = delta <= limit
        rows.append((path, 'tbt_ms', f"{b['tbt_ms']:.0f}", f"{c['tbt_ms']:.0f}", f"{limit:.0f}", 'OK' if ok else 'REGRESSION'))
        if not ok:
            findings.append(f'{path}: TBT regression +{delta:.0f}ms > {limit:.0f}ms')

        limit = thresholds['cls_abs']
        delta = c['cls'] - b['cls']
        ok = delta <= limit
        rows.append((path, 'cls', f"{b['cls']:.3f}", f"{c['cls']:.3f}", f"{limit:.3f}", 'OK' if ok else 'REGRESSION'))
        if not ok:
            findings.append(f'{path}: CLS regression +{delta:.3f} > {limit:.3f}')

        if 'launcher_inp_ms' in c:
            limit = thresholds['launcher_inp_ms']
            ok = c['launcher_inp_ms'] <= limit
            rows.append((path, 'launcher_inp_ms', '-', f"{c['launcher_inp_ms']:.0f}", f"{limit:.0f}", 'OK' if ok else 'REGRESSION'))
            if not ok:
                findings.append(f"{path}: launcher click took {c['launcher_inp_ms']:.0f}ms > {limit:.0f}ms")

    print(f"{'page':28} {'metric':18} {'before':>8} {'after':>8} {'limit':>8}  status")
    for r in rows:
        print(f'{r[0]:28} {r[1]:18} {r[2]:>8} {r[3]:>8} {r[4]:>8}  {r[5]}')
    print(f'cwv-compare: {len(pages)} pages, {len(rows)} rows, {len(findings)} findings')
    for f_ in findings:
        print('FINDING:', f_)
    return 1 if findings else 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description='chat_widget_probe — Phase 77 D-02/D-09 CWV, consent, CSP-click and overlap probe',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument('base_url', nargs='?', default='https://rideprestigo.com')
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--cwv-capture', action='store_true', help='capture the pre-change CWV baseline (writes the baseline file)')
    mode.add_argument('--cwv-compare', action='store_true', help='compare current CWV against the committed baseline')
    args = parser.parse_args()

    base = args.base_url.rstrip('/')

    if args.cwv_capture:
        return do_cwv_capture(base)
    if args.cwv_compare:
        return do_cwv_compare(base)

    parser.error('no mode selected')
    return 2


if __name__ == '__main__':
    sys.exit(main())
