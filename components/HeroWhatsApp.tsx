'use client'

import { trackMetaEvent } from '@/components/MetaPixel'

export default function HeroWhatsApp() {
  return (
    <a
      href="https://wa.me/420725986855?text=Hello%20PRESTIGO%2C%20I%20would%20like%20to%20book%20a%20transfer."
      target="_blank"
      rel="noopener noreferrer"
      className="btn-ghost"
      onClick={() => trackMetaEvent('Contact', { content_name: 'WhatsApp Hero' })}
    >
      Book via WhatsApp
    </a>
  )
}
