'use client'

import { useTranslations } from 'next-intl'
import { trackMetaEvent } from '@/components/MetaPixel'
import { whatsappUrlWithText } from '@/lib/contact-channels'

export default function HeroWhatsApp() {
  const t = useTranslations('Hero')
  return (
    <a
      href={whatsappUrlWithText('Hello PRESTIGO, I would like to book a transfer.')}
      target="_blank"
      rel="noopener noreferrer"
      className="cta-text"
      onClick={() => trackMetaEvent('Contact', { content_name: 'WhatsApp Hero' })}
    >
      {t('bookViaWhatsapp')}
    </a>
  )
}
