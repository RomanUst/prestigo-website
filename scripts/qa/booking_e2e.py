#!/usr/bin/env python3
"""booking_e2e.py -- Guest/account booking E2E driver (D-01..D-04).

Drives a real guest checkout through all 6 wizard steps on production, up to
the point where the Stripe Payment Element iframe is rendered and visible --
then STOPS. Never clicks the pay button, never types into Stripe's own
fields. Every booking carries the E2E/TEST marker (D-03) and its
bookingReference is recorded for strict cleanup. Also drives the signed-in
"My trips" + booking path in RU/AR via --account (D-04), and captures the
Stripe Elements locale + Google Places autocomplete language per locale
(D-07 surface 4).

Usage:
  python3 scripts/qa/booking_e2e.py [base_url] [--locales en,ru,...] [--account ru,ar] [--headed]

Requires Python Playwright and an already-installed `certifi`-backed TLS
context is NOT needed here (this script is browser-only, unlike the urllib
QA scripts in this directory). Writes:
  scripts/qa/out/booking_e2e.json               -- {"runs": [...]}
  scripts/qa/out/booking_e2e_refs.json          -- [{ref, locale, path, createdAt}], deduped
  scripts/qa/out/booking_e2e_<locale>_<path>.png -- screenshot of the rendered Stripe form

NOTE (deviation from plan's read_first list): the booking wizard's EntryBar
(Step 1) imports AddressInput.tsx (the legacy @googlemaps/js-api-loader
component), NOT AddressInputNew.tsx -- AddressInputNew is only wired into the
homepage BookingWidget/DayCard behind NEXT_PUBLIC_USE_NEW_PLACES_API. Both
ultimately call the same places.googleapis.com v1 Places RPC
(POST $rpc/google.maps.places.v1.Places/AutocompletePlaces, a positional JSON
array body whose 6th element -- index 5 -- is the language code), so the
network-level languageCode capture (Task 2) works identically either way;
only the read_first assumption was off, not the runtime behaviour.
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
ACCOUNT_CREDS_PATH = os.path.join(ROOT, "scripts", "qa", ".e2e-account.json")

# ---------------------------------------------------------------------------
# D-07 surface 4: expected locale-following behaviour once the pre-fix
# hardcodes (Step6Payment.tsx `locale: 'en'`, AddressInput.tsx `language:
# 'en'`) are corrected by a later plan (75-05). Stripe Elements has no Hindi
# locale (docs.stripe.com/js/appendix/supported_locales) -- 'auto' is the
# accepted exception there, never a pass/fail bar (75-RESEARCH.md Pitfall 1).
# Google Places supports all 7 locales; zh uses the zh-CN region form.
# ---------------------------------------------------------------------------
EXPECTED_STRIPE_LOCALE = {"en": "en", "ru": "ru", "es": "es", "fr": "fr", "ar": "ar", "zh": "zh", "hi": "auto"}
EXPECTED_PLACES_LANGUAGE = {"en": "en", "ru": "ru", "es": "es", "fr": "fr", "ar": "ar", "hi": "hi", "zh": "zh-CN"}

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


def blank_result(locale: str, path: str) -> dict:
    return {
        "locale": locale,
        "path": path,
        "reachedStripe": False,
        "bookingReference": "",
        "stripeLocaleParam": None,
        "stripeFieldLabel": None,
        "expectedStripeLocale": EXPECTED_STRIPE_LOCALE.get(locale),
        "placesLanguage": None,
        "expectedPlacesLanguage": EXPECTED_PLACES_LANGUAGE.get(locale),
        "localeChecksPassed": None,
        "htmlLang": None,
        "htmlDir": None,
        "durationMs": None,
        "skipped": False,
        "reason": None,
        "error": None,
    }


def check_locale_results(result: dict, locale: str) -> None:
    """Compare captured vs expected Stripe/Places locale values (D-07 surface
    4). Hindi has no Stripe locale at all (Pitfall 1) -- it is an accepted
    exception, never scored as a failure on the Stripe half of the check."""
    stripe_ok = True
    if locale != "hi":
        stripe_ok = result["stripeLocaleParam"] == result["expectedStripeLocale"]
    places_ok = result["placesLanguage"] == result["expectedPlacesLanguage"]
    result["localeChecksPassed"] = bool(stripe_ok and places_ok)


# ---------------------------------------------------------------------------
# Places-language capture -- POST $rpc/google.maps.places.v1.Places/AutocompletePlaces,
# a positional JSON array body: [input, locationBias, locationRestriction,
# origin, includedRegionCodes, language, ...]. Index 5 is the language code
# regardless of whether the legacy AddressInput.tsx or AddressInputNew.tsx
# code path triggered it -- both ultimately call this same RPC.
# ---------------------------------------------------------------------------
def try_extract_places_language(post_data: str):
    try:
        arr = json.loads(post_data)
    except Exception:
        return None
    if isinstance(arr, list) and len(arr) > 5 and isinstance(arr[5], str) and 1 <= len(arr[5]) <= 8:
        return arr[5]
    return None


# ---------------------------------------------------------------------------
# Shared step helpers
# ---------------------------------------------------------------------------
def wait_maps_ready(page) -> None:
    # AddressInput.tsx lazy-loads the Google Maps JS SDK on mount; typing
    # before it finishes leaves `mapsLoaded` false, fetchSuggestions()
    # early-returns, and no listbox ever appears (no retry on a stale
    # debounce) -- reproduced 2/4 runs before this explicit readiness wait.
    page.wait_for_function(
        "() => window.google && window.google.maps && window.google.maps.places "
        "&& window.google.maps.places.AutocompleteSuggestion",
        timeout=20000,
    )


def fill_entry_bar(page, locale: str) -> None:
    # NOTE: the native <select id="entry-bar-time"> also exposes role="option"
    # for its 97 <option> children, so option locators MUST be scoped to the
    # specific address listbox (matched by its own aria-label), never global.
    origin_label = t(locale, "Booking.entryBar.pickupAriaLabel")
    dest_label = t(locale, "Booking.entryBar.destinationAriaLabel")
    clear_label = t(locale, "Booking.addressInput.clearAddress")

    # handleSelect() awaits an async place-details fetch before committing the
    # selection to the store -- the "Clear address" (X) button only renders
    # once `value !== null`, so waiting for it (not a fixed sleep) is the
    # deterministic signal that the async selection has landed. Without this
    # wait, submitting immediately races the fetch and the wizard silently
    # stays on step 1 (validate() sees origin/destination still null) --
    # reproduced 2/3 runs locally before this fix.
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


def select_vehicle(page) -> None:
    select_cta = page.locator("button.btn-primary:visible").first
    select_cta.wait_for(state="visible", timeout=20000)
    page.wait_for_function("(el) => el && !el.disabled", arg=select_cta.element_handle(), timeout=20000)
    select_cta.click()


def fill_passenger(page, locale: str, path: str) -> None:
    # For the account path, this OVERWRITES whatever Step5Passenger's own
    # profile pre-fill effect wrote (full_name/phone/email from
    # customer_profiles) -- filling AFTER a short settle wait guarantees our
    # marker values are the last write, so the created row still matches the
    # strict D-03 cleanup filter even when signed in.
    page.fill("#firstName", "E2E")
    page.fill("#lastName", "TEST")
    page.fill("#email", marker_email(locale, path))
    page.fill("#phone", "+420700000000")


def wait_for_stripe_and_capture(page, locale: str, path: str, result: dict) -> None:
    stripe_frame_el = page.locator('iframe[src*="js.stripe.com"][src*="elements-inner"]').first
    stripe_frame_el.wait_for(state="visible", timeout=60000)
    # Let the Payment Element's own internal load finish (card fields replace
    # the "Loading..." skeleton) before the screenshot -- a short, bounded
    # wait; the iframe presence check above is already the real gate, this
    # only improves the screenshot's usefulness.
    page.wait_for_timeout(2000)

    result["htmlLang"] = page.evaluate("document.documentElement.lang")
    result["htmlDir"] = page.evaluate("document.documentElement.dir || 'ltr'")

    src = stripe_frame_el.get_attribute("src") or ""
    m = re.search(r"[?&#]locale=([a-zA-Z-]+)", src)
    result["stripeLocaleParam"] = m.group(1) if m else None
    if result["stripeLocaleParam"] is None:
        # Fallback (RESEARCH.md D-07 note): if Stripe ever stops exposing the
        # locale in the iframe src, fall back to the visible field label text
        # -- best-effort only; None is an acceptable recorded value (the key
        # is always present, per the plan's acceptance criteria).
        try:
            label = page.frame_locator('iframe[src*="js.stripe.com"][src*="elements-inner"]').first.get_by_text(
                re.compile(".+"), exact=False
            ).first.text_content(timeout=2000)
            result["stripeFieldLabel"] = label
        except Exception:
            pass

    page.screenshot(path=os.path.join(OUT_DIR, f"booking_e2e_{locale}_{path}.png"), full_page=True)
    result["reachedStripe"] = True


# ---------------------------------------------------------------------------
# Guest booking flow -- steps 1-5, then wait for the Stripe form at step 6.
# ---------------------------------------------------------------------------
def run_guest_booking(page, base_url: str, locale: str, places_capture: dict) -> dict:
    result = blank_result(locale, "guest")
    start = time.monotonic()
    try:
        url = url_for(base_url, locale, "/book")
        page.goto(url, wait_until="load", timeout=60000)
        wait_maps_ready(page)

        places_capture.pop("language", None)
        fill_entry_bar(page, locale)
        result["placesLanguage"] = places_capture.get("language")

        select_vehicle(page)

        # ---- Step 3: Auth -- continue as guest ----
        guest_label = t(locale, "Auth.inWizard.continueAsGuest")
        page.get_by_role("button", name=guest_label, exact=True).click()

        # ---- Step 4: Extras -- keep defaults, advance via generic Continue ----
        page.locator("button.btn-primary:visible").first.click()

        # ---- Step 5: Passenger (D-03 marker) ----
        fill_passenger(page, locale, "guest")
        page.locator("button.btn-primary:visible").first.click()

        # ---- Step 6: wait for the Stripe Payment Element iframe (no interaction) ----
        wait_for_stripe_and_capture(page, locale, "guest", result)
        check_locale_results(result, locale)

    except (PWTimeout, Exception) as e:  # noqa: BLE001 -- QA script: never crash the whole run
        result["error"] = str(e)[:300]

    result["durationMs"] = int((time.monotonic() - start) * 1000)
    return result


# ---------------------------------------------------------------------------
# Account (signed-in) flow: sign in -> verify "My trips" -> booking to Stripe.
# ---------------------------------------------------------------------------
def sign_in_password(page, base_url: str, locale: str, creds: dict) -> None:
    login_url = url_for(base_url, locale, "/login")
    page.goto(login_url, wait_until="load", timeout=60000)

    tab_label = t(locale, "Auth.login.tabUsePassword")
    page.get_by_role("button", name=tab_label, exact=True).click()

    # Fixed ids regardless of locale (app/[locale]/login/page.tsx).
    page.fill("#pw-email", creds["email"])
    page.fill("#pw-password", creds["password"])  # never logged -- see module docstring
    page.locator('button[type="submit"]:visible').first.click()
    page.wait_for_load_state("load", timeout=30000)


LATIN_RUN_RE = re.compile(r"\b[A-Za-z]{2,}\b(?:\s+\b[A-Za-z]{2,}\b)+")


def load_en_leak_allowlist() -> set:
    """Best-effort DNT set for the trips-page Latin-leak spot-check (D-06/D-09
    shape). The account/trips page is auth-gated and not covered by
    en_leak_rendered.py's page list, so this is a lightweight, scoped
    reuse of the same allowlist rather than a full second scanner."""
    path = os.path.join(ROOT, "scripts", "qa", "en_leak_allowlist.json")
    if not os.path.exists(path):
        return set()
    try:
        data = json.load(open(path, encoding="utf-8"))
    except Exception:
        return set()
    values = set()
    for key in ("dnt", "placeNames", "tierNames"):
        for entry in data.get(key, []):
            v = entry.get("value") if isinstance(entry, dict) else entry
            if v:
                values.add(v)
    return values


def trips_page_has_latin_leak(page, locale: str) -> bool:
    if locale in ("en", "es", "fr"):
        return False  # Latin-script locales -- this spot-check targets non-Latin scripts only
    allow = load_en_leak_allowlist()
    text = page.inner_text("body")
    for run in LATIN_RUN_RE.findall(text):
        if run in allow or any(run in a or a in run for a in allow):
            continue
        return True
    return False


def run_account_booking(page, base_url: str, locale: str, creds: dict, places_capture: dict) -> dict:
    result = blank_result(locale, "account")
    start = time.monotonic()
    try:
        sign_in_password(page, base_url, locale, creds)

        trips_url = url_for(base_url, locale, "/account/trips")
        page.goto(trips_url, wait_until="load", timeout=30000)
        page.get_by_text(t(locale, "Account.trips.heading"), exact=False).wait_for(state="visible", timeout=15000)
        result["htmlLang"] = page.evaluate("document.documentElement.lang")
        result["tripsPageLatinLeak"] = trips_page_has_latin_leak(page, locale)

        url = url_for(base_url, locale, "/book")
        page.goto(url, wait_until="load", timeout=60000)
        wait_maps_ready(page)

        places_capture.pop("language", None)
        fill_entry_bar(page, locale)
        result["placesLanguage"] = places_capture.get("language")

        select_vehicle(page)

        # ---- Step 3: signed-in -- Step3Auth's own mount effect auto-advances
        # (getUser() resolves -> setGuestMode(false) -> nextStep()); the
        # signed-in state must NOT be forced through the guest path. Wait for
        # step 4's heading rather than clicking anything.
        page.get_by_text(t(locale, "Booking.bookingWizard.addExtras"), exact=True).wait_for(
            state="visible", timeout=10000
        )

        # ---- Step 4: Extras -- keep defaults ----
        page.locator("button.btn-primary:visible").first.click()

        # ---- Step 5: Passenger -- settle, then overwrite with the D-03 marker ----
        page.wait_for_timeout(1500)
        fill_passenger(page, locale, "account")
        page.locator("button.btn-primary:visible").first.click()

        wait_for_stripe_and_capture(page, locale, "account", result)
        check_locale_results(result, locale)

    except (PWTimeout, Exception) as e:  # noqa: BLE001
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
    account_locales = [l.strip() for l in args.account.split(",") if l.strip()]

    account_creds = None
    if account_locales:
        if os.path.exists(ACCOUNT_CREDS_PATH):
            try:
                account_creds = json.load(open(ACCOUNT_CREDS_PATH, encoding="utf-8"))
            except Exception:
                account_creds = None

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

        # Response listener -- captures bookingReference + HTTP status (D-03,
        # 429 backoff) from every /api/create-payment-intent call.
        captured = {}

        def on_response(response):
            if "/api/create-payment-intent" in response.url and response.request.method == "POST":
                try:
                    body = response.json()
                except Exception:
                    body = {}
                captured["last"] = {"status": response.status, "body": body}

        page.on("response", on_response)

        # Request listener -- captures the Places autocomplete language code
        # (see try_extract_places_language docstring for the RPC body shape).
        places_capture = {}

        def on_request(request):
            if "places.googleapis.com" in request.url and request.method == "POST":
                lang = try_extract_places_language(request.post_data or "")
                if lang and "language" not in places_capture:
                    places_capture["language"] = lang

        page.on("request", on_request)

        # Pacing (>= 20s between create-payment-intent-triggering runs) and a
        # single 429 retry after a 65s cool-down -- keeps the production rate
        # limiter (checkRateLimit('/api/create-payment-intent', ip)) happy.
        last_run_end = None

        def paced_run(run_fn, *fn_args):
            nonlocal last_run_end
            if last_run_end is not None:
                elapsed = time.monotonic() - last_run_end
                if elapsed < 20:
                    time.sleep(20 - elapsed)
            captured.pop("last", None)
            result = run_fn(*fn_args)
            status = (captured.get("last") or {}).get("status")
            if status == 429:
                time.sleep(65)
                captured.pop("last", None)
                result = run_fn(*fn_args)
                status = (captured.get("last") or {}).get("status")
            last = captured.get("last") or {}
            body = last.get("body") or {}
            ref = body.get("bookingReference", "")
            if ref:
                result["bookingReference"] = ref
                record_ref(ref, result["locale"], result["path"])
            last_run_end = time.monotonic()
            return result

        for locale in locales:
            runs.append(paced_run(run_guest_booking, page, args.base_url, locale, places_capture))

        for locale in account_locales:
            if account_creds is None:
                r = blank_result(locale, "account")
                r["skipped"] = True
                r["reason"] = "account credentials missing"
                runs.append(r)
                continue
            runs.append(paced_run(run_account_booking, page, args.base_url, locale, account_creds, places_capture))

        browser.close()

    json.dump({"runs": runs}, open(RESULTS_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    ok = True
    for r in runs:
        if r["skipped"]:
            print(f"[SKIP] {r['locale']}/{r['path']} reason={r['reason']}")
            continue
        status = "OK" if r["reachedStripe"] else "FAIL"
        if not r["reachedStripe"]:
            ok = False
        print(
            f"[{status}] {r['locale']}/{r['path']} ref={r['bookingReference']!r} "
            f"stripeLocale={r['stripeLocaleParam']!r} placesLang={r['placesLanguage']!r} "
            f"dir={r['htmlDir']!r} localeChecksPassed={r['localeChecksPassed']!r} "
            f"err={r['error']!r} ({r['durationMs']}ms)"
        )

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
