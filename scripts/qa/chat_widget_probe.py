#!/usr/bin/env python3
"""chat_widget_probe — Phase 77 (INBOX-02/INBOX-04, D-02/D-09) launch-gate probe
for the Chatwoot website chat launcher.

Six independent modes, selected by exactly one flag:

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

  --send-message TEXT --email ADDR [--name NAME] [--locale en] BASE
      Plan 77-13 tracer. Opens the launcher on the locale home page, clicks
      "Chat on site", fills the pre-chat form inside the chat iframe (email,
      name, message; located by field `name` attribute so it works in every
      locale), submits, and waits for TEXT to show in the widget thread.
      Prints `sent_at=<ISO>`. Exit 1 when any step times out (15 s each).
      Use example.com addresses or the owner's own — never a customer's.
      Creates a REAL conversation in the live inbox; resolve it afterwards.

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
  python3 scripts/qa/chat_widget_probe.py --consent [base_url] [--expect-launcher] [--locales en,ru,...] [--pages /,/book]
  python3 scripts/qa/chat_widget_probe.py --click [base_url] [--locales en,ar] [--pages /,/book]
  python3 scripts/qa/chat_widget_probe.py --overlap [base_url] [--pages /book,/]
  python3 scripts/qa/chat_widget_probe.py --send-message "text" --email qa@example.com [base_url] [--locale en]
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from statistics import median
from urllib.parse import urlparse

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
DEFAULT_PAGES = ['/', '/routes/prague-vienna', '/book']
DEFAULT_OVERLAP_PAGES = ['/book', '/']

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

# Installed via add_init_script for --click mode only — records every
# securitypolicyviolation event from page load onward, so a violation fired
# by the widget script the instant it's injected is never missed.
CSP_LISTENER_JS = """
window.__cspViolations = [];
document.addEventListener('securitypolicyviolation', (e) => {
  window.__cspViolations.push({
    violatedDirective: e.violatedDirective,
    blockedURI: e.blockedURI,
    sourceFile: e.sourceFile,
  });
});
"""

# Records a "necessary only" cookie decision so the first-visit consent modal
# does not cover the page (mirrors what --overlap seeds inline).
CONSENT_SEED_JS = "try { localStorage.setItem('prestigo_consent_v2', JSON.stringify({analytics:false,marketing:false})) } catch (e) {}"

# Excludes the launcher's own subtree (button + its aria-controls menu) and
# any fixed/sticky ancestor wrapper of the launcher, per read_first note:
# exclude only the launcher subtree, never the CookieBanner.
OVERLAP_JS = """
(selector) => {
  const launcher = document.querySelector(selector);
  if (!launcher) return [];
  const excludeRoots = [launcher];
  const controlsId = launcher.getAttribute('aria-controls');
  if (controlsId) {
    const menu = document.getElementById(controlsId);
    if (menu) excludeRoots.push(menu);
  }
  let anc = launcher.parentElement;
  while (anc && anc !== document.body) {
    const cs = getComputedStyle(anc);
    if (cs.position === 'fixed' || cs.position === 'sticky') excludeRoots.push(anc);
    anc = anc.parentElement;
  }
  const isInsideExcluded = (el) => excludeRoots.some((root) => root.contains(el));
  const lr = launcher.getBoundingClientRect();
  const findings = [];
  const all = document.querySelectorAll('body *');
  for (const el of all) {
    if (isInsideExcluded(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const intersects = !(r.right <= lr.left || r.left >= lr.right || r.bottom <= lr.top || r.top >= lr.bottom);
    if (intersects) {
      findings.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 60),
        rect: { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) },
      });
    }
  }
  return findings;
}
"""


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
                # LCP/CLS/TBT were read above with the first-visit cookie modal
                # showing (same as the baseline). That modal is full-screen and
                # intercepts pointer events, so model a visitor who has already
                # answered it before the launcher click, and only count the
                # launcher click's own interaction durations.
                page.evaluate(
                    "() => { const d = document.querySelector('[role=dialog][aria-labelledby=consent-title]'); if (d) d.remove(); "
                    "if (window.__prestigoPerf) window.__prestigoPerf.eventDurations = []; }"
                )
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


def do_consent(base: str, locales, pages, expect_launcher: bool) -> int:
    findings = []
    checked = 0
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            try:
                for locale in locales:
                    for path in pages:
                        url = page_url(base, locale, path)
                        combo = f'{locale} {path}'
                        context = browser.new_context()
                        chat_requests = []
                        context.on('request', lambda req, lst=chat_requests: lst.append(req.url))
                        page = context.new_page()
                        try:
                            page.goto(url, wait_until='load', timeout=60000)
                            page.wait_for_timeout(1500)
                        except Exception as e:
                            findings.append(f'{combo}: navigation error {e}')
                            context.close()
                            continue
                        checked += 1

                        for req_url in chat_requests:
                            host = urlparse(req_url).hostname or ''
                            if host == CHAT_HOST:
                                findings.append(f'{combo}: request to chat host before consent ({req_url})')

                        for c in context.cookies():
                            if c['name'].startswith('cw_'):
                                findings.append(f"{combo}: cw_ cookie present ({c['name']})")

                        storage_keys = page.evaluate('() => Object.keys(window.localStorage || {})')
                        for k in storage_keys:
                            if k.startswith('cw_') or k.startswith('chatwoot'):
                                findings.append(f'{combo}: chatwoot localStorage key present ({k})')

                        if expect_launcher:
                            candidates = page.query_selector_all('button[aria-expanded="false"][aria-controls]')
                            launchers = [
                                el for el in candidates
                                if (el.get_attribute('aria-controls') or '').startswith('chat-launcher')
                            ]
                            if len(launchers) != 1:
                                findings.append(f'{combo}: expected exactly 1 launcher button, found {len(launchers)}')
                            else:
                                box = launchers[0].bounding_box()
                                viewport = page.viewport_size
                                if box and viewport:
                                    center_x = box['x'] + box['width'] / 2
                                    mid = viewport['width'] / 2
                                    if locale == 'ar':
                                        if not center_x < mid:
                                            findings.append(f'{combo}: launcher not left-of-center under RTL (ar)')
                                    else:
                                        if not center_x > mid:
                                            findings.append(f'{combo}: launcher not right-of-center')
                        context.close()
            finally:
                browser.close()
    except Exception as e:
        print(f'INFRA ERROR: {e}', file=sys.stderr)
        return 2

    print(f'consent: {checked} locale x page combos checked, {len(findings)} findings')
    for f_ in findings:
        print('FINDING:', f_)
    return 1 if findings else 0


def do_click(base: str, locales, pages) -> int:
    findings = []
    checked = 0
    combos = [(locale, path) for locale in locales for path in pages]
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            try:
                for locale, path in combos:
                    url = page_url(base, locale, path)
                    combo = f'{locale} {path}'
                    context = browser.new_context()
                    context.add_init_script(CSP_LISTENER_JS)
                    # The first-visit cookie-consent dialog is a full-screen modal
                    # (z-[400]) that intercepts pointer events, so a fresh context
                    # can never click the launcher. Seed the same "necessary only"
                    # decision --overlap uses; the chat gate (D-02) is the click
                    # itself and independent of cookie consent.
                    context.add_init_script(CONSENT_SEED_JS)
                    page = context.new_page()
                    console_csp_msgs = []
                    page.on(
                        'console',
                        lambda msg, lst=console_csp_msgs: (
                            lst.append(msg.text) if 'Content Security Policy' in msg.text else None
                        ),
                    )
                    requests_log = []
                    page.on('request', lambda req, lst=requests_log: lst.append((time.time(), req.url)))

                    try:
                        page.goto(url, wait_until='load', timeout=60000)
                        page.wait_for_timeout(500)
                    except Exception as e:
                        findings.append(f'{combo}: navigation error {e}')
                        context.close()
                        continue
                    checked += 1

                    launcher = page.query_selector(LAUNCHER_SELECTOR)
                    if not launcher:
                        context.close()
                        print(f'{combo}: launcher not found')
                        return 3

                    click_time = time.time()
                    launcher.click()
                    controls_id = launcher.get_attribute('aria-controls')
                    if controls_id:
                        menu = page.query_selector(f'#{controls_id}')
                        first_item = menu.query_selector('button, a') if menu else None
                        if first_item:
                            first_item.click()
                        else:
                            findings.append(f'{combo}: no clickable menu item found in #{controls_id}')
                    else:
                        findings.append(f'{combo}: launcher missing aria-controls')

                    iframe_found = False
                    deadline = time.time() + 15
                    while time.time() < deadline:
                        for fr in page.frames:
                            try:
                                host = urlparse(fr.url).hostname
                            except Exception:
                                host = None
                            if host == CHAT_HOST:
                                iframe_found = True
                                break
                        if iframe_found:
                            break
                        page.wait_for_timeout(500)
                    if not iframe_found:
                        findings.append(f'{combo}: no chat iframe (host={CHAT_HOST}) appeared within 15s')

                    csp_violations = page.evaluate('window.__cspViolations || []')
                    if csp_violations:
                        findings.append(f'{combo}: {len(csp_violations)} securitypolicyviolation event(s): {csp_violations[:3]}')
                    if console_csp_msgs:
                        findings.append(f'{combo}: {len(console_csp_msgs)} CSP console error(s): {console_csp_msgs[:3]}')

                    pre_click = [
                        u for (t, u) in requests_log
                        if t < click_time and (urlparse(u).hostname == CHAT_HOST)
                    ]
                    if pre_click:
                        findings.append(f'{combo}: chat-host request(s) happened before click: {pre_click[:3]}')

                    context.close()
            finally:
                browser.close()
    except Exception as e:
        print(f'INFRA ERROR: {e}', file=sys.stderr)
        return 2

    print(f'click: {checked} locale x page combos checked, {len(findings)} findings')
    for f_ in findings:
        print('FINDING:', f_)
    return 1 if findings else 0


def _find_chat_frame(page):
    for fr in page.frames:
        try:
            if urlparse(fr.url).hostname == CHAT_HOST:
                return fr
        except Exception:
            continue
    return None


def _wait_until(page, predicate, timeout_s: float = 15.0, step_ms: int = 300):
    """Poll predicate() until it returns a truthy value or timeout_s elapses."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            value = predicate()
        except Exception:
            value = None
        if value:
            return value
        page.wait_for_timeout(step_ms)
    return None


