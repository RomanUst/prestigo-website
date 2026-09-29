/**
 * Public contact-channel deep links used by the chat launcher (Phase 77, D-16).
 *
 * Plain constants only: no env reads, no infrastructure hosts. The WhatsApp
 * number matches components/HeroWhatsApp.tsx; the launcher variant omits the
 * English prefilled text so localized pages do not send English.
 * TELEGRAM_BOT_USERNAME must equal confirmedUsername in
 * infra/chatwoot/telegram/bot-profile.json (test-enforced).
 */
export const WHATSAPP_CHAT_URL = 'https://wa.me/420725986855'

export const TELEGRAM_BOT_USERNAME = 'PrestigoChauffeurBot'

export const TELEGRAM_CHAT_URL = `https://t.me/${TELEGRAM_BOT_USERNAME}`
