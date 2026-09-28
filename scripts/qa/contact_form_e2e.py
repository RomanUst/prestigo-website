#!/usr/bin/env python3
"""contact_form_e2e.py -- Production page-render + contact-form submission check
(Phase 76 plan 07, D-19(a) / INFRA-03 outage proof).

Verifies, during the controlled VPS outage, that the public site keeps
rendering (/, /book, /contact, /ru) and that the contact form still submits
successfully to /api/contact (Resend email to MANAGER_EMAIL -- no DB row),
entirely independent of chat.rideprestigo.com / crm.rideprestigo.com. Records
every request URL for the whole browser context and fails the run if any
recorded request host is chat.rideprestigo.com or crm.rideprestigo.com
(T-76-31 -- proves the site has no hidden runtime dependency on the VPS
apps).

Usage:
  python3 scripts/qa/contact_form_e2e.py [base_url] [--headed]

Requires Python Playwright (same runtime as booking_e2e.py -- no new
install). Reuses booking_e2e.should_abort_analytics so this run never fires a
real GA4/Meta hit, and its messages/<locale>.json label resolver so the
success-heading locator comes from the same source of truth as the UI text
(a stale English label would fail the locator, same leak-detector property
booking_e2e.py relies on). Writes:
  scripts/qa/out/contact_form_e2e.json -- {pages, submitted, successVisible,
                                             vpsRequests, startedAt, finishedAt}

Exit 0 on success, 1 on any failure (unexpected page status, submit
exception, missing success heading, or any VPS-host request recorded).
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from urllib.parse import urlparse

from playwright.sync_api import TimeoutError as PWTimeout
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from booking_e2e import should_abort_analytics, t  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, "scripts", "qa", "out")
os.makedirs(OUT_DIR, exist_ok=True)
RESULTS_PATH = os.path.join(OUT_DIR, "contact_form_e2e.json")

# T-76-31: the runtime complement to the plan-01 source-level guard -- a
# request to either VPS-hosted app during this check means the site has a
# hidden runtime dependency on infrastructure this outage test just proved
# offline.
VPS_HOSTS = {"chat.rideprestigo.com", "crm.rideprestigo.com"}

PAGES = ["/", "/book", "/contact", "/ru"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Contact form + page-render outage check (D-19a)")
    parser.add_argument("base_url", nargs="?", default="https://rideprestigo.com")
    parser.add_argument("--headed", action="store_true")
    args = parser.parse_args()

    started_at = datetime.now(timezone.utc).isoformat()
    result = {
        "pages": [],
        "submitted": False,
        "successVisible": False,
        "vpsRequests": [],
        "startedAt": started_at,
        "finishedAt": None,
    }

    ok = True

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        context = browser.new_context(viewport={"width": 1280, "height": 900}, locale="en-US")
        context.add_init_script(
            "localStorage.setItem('prestigo_consent_v2', JSON.stringify({analytics:false,marketing:false}))"
        )

        def on_request(request):
            host = urlparse(request.url).hostname or ""
            if host in VPS_HOSTS:
                result["vpsRequests"].append(request.url)

        context.on("request", on_request)
        context.route(
            "**/*",
            lambda route: route.abort() if should_abort_analytics(route.request.url) else route.continue_(),
        )

        page = context.new_page()

        try:
            for path in PAGES:
                url = f"{args.base_url}{path}"
                resp = page.goto(url, wait_until="load", timeout=30000)
                status = resp.status if resp else None
                result["pages"].append({"url": url, "status": status})
                if status != 200:
                    ok = False

            # Re-visit /contact fresh (in case an earlier page in PAGES left
            # the SPA on a different route) before filling the form.
            contact_url = f"{args.base_url}/contact"
            page.goto(contact_url, wait_until="load", timeout=30000)

            page.fill("#name", "E2E Outage Test (Phase 76)")
            page.fill("#email", "e2e+outage@rideprestigo.com")
            page.fill("#phone", "+420700000000")
            page.fill("#message", "Phase 76 VPS outage test - please ignore")

            # Any required <select> on the page: pick its first real
            # (non-empty) option. ContactForm's own service select is not
            # `required` today, so this is a no-op in the current UI and a
            # forward-compatible guard if that ever changes.
            for select in page.locator("select:not([disabled])").all():
                if select.get_attribute("required") is None:
                    continue
                options = select.locator("option")
                for i in range(options.count()):
                    val = options.nth(i).get_attribute("value")
                    if val:
                        select.select_option(val)
                        break

            page.locator('button[type="submit"]:visible').first.click()
            result["submitted"] = True

            success_heading = t("en", "ContactForm.success.heading")
            page.get_by_text(success_heading, exact=False).wait_for(state="visible", timeout=15000)
            result["successVisible"] = True

        except (PWTimeout, Exception) as e:  # noqa: BLE001 -- QA script: never crash mid-run
            print(f"[ERROR] {e}", file=sys.stderr)
            ok = False

        browser.close()

    if result["vpsRequests"]:
        ok = False

    result["finishedAt"] = datetime.now(timezone.utc).isoformat()
    json.dump(result, open(RESULTS_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(
        f"[{'OK' if ok else 'FAIL'}] pages={result['pages']} submitted={result['submitted']} "
        f"successVisible={result['successVisible']} vpsRequests={result['vpsRequests']}"
    )

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
