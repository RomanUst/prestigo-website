#!/usr/bin/env python3
"""booking_e2e.py -- Guest/account booking E2E driver (D-01..D-04).

Drives a real guest checkout through all 6 wizard steps on production, up to
the point where the Stripe Payment Element iframe is rendered and visible --
then STOPS. Never clicks the pay button, never types into Stripe's own
fields. Every booking carries the E2E/TEST marker (D-03) and its
bookingReference is recorded for strict cleanup.

Usage:
  python3 scripts/qa/booking_e2e.py [base_url] [--locales en,ru,...] [--account ru,ar] [--headed]

Requires Python Playwright. Writes:
  scripts/qa/out/booking_e2e.json               -- {"runs": [...]}
  scripts/qa/out/booking_e2e_refs.json          -- [{ref, locale, path, createdAt}], deduped
  scripts/qa/out/booking_e2e_<locale>_<path>.png -- screenshot of the rendered Stripe form

NOTE (deviation from plan's read_first list): the booking wizard's EntryBar
(Step 1) imports AddressInput.tsx (the legacy @googlemaps/js-api-loader
component), NOT AddressInputNew.tsx -- AddressInputNew is only wired into the
homepage BookingWidget/DayCard behind NEXT_PUBLIC_USE_NEW_PLACES_API. Both
ultimately call the same places.googleapis.com v1 autocomplete REST endpoint,
so the network-level languageCode capture (Task 2) works identically either
way; only the read_first assumption was off, not the runtime behaviour.
"""
import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, "scripts", "qa", "out")
os.makedirs(OUT_DIR, exist_ok=True)

REFS_PATH = os.path.join(OUT_DIR, "booking_e2e_refs.json")
RESULTS_PATH = os.path.join(OUT_DIR, "booking_e2e.json")

# ---------------------------------------------------------------------------
# Locale message resolver -- every locator's TEXT comes from messages/<locale>.json
# so a label still in English on a localized page makes the locator fail (the
# flow itself is a leak detector, per the plan's D-01/D-07 intent).
# ---------------------------------------------------------------------------
_MESSAGES_CACHE: dict = {}


def load_messages(locale: str) -> dict:
    if locale not in _MESSAGES_CACHE:
        path = os.path.join(ROOT, "messages", f"{locale}.json")
        with open(path, encoding="utf-8") as f:
            _MESSAGES_CACHE[locale] = json.load(f)
    return _MESSAGES_CACHE[locale]


def t(locale: str, dotted_key: str, **params) -> str:
    """Resolve a dotted Booking.*/Auth.*/Account.* key. Minimal named-ICU
    substitution ({name} -> value) -- sufficient for the fixed-shape labels
    this script needs; no plural/select handling."""
    obj = load_messages(locale)
    for part in dotted_key.split("."):
        obj = obj[part]
    text = obj
    for k, v in params.items():
        text = text.replace("{" + k + "}", str(v))
    return text


def url_for(base: str, locale: str, path: str) -> str:
    prefix = "" if locale == "en" else f"/{locale}"
    return f"{base}{prefix}{path}"


# ---------------------------------------------------------------------------
# Analytics abort -- a QA run must never send real GA4/Meta hits (D-01 scope
# note, mirrors overflow_audit.py's consent-init pattern plus a network abort).
# ---------------------------------------------------------------------------
def should_abort_analytics(url: str) -> bool:
    return (
        "google-analytics.com" in url
        or ("googletagmanager.com" in url and "collect" in url)
        or "facebook.com/tr" in url
        or "connect.facebook.net" in url
    )


# ---------------------------------------------------------------------------
# E2E marker (D-03) -- every created row must carry this exact marker so
# cleanup (plan 75-20) can match strictly.
# ---------------------------------------------------------------------------
def marker_email(locale: str, path: str) -> str:
    return f"e2e+account-{locale}@rideprestigo.com" if path == "account" else f"e2e+{locale}@rideprestigo.com"


def pickup_date_str(days_ahead: int = 3) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days_ahead)).strftime("%Y-%m-%d")


