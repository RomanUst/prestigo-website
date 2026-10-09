'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import type { LucideIcon } from 'lucide-react'
import { LoaderCircle, MessageCircle, MessagesSquare, Phone, Send, X } from 'lucide-react'
import { rtlLocales, usePathname, type AppLocale } from '@/i18n/routing'
import { trackMetaEvent } from '@/components/MetaPixel'
import { WHATSAPP_CHAT_URL, TELEGRAM_CHAT_URL } from '@/lib/contact-channels'
import { getLandingHref, rememberLandingHref } from '@/lib/chat-visit-context'
import { getConsent } from '@/components/CookieBanner'

const MENU_ID = 'chat-launcher-menu'

// Greeting card is shown once per visit (tab session); a UI flag only, no tracking.
const GREETING_SEEN_KEY = 'prestigo_chat_greeting_seen'

type ChannelLabelKey = 'chatOnSite' | 'whatsapp' | 'telegram'

interface Channel {
  id: string
  labelKey: ChannelLabelKey
  Icon: LucideIcon
  /** Absent for the on-site chat, which is an action (opens the widget). */
  href?: string
  analyticsName: string
  primary?: boolean
}

// The menu renders from this array (not hardcoded to three) so Phases 78/79
// can add channels without a layout change. D-01 order.
const CHANNELS: Channel[] = [
  { id: 'chat', labelKey: 'chatOnSite', Icon: MessagesSquare, analyticsName: 'Chat on site', primary: true },
  { id: 'whatsapp', labelKey: 'whatsapp', Icon: Phone, href: WHATSAPP_CHAT_URL, analyticsName: 'WhatsApp Launcher' },
  { id: 'telegram', labelKey: 'telegram', Icon: Send, href: TELEGRAM_CHAT_URL, analyticsName: 'Telegram Launcher' },
]

// Visible copper focus ring on keyboard focus only (UI-SPEC keyboard/focus).
const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper'

