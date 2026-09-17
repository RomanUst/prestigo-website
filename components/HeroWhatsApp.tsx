'use client'

import { useTranslations } from 'next-intl'
import { trackMetaEvent } from '@/components/MetaPixel'

export default function HeroWhatsApp() {
  const t = useTranslations('Hero')
  return (
    <a
      href="https://wa.me/420725986855?text=Hello%20PRESTIGO%2C%20I%20would%20like%20to%20book%20a%20transfer."
      target="_blank"
      rel="noopener noreferrer"
      className="cta-text"
      onClick={() => trackMetaEvent('Contact', { content_name: 'WhatsApp Hero' })}
    >
      {t('bookViaWhatsapp')}
    </a>
  )
}