def record_ref(ref: str, locale: str, path: str) -> None:
    """Append {ref, locale, path, createdAt} to the refs file, deduped by ref."""
    if not ref:
        return
    refs = []
    if os.path.exists(REFS_PATH):
        try:
            refs = json.load(open(REFS_PATH, encoding="utf-8"))
        except Exception:
            refs = []
    if any(r.get("ref") == ref for r in refs):
        return
    refs.append({"ref": ref, "locale": locale, "path": path, "createdAt": datetime.now(timezone.utc).isoformat()})
    json.dump(refs, open(REFS_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


# ---------------------------------------------------------------------------
# Guest booking flow -- steps 1-5, then wait for the Stripe form at step 6.
# ---------------------------------------------------------------------------
def run_guest_booking(page, base_url: str, locale: str) -> dict:
    result = {
        "locale": locale,
        "path": "guest",
        "reachedStripe": False,
        "bookingReference": "",
        "stripeLocaleParam": None,
        "htmlLang": None,
        "htmlDir": None,
        "durationMs": None,
        "error": None,
    }
    start = time.monotonic()
    try:
        url = url_for(base_url, locale, "/book")
        page.goto(url, wait_until="load", timeout=60000)
        # AddressInput.tsx lazy-loads the Google Maps JS SDK on mount; typing
        # before it finishes leaves `mapsLoaded` false, fetchSuggestions()
        # early-returns, and no listbox ever appears (no retry on a stale
        # debounce) -- reproduced 2/4 runs before this explicit readiness
        # wait was added.
        page.wait_for_function(
            "() => window.google && window.google.maps && window.google.maps.places "
            "&& window.google.maps.places.AutocompleteSuggestion",
            timeout=20000,
        )

        # ---- Step 1: EntryBar (fixed ids for date/time; aria-label for addresses) ----
        # NOTE: the native <select id="entry-bar-time"> also exposes role="option"
        # for its 97 <option> children, so option locators MUST be scoped to the
        # specific address listbox (matched by its own aria-label), never global.
        origin_label = t(locale, "Booking.entryBar.pickupAriaLabel")
        dest_label = t(locale, "Booking.entryBar.destinationAriaLabel")
        clear_label = t(locale, "Booking.addressInput.clearAddress")

        # handleSelect() awaits an async place-details fetch before committing
        # the selection to the store -- the "Clear address" (X) button only
        # renders once `value !== null`, so waiting for it (not a fixed sleep)
        # is the deterministic signal that the async selection has landed.
        # Without this wait, submitting immediately races the fetch and the
        # wizard silently stays on step 1 (validate() sees origin/destination
        # still null) -- reproduced 2/3 runs locally before this fix.
        origin_input = page.get_by_label(origin_label, exact=True)
        origin_input.fill("Old Town Square, Prague")
        origin_listbox = page.get_by_role("listbox", name=origin_label)
        origin_listbox.wait_for(state="visible", timeout=10000)
        origin_listbox.get_by_role("option").first.click()
        page.get_by_label(clear_label, exact=True).first.wait_for(state="visible", timeout=10000)

        dest_input = page.get_by_label(dest_label, exact=True)
        dest_input.fill("Prague Castle")
        dest_listbox = page.get_by_role("listbox", name=dest_label)
        dest_listbox.wait_for(state="visible", timeout=10000)
        dest_listbox.get_by_role("option").first.click()
        page.get_by_label(clear_label, exact=True).nth(1).wait_for(state="visible", timeout=10000)

        page.fill("#entry-bar-date", pickup_date_str())
        page.select_option("#entry-bar-time", "14:00")

        page.locator("button.btn-primary:visible").first.click()  # "View vehicles"

        # ---- Step 2: Vehicle -- wait for auto-selected price + Select CTA to enable ----
        select_cta = page.locator("button.btn-primary:visible").first
        select_cta.wait_for(state="visible", timeout=20000)
        page.wait_for_function(
            "(el) => el && !el.disabled",
            arg=select_cta.element_handle(),
            timeout=20000,
        )
        select_cta.click()

        # ---- Step 3: Auth -- continue as guest ----
        guest_label = t(locale, "Auth.inWizard.continueAsGuest")
        page.get_by_role("button", name=guest_label, exact=True).click()

        # ---- Step 4: Extras -- keep defaults, advance via generic Continue ----
        page.locator("button.btn-primary:visible").first.click()

        # ---- Step 5: Passenger -- fixed ids regardless of locale (D-03 marker) ----
        page.fill("#firstName", "E2E")
        page.fill("#lastName", "TEST")
        page.fill("#email", marker_email(locale, "guest"))
        page.fill("#phone", "+420700000000")
        page.locator("button.btn-primary:visible").first.click()

        # ---- Step 6: wait for the Stripe Payment Element iframe (no interaction) ----
        stripe_frame_el = page.locator(
            'iframe[src*="js.stripe.com"][src*="elements-inner"]'
        ).first
        stripe_frame_el.wait_for(state="visible", timeout=60000)
        # Let the Payment Element's own internal load finish (card fields
        # replace the "Loading..." skeleton) before the screenshot -- a
        # short, bounded wait; the iframe presence check above is already
        # the real gate, this only improves the screenshot's usefulness.
        page.wait_for_timeout(2000)

        result["htmlLang"] = page.evaluate("document.documentElement.lang")
        result["htmlDir"] = page.evaluate("document.documentElement.dir || 'ltr'")

        src = stripe_frame_el.get_attribute("src") or ""
        m = re.search(r"[?&#]locale=([a-zA-Z-]+)", src)
        result["stripeLocaleParam"] = m.group(1) if m else None

        page.screenshot(path=os.path.join(OUT_DIR, f"booking_e2e_{locale}_guest.png"), full_page=True)
        result["reachedStripe"] = True

    except (PWTimeout, Exception) as e:  # noqa: BLE001 -- QA script: never crash the whole run
        result["error"] = str(e)[:300]

    result["durationMs"] = int((time.monotonic() - start) * 1000)
    return result


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Booking E2E driver (D-01..D-04)")
    parser.add_argument("base_url", nargs="?", default="https://rideprestigo.com")
    parser.add_argument("--locales", default="en")
    parser.add_argument("--account", default="")
    parser.add_argument("--headed", action="store_true")
    args = parser.parse_args()

    locales = [l.strip() for l in args.locales.split(",") if l.strip()]

    runs = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        context = browser.new_context(viewport={"width": 1280, "height": 900}, locale="en-US")
        context.add_init_script(
            "localStorage.setItem('prestigo_consent_v2', JSON.stringify({analytics:false,marketing:false}))"
        )
        context.route(
            "**/*",
            lambda route: route.abort() if should_abort_analytics(route.request.url) else route.continue_(),
        )
        page = context.new_page()

        # Response listener -- captures bookingReference (D-03) from every
        # /api/create-payment-intent call regardless of which locale run triggered it.
        captured = {}

        def on_response(response):
            if "/api/create-payment-intent" in response.url and response.request.method == "POST":
                try:
                    body = response.json()
                except Exception:
                    body = {}
                captured["last"] = {"status": response.status, "body": body}

        page.on("response", on_response)

        for locale in locales:
            captured.pop("last", None)
            run = run_guest_booking(page, args.base_url, locale)
            last = captured.get("last") or {}
            body = last.get("body") or {}
            ref = body.get("bookingReference", "")
            if ref:
                run["bookingReference"] = ref
                record_ref(ref, locale, "guest")
            runs.append(run)

        browser.close()

    json.dump({"runs": runs}, open(RESULTS_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    ok = True
    for r in runs:
        status = "OK" if r["reachedStripe"] else "FAIL"
        if not r["reachedStripe"]:
            ok = False
        print(f"[{status}] {r['locale']}/{r['path']} ref={r['bookingReference']!r} err={r['error']!r} ({r['durationMs']}ms)")

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