def do_send_message(base: str, text: str, email: str, locale: str, name: str) -> int:
    """Drive the production widget end to end: open the launcher menu, start
    the conversation, fill the pre-chat form inside the chat iframe (email,
    optional name, message), submit, and wait for the message to show in the
    thread. Each step has a 15 s budget; any timeout exits 1. The pre-chat
    fields are located by their stable `name` attributes (emailAddress,
    fullName, message), never by visible label text, so this works in every
    locale. Prints sent_at=<ISO> once the message is visible in the thread."""
    if not email:
        print('INFRA ERROR: --send-message needs --email ADDR (use an example.com address)', file=sys.stderr)
        return 2
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            try:
                # Fresh context per conversation: no widget cookies or storage
                # carry over, so each run is a new contact and a new conversation.
                context = browser.new_context()
                context.add_init_script(CONSENT_SEED_JS)
                page = context.new_page()
                page.goto(page_url(base, locale, '/'), wait_until='load', timeout=60000)
                page.wait_for_timeout(500)

                launcher = page.query_selector(LAUNCHER_SELECTOR)
                if not launcher:
                    print('FINDING: launcher not found')
                    return 3
                launcher.click()
                controls_id = launcher.get_attribute('aria-controls')
                menu = page.query_selector(f'#{controls_id}') if controls_id else None
                first_item = menu.query_selector('button, a') if menu else None
                if not first_item:
                    print('FINDING: no clickable menu item in the launcher menu')
                    return 1
                first_item.click()

                frame = _wait_until(page, lambda: _find_chat_frame(page))
                if not frame:
                    print(f'FINDING: no chat iframe (host={CHAT_HOST}) within 15s')
                    return 1

                # Welcome screen first (a submit button), then the pre-chat form.
                email_input = frame.locator('input[name="emailAddress"]')
                shown = _wait_until(
                    page,
                    lambda: email_input.count() > 0 and email_input.first.is_visible(),
                    timeout_s=3.0,
                )
                if not shown:
                    start = frame.locator('button:visible').last
                    if not _wait_until(page, lambda: start.count() > 0 and start.is_visible()):
                        print('FINDING: welcome screen start button not found within 15s')
                        return 1
                    start.click()
                    if not _wait_until(page, lambda: email_input.count() > 0 and email_input.first.is_visible()):
                        print('FINDING: pre-chat email field not shown within 15s')
                        return 1

                email_input.first.fill(email)
                name_input = frame.locator('input[name="fullName"]')
                if name_input.count() > 0 and name_input.first.is_visible():
                    name_input.first.fill(name)
                message_input = frame.locator('textarea[name="message"]')
                if not _wait_until(page, lambda: message_input.count() > 0 and message_input.first.is_visible()):
                    print('FINDING: pre-chat message field not shown within 15s')
                    return 1
                message_input.first.fill(text)

                # The pre-chat form's submit is the last visible submit button
                # that is not the welcome screen's.
                submit = frame.locator('button:visible').last
                sent_at = iso_now()
                submit.click()

                needle = text.strip()[:40]
                if not _wait_until(page, lambda: needle in frame.evaluate('() => document.body.innerText')):
                    print('FINDING: message did not appear in the thread within 15s')
                    return 1
                print(f'sent_at={sent_at}')
                # Give the server a moment to create the conversation and fire
                # its automation rules before the browser context is closed.
                page.wait_for_timeout(2000)
                context.close()
            finally:
                browser.close()
    except Exception as e:
        print(f'INFRA ERROR: {e}', file=sys.stderr)
        return 2
    return 0


