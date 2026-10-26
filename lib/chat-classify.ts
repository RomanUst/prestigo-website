/**
 * Pure chat policy for the Chatwoot -> EspoCRM bridge (Phase 83, HOOK-01 / HOOK-02).
 *
 * No I/O: no env, no network, no clock reads (callers pass dates). Handlers wire it.
 */

import { LEAD_SOURCE } from '@/lib/lead-mapping'

/** Chatwoot label that suppresses / kills the auto-created chat Lead (D-07). */
export const NO_LEAD_LABEL = 'no-lead'

export type ChannelLabel = 'Website chat' | 'Email' | 'Telegram' | 'WhatsApp' | 'Other'

/** Chatwoot channel string -> the one EspoCRM Lead source it maps to (HOOK-01). */
export function leadSourceForChannel(channel: string | null): string {
  switch (channel) {
    case 'Channel::WebWidget':
      return LEAD_SOURCE.websiteChat
    case 'Channel::Email':
      return LEAD_SOURCE.email
    case 'Channel::Telegram':
      return LEAD_SOURCE.telegram
    case 'Channel::Whatsapp':
      return LEAD_SOURCE.whatsapp
    default:
      return LEAD_SOURCE.other
  }
}

/** Human channel label; identical to the Lead source value for every channel. */
export function channelLabel(channel: string | null): ChannelLabel {
  return leadSourceForChannel(channel) as ChannelLabel
}

/** True when the conversation carries the `no-lead` label (case-insensitive). */
export function hasNoLeadLabel(labels: unknown): boolean {
  if (!Array.isArray(labels)) return false
  return labels.some((l) => typeof l === 'string' && l.trim().toLowerCase() === NO_LEAD_LABEL)
}
