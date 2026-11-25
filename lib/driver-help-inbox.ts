import { readEnv } from '@/lib/env'

/**
 * Inbox selection of the driver Help chat, shared by the trip help route and the cabinet help route.
 *
 * Inbox selection is configuration: the dedicated Drivers inbox pair when BOTH values are set, otherwise the
 * Website inbox pair. Missing pieces make buildDriverWidgetConfig answer { enabled: false }.
 */
export function driverHelpWidgetEnv(): {
  baseUrl: string | undefined
  websiteToken: string | undefined
  hmacSecret: string | undefined
} {
  const driverToken = readEnv('CHATWOOT_DRIVER_WEBSITE_TOKEN')
  const driverSecret = readEnv('CHATWOOT_DRIVER_WIDGET_HMAC_SECRET')
  const useDriverInbox = Boolean(driverToken && driverSecret)

  return {
    baseUrl: readEnv('CHATWOOT_BASE_URL'),
    websiteToken: useDriverInbox ? driverToken : readEnv('CHATWOOT_WEBSITE_TOKEN'),
    hmacSecret: useDriverInbox ? driverSecret : readEnv('CHATWOOT_WIDGET_HMAC_SECRET'),
  }
}
