// Pure display helpers for the Outbox admin page (and the daily digest). English literals only,
// like every admin surface. No imports: safe to use from client components.

/** Human name of an outbox event type. Unknown types are shown as-is. */
export function outboxEventLabel(eventType: string): string {
  if (eventType.startsWith('lead.')) return 'Lead'
  switch (eventType) {
    case 'sync.booking':
      return 'Booking sync'
    case 'sync.signup':
      return 'Signup sync'
    case 'sync.espo':
      return 'EspoCRM update'
    case 'sync.chatwoot':
      return 'Chatwoot update'
    case 'erase.person':
      return 'Erasure'
    case 'hook.chat_intake':
      return 'Chat intake'
    case 'hook.chat_resolve':
      return 'Chat resolved'
    case 'hook.chat_label':
      return 'Chat no-lead label'
    case 'hook.chat_contact':
      return 'Chatwoot contact edit'
    case 'hook.espo_contact':
      return 'EspoCRM contact edit'
    default:
      return eventType
  }
}

const NETWORK_PREFIXES = ['crm_network', 'crm_timeout', 'cw_network', 'cw_timeout']

/** One-line explanation for a known last_error code; null for unknown or missing codes. */
export function outboxErrorHint(code: string | null): string | null {
  if (!code) return null
  if (code === 'crm_unconfigured' || code === 'chatwoot_unconfigured') {
    return 'Credentials are missing in Vercel settings.'
  }
  if (code === 'cw_ambiguous') {
    return 'Chatwoot has several matching contacts. Merge them by hand, then retry.'
  }
  if (code === 'email_owned_elsewhere') {
    return 'This email already belongs to another person. Nothing was changed; merge or split them by hand on /admin/identities.'
  }
  if (code === 'hooks_off') {
    return 'Chat capture is switched off (no chat_hooks_start in the config). Nothing is wrong; switch it on when ready.'
  }
  if (code === 'contact_pending') {
    return 'The contact is still being created in the CRM. This retries automatically.'
  }
  if (code === 'cw_unprocessable') {
    return 'Chatwoot refused the change (for example a malformed value). Fix the field in Chatwoot or EspoCRM by hand.'
  }
  if (code === 'unsupported_event') {
    return 'This event type is not handled. Ask for a code fix.'
  }
  if (NETWORK_PREFIXES.some((p) => code.startsWith(p)) || code.endsWith('_timeout')) {
    return 'The CRM server did not answer. It will retry automatically.'
  }
  return null
}
