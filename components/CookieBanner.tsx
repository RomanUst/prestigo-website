'use client'

import { useState, useEffect } from 'react'

/**
 * Granular consent modal — two-step design inspired by Blacklane's
 * Usercentrics implementation.
 *
 * Step 1 (collapsed): short description + two actions — "Accept all" and
 *   "More information". No Reject button; this is the default funnel path.
 * Step 2 (expanded): per-category toggles (all pre-enabled) + "Accept all"
 *   and "Save settings". Services tab lists individual vendors.
 *
 * Storage migration:
 *   Legacy key 'prestigo_cookie_consent' stored a single enum ('granted'|'necessary'|'denied').
 *   New key 'prestigo_consent_v2' stores per-category { analytics, marketing }.
 *   Legacy values are auto-migrated on first read so returning visitors don't
 *   see the modal again.
 *
 * Consent Mode v2 mapping:
 *   analytics  → analytics_storage
 *   marketing  → ad_storage, ad_user_data, ad_personalization
 *
 * MetaPixel listens for the 'prestigo:consent-granted' CustomEvent (fired only
 * when marketing is granted) to initialise fbevents.js in-place without reload.
 */

const CONSENT_KEY = 'prestigo_consent_v2'
const LEGACY_KEY = 'prestigo_cookie_consent'

export interface ConsentState {
  analytics: boolean
  marketing: boolean
}

