'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { LucideIcon } from 'lucide-react'
import { LoaderCircle, MessageCircle, MessagesSquare, Phone, Send, X } from 'lucide-react'
import { rtlLocales, type AppLocale } from '@/i18n/routing'
import { trackMetaEvent } from '@/components/MetaPixel'
import { WHATSAPP_CHAT_URL, TELEGRAM_CHAT_URL } from '@/lib/contact-channels'

const MENU_ID = 'chat-launcher-menu'

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

export default function ChatLauncher() {
  const t = useTranslations('ChatLauncher')
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const isRtl = rtlLocales.includes(locale as AppLocale)

  async function handleChatOnSite(analyticsName: string) {
    if (loading) return
    trackMetaEvent('Contact', { content_name: analyticsName })
    setLoading(true)
    try {
      // The ONLY place the loader is reachable: after the visitor's click.
      const { openChatWidget } = await import('@/components/chat/load-chat-widget')
      await openChatWidget({
        locale,
        isRtl,
        texts: {
          welcomeTitle: t('widget.welcomeTitle'),
          welcomeDescription: t('widget.welcomeDescription'),
          replyTimeHint: t('replyTimeHint'),
        },
      })
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed bottom-4 end-4 z-40 flex flex-col items-end gap-6 md:bottom-6 md:end-6">
      {open && (
        <div
          id={MENU_ID}
          role="group"
          aria-label={t('menuAria')}
          className="max-w-[calc(100vw-32px)] min-w-[220px] border border-anthracite-light bg-anthracite-mid p-4"
        >
          <ul className="flex flex-col gap-2">
            {CHANNELS.map(({ id, labelKey, Icon, href, analyticsName, primary }) => {
              const itemClass = `flex min-h-[44px] w-full items-center gap-1 text-start text-[13px] leading-[1.3] transition-all duration-300 ease-in-out active:scale-[0.97] ${
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
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={MENU_ID}
        aria-label={open ? t('closeAria') : t('openAria')}
        onClick={() => setOpen((v) => !v)}
        className="flex h-14 w-14 items-center justify-center rounded-full border border-copper bg-anthracite-mid text-copper transition-all duration-300 ease-in-out active:scale-[0.97]"
      >
        {open ? <X className="h-6 w-6" aria-hidden="true" /> : <MessageCircle className="h-6 w-6" aria-hidden="true" />}
      </button>
    </div>
  )
}