def do_overlap(base: str, pages) -> int:
    findings = []
    checked = 0
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            try:
                context = browser.new_context(viewport={'width': 375, 'height': 812})
                context.add_init_script(
                    "try { localStorage.setItem('prestigo_consent_v2', JSON.stringify({analytics:false,marketing:false})) } catch (e) {}"
                )
                page = context.new_page()
                for path in pages:
                    url = base + path
                    try:
                        page.goto(url, wait_until='load', timeout=60000)
                        page.wait_for_timeout(1000)
                    except Exception as e:
                        findings.append(f'{path}: navigation error {e}')
                        continue
                    checked += 1
                    launcher = page.query_selector(LAUNCHER_SELECTOR)
                    if not launcher:
                        continue  # nothing to check yet — launcher not deployed
                    result = page.evaluate(OVERLAP_JS, LAUNCHER_SELECTOR)
                    for item in result:
                        findings.append(f'{path}: launcher overlaps {item}')
                context.close()
            finally:
                browser.close()
    except Exception as e:
        print(f'INFRA ERROR: {e}', file=sys.stderr)
        return 2

    print(f'overlap: {checked} pages checked, {len(findings)} findings')
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
    mode.add_argument('--consent', action='store_true', help='assert zero chat-host traffic/cookies/storage before a click')
    mode.add_argument('--click', action='store_true', help='click the launcher and assert a clean CSP/iframe result')
    mode.add_argument('--overlap', action='store_true', help='assert the launcher never covers a fixed/sticky control at 375px')
    mode.add_argument('--send-message', metavar='TEXT', default=None, help='open the widget, fill the pre-chat form and send TEXT (needs --email)')
    parser.add_argument('--email', default=None, help='(--send-message) contact email for the pre-chat form; use an example.com address')
    parser.add_argument('--name', default='QA Probe', help='(--send-message) contact name for the pre-chat form')
    parser.add_argument('--locale', default='en', help='(--send-message) site locale to open (default en)')
    parser.add_argument('--expect-launcher', action='store_true', help='(--consent) also assert exactly one launcher button exists, correctly positioned')
    parser.add_argument('--locales', default=None, help='comma-separated locale list (default: all 7)')
    parser.add_argument('--pages', default=None, help='comma-separated page-path list')
    args = parser.parse_args()

    base = args.base_url.rstrip('/')
    locales = parse_csv(args.locales, LOCALES)

    if args.send_message is not None:
        return do_send_message(base, args.send_message, args.email, args.locale, args.name)
    if args.cwv_capture:
        return do_cwv_capture(base)
    if args.cwv_compare:
        return do_cwv_compare(base)
    if args.consent:
        pages = parse_pages_csv(args.pages, DEFAULT_PAGES)
        return do_consent(base, locales, pages, args.expect_launcher)
    if args.click:
        pages = parse_pages_csv(args.pages, DEFAULT_PAGES)
        return do_click(base, locales, pages)
    if args.overlap:
        pages = parse_pages_csv(args.pages, DEFAULT_OVERLAP_PAGES)
        return do_overlap(base, pages)

    parser.error('no mode selected')
    return 2


if __name__ == '__main__':
    sys.exit(main())