export function getConsent(): ConsentState | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = localStorage.getItem(CONSENT_KEY)
    if (stored) return JSON.parse(stored) as ConsentState

    // One-time migration from the single-enum legacy key.
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy === 'granted') {
      const state: ConsentState = { analytics: true, marketing: true }
      localStorage.setItem(CONSENT_KEY, JSON.stringify(state))
      return state
    }
    if (legacy === 'necessary' || legacy === 'denied') {
      const state: ConsentState = { analytics: false, marketing: false }
      localStorage.setItem(CONSENT_KEY, JSON.stringify(state))
      return state
    }
    return null
  } catch {
    return null
  }
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState<'categories' | 'services'>('categories')
  // Default all toggles on — matches Blacklane pattern. User opts OUT via
  // toggles, never needs a "Reject" button.
  const [analytics, setAnalytics] = useState(true)
  const [marketing, setMarketing] = useState(true)

  useEffect(() => {
    if (!getConsent()) setVisible(true)
  }, [])

  // Body scroll lock while modal is open — Blacklane-style blocking behavior.
  useEffect(() => {
    if (!visible) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [visible])

  function applyConsent(state: ConsentState) {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(state))
      // Mirror into legacy key so any downstream code still reading the old
      // single-enum format keeps working during transition.
      localStorage.setItem(
        LEGACY_KEY,
        state.analytics && state.marketing ? 'granted' : 'necessary',
      )
    } catch {
      /* storage blocked — best effort */
    }

    setVisible(false)

    if (typeof window === 'undefined') return
    const w = window as typeof window & {
      dataLayer?: unknown[]
      gtag?: (...args: unknown[]) => void
    }

    const update = {
      analytics_storage: state.analytics ? 'granted' : 'denied',
      ad_storage: state.marketing ? 'granted' : 'denied',
      ad_user_data: state.marketing ? 'granted' : 'denied',
      ad_personalization: state.marketing ? 'granted' : 'denied',
    }

    if (typeof w.gtag === 'function') {
      w.gtag('consent', 'update', update)
    } else {
      w.dataLayer = w.dataLayer || []
      w.dataLayer.push(['consent', 'update', update])
    }

    if (state.marketing) {
      window.dispatchEvent(
        new CustomEvent('prestigo:consent-granted', { detail: state }),
      )
    }
  }

  const handleAcceptAll = () => applyConsent({ analytics: true, marketing: true })
  const handleSave = () => applyConsent({ analytics, marketing })

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
      className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center"
    >
      {/* Backdrop: blocks clicks on page content. */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative w-full sm:max-w-lg bg-anthracite border border-anthracite-light shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh] sm:rounded-sm"
        style={{ animation: 'fadeUp 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards' }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-anthracite-light flex-shrink-0">
          <h2
            id="consent-title"
            className="font-display font-light text-[24px] sm:text-[26px] text-offwhite leading-tight"
          >
            Privacy Preferences
          </h2>
          <p className="mt-3 font-body font-light text-[12px] text-warmgrey leading-relaxed">
            This site uses third-party technologies to operate the booking
            flow, measure performance, and show relevant ads. You may revoke
            or change your choice at any time.{' '}
            <a
              href="/privacy"
              className="text-copper-light hover:text-copper underline underline-offset-2"
            >
              Privacy Policy
            </a>
            {' · '}
            <a
              href="/terms"
              className="text-copper-light hover:text-copper underline underline-offset-2"
            >
              Legal Notice
            </a>
          </p>
        </div>

        {/* Expanded view: tabs + toggle list. Hidden on first render. */}
        {expanded && (
          <>
            <div className="flex border-b border-anthracite-light flex-shrink-0">
              <button
                type="button"
                onClick={() => setTab('categories')}
                className={`flex-1 px-4 py-3 font-body font-light text-[10px] tracking-[0.2em] uppercase transition-colors ${
                  tab === 'categories'
                    ? 'text-copper border-b-2 border-copper -mb-px'
                    : 'text-warmgrey hover:text-offwhite'
                }`}
              >
                Categories
              </button>
              <button
                type="button"
                onClick={() => setTab('services')}
                className={`flex-1 px-4 py-3 font-body font-light text-[10px] tracking-[0.2em] uppercase transition-colors ${
                  tab === 'services'
                    ? 'text-copper border-b-2 border-copper -mb-px'
                    : 'text-warmgrey hover:text-offwhite'
                }`}
              >
                Services
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {tab === 'categories' ? (
                <div className="space-y-5">
                  <CategoryRow
                    title="Essential"
                    description="Required for booking, payments, fraud prevention, and core site functionality. Always on."
                    checked
                    disabled
                  />
                  <CategoryRow
                    title="Analytics"
                    description="Google Analytics 4 — helps us understand how visitors use the site so we can improve it. Data is aggregated and anonymous."
                    checked={analytics}
                    onChange={setAnalytics}
                  />
                  <CategoryRow
                    title="Marketing"
                    description="Meta Pixel and Google Ads conversion tracking — measures ad performance and lets us show relevant offers on Instagram, Facebook, and Google."
                    checked={marketing}
                    onChange={setMarketing}
                  />
                </div>
              ) : (
                <div className="space-y-5">
                  <ServiceRow
                    title="Stripe"
                    category="Essential"
                    description="Payment processing and fraud prevention."
                  />
                  <ServiceRow
                    title="Supabase"
                    category="Essential"
                    description="Booking database, authentication, and session management."
                  />
                  <ServiceRow
                    title="Google Maps"
                    category="Essential"
                    description="Address autocomplete and route distance calculation."
                  />
                  <ServiceRow
                    title="Google Analytics 4"
                    category="Analytics"
                    description="Traffic statistics and user behaviour analysis. Consent Mode v2 — runs anonymously if declined."
                  />
                  <ServiceRow
                    title="Meta Pixel"
                    category="Marketing"
                    description="Ad conversion tracking on Instagram and Facebook."
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-anthracite-light flex flex-col gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleAcceptAll}
            className="btn-primary w-full text-[10px] py-3"
          >
            Accept all
          </button>
          {expanded ? (
            <button
              type="button"
              onClick={handleSave}
              className="font-body font-light text-[10px] tracking-[0.15em] uppercase px-4 py-2.5 border border-anthracite-light text-offwhite hover:border-copper hover:text-copper transition-colors"
            >
              Save settings
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="font-body font-light text-[10px] tracking-[0.15em] uppercase px-4 py-2.5 border border-anthracite-light text-warmgrey hover:text-offwhite hover:border-offwhite/40 transition-colors"
            >
              More information
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function CategoryRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange?: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 pb-4 border-b border-anthracite-light/50 last:border-0 last:pb-0">
      <div className="flex-1 min-w-0">
        <h3 className="font-display font-normal text-[16px] text-offwhite">
          {title}
        </h3>
        <p className="mt-1.5 font-body font-light text-[11.5px] text-warmgrey leading-relaxed">
          {description}
        </p>
      </div>
      <Toggle checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  )
}

function ServiceRow({
  title,
  category,
  description,
}: {
  title: string
  category: string
  description: string
}) {
  return (
    <div className="pb-4 border-b border-anthracite-light/50 last:border-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display font-normal text-[15px] text-offwhite">
          {title}
        </h3>
        <span className="font-body font-light text-[9px] tracking-[0.18em] uppercase text-copper-light px-2 py-0.5 border border-copper/40 whitespace-nowrap">
          {category}
        </span>
      </div>
      <p className="mt-1.5 font-body font-light text-[11.5px] text-warmgrey leading-relaxed">
        {description}
      </p>
    </div>
  )
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange?: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${
        disabled
          ? 'bg-copper/40 cursor-not-allowed'
          : checked
            ? 'bg-copper'
            : 'bg-anthracite-light hover:bg-anthracite-light/70'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-offwhite shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
      <span className="sr-only">{checked ? 'Enabled' : 'Disabled'}</span>
    </button>
  )
}