export default function ChatLauncher() {
  const t = useTranslations('ChatLauncher')
  const locale = useLocale()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [greeting, setGreeting] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)

  const isRtl = rtlLocales.includes(locale as AppLocale)
  // Below md the booking wizard has a fixed price bar (68px + safe area) and a
  // sticky action row at the bottom — lift the launcher above them on /book.
  const path = pathname ?? ''
  const onBookingPage = path === '/book' || path.startsWith('/book/')

  // First-touch landing URL (D-06): remembered in memory only — no cookie, no
  // storage, no network. Not a loader start: nothing third-party happens here.
  useEffect(() => {
    rememberLandingHref(window.location.href)
  }, [])

  // Greeting card: right after the cookie modal is answered, or on load when it
  // was answered on an earlier visit. Never on /book (checkout stays clear).
  // Pure DOM — the Chatwoot SDK still loads only after a click.
  useEffect(() => {
    if (onBookingPage) return
    function show() {
      try {
        if (sessionStorage.getItem(GREETING_SEEN_KEY)) return
        sessionStorage.setItem(GREETING_SEEN_KEY, '1')
      } catch {
        /* storage blocked — still show */
      }
      setGreeting(true)
    }
    if (getConsent()) {
      show()
      return
    }
    window.addEventListener('prestigo:consent-answered', show)
    return () => window.removeEventListener('prestigo:consent-answered', show)
  }, [onBookingPage])

  // Esc and outside-press handling exist only while the menu is open.
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        launcherRef.current?.focus()
      }
    }
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [open])

  function toggleMenu() {
    setGreeting(false)
    if (!open) setFailed(false)
    setOpen((v) => !v)
  }

  async function handleChatOnSite(analyticsName: string) {
    if (loading) return
    trackMetaEvent('Contact', { content_name: analyticsName })
    setFailed(false)
    setLoading(true)
    try {
      // The ONLY place the loader is reachable: after the visitor's click.
      const { openChatWidget } = await import('@/components/chat/load-chat-widget')
      await openChatWidget({
        locale,
        isRtl,
        landingHref: getLandingHref(),
        pathname,
        texts: {
          welcomeTitle: t('widget.welcomeTitle'),
          welcomeDescription: t('widget.welcomeDescription'),
          replyTimeHint: t('replyTimeHint'),
        },
      })
      setOpen(false)
      setGreeting(false)
    } catch {
      // Config disabled, sdk.js blocked/failed, or no ready event in 10 s:
      // show the inline error; WhatsApp and Telegram never depend on the SDK.
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      ref={containerRef}
      className={`chat-launcher-enter fixed end-4 z-40 flex flex-col items-end gap-6 md:bottom-6 md:end-6 ${
        onBookingPage ? 'bottom-24' : 'bottom-4'
      }`}
    >
      {open && (
        <div
          id={MENU_ID}
          role="group"
          aria-label={t('menuAria')}
          className="max-w-[calc(100vw-32px)] min-w-[220px] border border-anthracite-light bg-anthracite-mid p-4"
        >
          <ul className="flex flex-col gap-2">
            {CHANNELS.map(({ id, labelKey, Icon, href, analyticsName, primary }) => {
              const itemClass = `flex min-h-[44px] w-full items-center gap-1 text-start text-[13px] leading-[1.3] transition-all duration-300 ease-in-out hover:text-copper-pale active:scale-[0.97] disabled:cursor-wait disabled:opacity-70 ${FOCUS_RING} ${
                primary ? 'font-semibold text-copper-light' : 'font-normal text-offwhite'
              }`
              const iconClass = `h-5 w-5 shrink-0 ${primary ? 'text-copper' : ''}`
              return (
                <li key={id}>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={itemClass}
                      onClick={() => trackMetaEvent('Contact', { content_name: analyticsName })}
                    >
                      <Icon className={iconClass} aria-hidden="true" />
                      <span className="break-words">{t(labelKey)}</span>
                    </a>
                  ) : (
                    <button
                      type="button"
                      className={itemClass}
                      aria-busy={loading}
                      disabled={loading}
                      onClick={() => void handleChatOnSite(analyticsName)}
                    >
                      {loading ? (
                        <LoaderCircle className={`${iconClass} animate-spin`} aria-hidden="true" />
                      ) : (
                        <Icon className={iconClass} aria-hidden="true" />
                      )}
                      <span className="break-words">{t(labelKey)}</span>
                      {loading && <span className="sr-only">{t('widgetLoading')}</span>}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-[12px] font-normal leading-[1.4] text-warmgrey">{t('replyTimeHint')}</p>
          {/* Always mounted so the polite live region announces the error when it appears. */}
          <div role="status" aria-live="polite">
            {failed && (
              <p className="mt-2 text-[12px] font-normal leading-[1.4] text-offwhite">{t('widgetError')}</p>
            )}
          </div>
        </div>
      )}
      {greeting && !open && !onBookingPage && (
        <div
          role="region"
          aria-label={t('greeting.regionAria')}
          className="chat-greeting-enter relative w-[300px] max-w-[calc(100vw-32px)] border border-anthracite-light bg-anthracite-mid shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
        >
          <div className="flex items-center gap-3 border-b border-anthracite-light p-4 pe-12">
            <Image src="/brand/logo-192.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold leading-[1.3] text-offwhite">Prestigo</p>
              <p className="text-[12px] font-normal leading-[1.4] text-warmgrey">{t('replyTimeHint')}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label={t('greeting.closeAria')}
            onClick={() => setGreeting(false)}
            className={`absolute end-2 top-2 flex h-11 w-11 items-center justify-center text-warmgrey transition-colors duration-300 hover:text-offwhite ${FOCUS_RING}`}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="p-4">
            <p className="bg-anthracite-light p-3 text-[14px] font-normal leading-[1.5] text-offwhite">
              {t('greeting.message')}
            </p>
            <button
              type="button"
              aria-busy={loading}
              disabled={loading}
              onClick={() => void handleChatOnSite('Chat greeting')}
              className={`mt-4 flex min-h-[44px] w-full items-center justify-between gap-2 border border-anthracite-light px-3 text-start text-[13px] text-warmgrey transition-colors duration-300 hover:border-copper hover:text-offwhite disabled:cursor-wait ${FOCUS_RING}`}
            >
              <span>{loading ? t('widgetLoading') : t('greeting.inputPlaceholder')}</span>
              {loading ? (
                <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-copper" aria-hidden="true" />
              ) : (
                <Send className="h-5 w-5 shrink-0 text-copper rtl:-scale-x-100" aria-hidden="true" />
              )}
            </button>
            {failed && (
              <p role="status" className="mt-2 text-[12px] font-normal leading-[1.4] text-offwhite">
                {t('widgetError')}
              </p>
            )}
            <div className="mt-3 flex gap-4">
              {CHANNELS.filter((c) => c.href).map(({ id, labelKey, Icon, href, analyticsName }) => (
                <a
                  key={id}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackMetaEvent('Contact', { content_name: `${analyticsName} (greeting)` })}
                  className={`flex min-h-[44px] items-center gap-1 text-[12px] text-offwhite transition-colors duration-300 hover:text-copper-pale ${FOCUS_RING}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {t(labelKey)}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Gold pulse ring: CSS-only (transform/opacity, no layout shift), only while closed, off under prefers-reduced-motion.
          The relative wrapper is exactly the 56px button, so inset:0 rings the button. */}
      <div className="relative">
        {!open && !greeting && <span className="chat-launcher-pulse" aria-hidden="true" />}
        <button
          ref={launcherRef}
          type="button"
          aria-expanded={open}
          aria-controls={MENU_ID}
          aria-label={open ? t('closeAria') : t('openAria')}
          onClick={toggleMenu}
          className={`relative flex h-14 w-14 items-center justify-center rounded-full border border-copper bg-anthracite-mid text-copper transition-all duration-300 ease-in-out hover:bg-anthracite-light active:scale-[0.97] ${FOCUS_RING}`}
        >
          {open ? <X className="h-6 w-6" aria-hidden="true" /> : <MessageCircle className="h-6 w-6" aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}
