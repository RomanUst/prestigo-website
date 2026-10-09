import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { hasCurrencyToken } from '../scripts/qa/chatwoot_price_gate.mjs'
import { isValidWindowDelay, WINDOW_DELAY_MAX, WINDOW_DELAY_MIN } from '../infra/chatwoot/sync.mjs'

/**
 * Phase 77-03: config-as-code validation for infra/chatwoot/.
 *
 * findForbiddenContent() is the single shared "is this text safe to send
 * to a customer" check reused across canned responses (this file), and
 * (Task 3) automation-rules.json keyword lists. Keep it a pure function of
 * (text) -> string[] issues, no I/O, so it's directly unit-testable and
 * cheap to call in a tight loop over every locale of every topic.
 */

const CANNED_DIR = path.join(process.cwd(), 'infra/chatwoot/canned-responses')
const INFRA_DIR = path.join(process.cwd(), 'infra/chatwoot')
const LOCALES = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh'] as const
type Locale = (typeof LOCALES)[number]

const FORBIDDEN_KEYWORDS = ['uber', 'bolt', 'ride-hailing', 'ride hailing', 'taxi app']

const ALLOWED_CHATWOOT_VARS = new Set([
  '{{contact.first_name}}',
  '{{contact.name}}',
  '{{agent.first_name}}',
  '{{agent.name}}',
])

// Euro sign, EUR/CZK currency codes, or "Kč" — any of these next to nothing
// (not just digit-adjacent) is disallowed in operator-facing template copy.
const CURRENCY_RE = /€|\bEUR\b|\bCZK\b|Kč/
// A real booking reference shaped PRG-<8 digits>, e.g. PRG-20260818-DE8697's
// PRG-20260818 segment — templates must use the [BOOKING_REF] placeholder.
const BOOKING_REF_RE = /PRG-\d{8}/i

export function findForbiddenContent(text: string): string[] {
  const issues: string[] = []
  if (CURRENCY_RE.test(text)) issues.push('currency/price token found')

  const lower = text.toLowerCase()
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (lower.includes(kw)) issues.push(`forbidden keyword: ${kw}`)
  }

  if (/prestigio/i.test(text)) issues.push('misspelled brand: Prestigio')
  if (BOOKING_REF_RE.test(text)) issues.push('real booking reference pattern found')

  const varMatches = text.match(/\{\{[^}]+\}\}/g) || []
  for (const v of varMatches) {
    if (!ALLOWED_CHATWOOT_VARS.has(v)) issues.push(`disallowed chatwoot variable: ${v}`)
  }

  return issues
}

function listCannedResponseFiles(): string[] {
  if (!fs.existsSync(CANNED_DIR)) return []
  return fs.readdirSync(CANNED_DIR).filter((f) => f.endsWith('.json')).sort()
}

function readCannedTopic(topic: string): { responses: Record<Locale, string> } {
  const raw = fs.readFileSync(path.join(CANNED_DIR, `${topic}.json`), 'utf8')
  return JSON.parse(raw)
}

// One-off customer identifiers found in the six root scripts read for Task 2
// (send-vehicle-change-email.mjs, send-payment-help-email.mjs,
// send-young-posttrip-review.mjs, generate-login-link.mjs,
// send-invoice-tltgo.mjs, send-maxime-traveltime-reply.mjs) — surnames,
// distinguishing emails/companies, and trip-specific place pairs. None of
// these belong in a reusable, generalized template (D-19/T-77-08).
const ONE_OFF_IDENTIFIERS = [
  'Malone',
  'caitlin_mal',
  'Benshitrit',
  'connectlifestyle',
  'Almsaeed',
  'Abdulaziz',
  'youngir',
  'TLTGO',
  'theluxtaxi',
  'Maxime',
  'mironclaw',
  'Karoliny Světlé',
  'Hybernská',
  'Carlsbad Plaza',
  'Grand Mark Prague',
]

describe('findForbiddenContent (pure helper)', () => {
  it('flags a euro amount', () => {
    expect(findForbiddenContent('Total: €305')).toContain('currency/price token found')
  })

  it('flags an Uber mention', () => {
    const issues = findForbiddenContent('cheaper than Uber for this route')
    expect(issues.some((i) => i.includes('uber'))).toBe(true)
  })

  it('passes clean text', () => {
    expect(
      findForbiddenContent('Hi {{contact.first_name}}, your pickup time changed. — Prestigo')
    ).toEqual([])
  })
})

describe('infra/chatwoot/canned-responses/*.json', () => {
  const files = listCannedResponseFiles()

  it('has at least one topic file', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    const topic = file.replace(/\.json$/, '')

    describe(`topic: ${topic}`, () => {
      const raw = fs.readFileSync(path.join(CANNED_DIR, file), 'utf8')
      const data = JSON.parse(raw) as {
        topic: string
        sourceScript: string
        placeholders: string[]
        responses: Record<Locale, string>
      }

      it('declares the topic matching its filename', () => {
        expect(data.topic).toBe(topic)
      })

      it('has exactly the 7 locale keys', () => {
        expect(Object.keys(data.responses).sort()).toEqual([...LOCALES].sort())
      })

      it('every locale value is non-empty', () => {
        for (const loc of LOCALES) {
          expect(data.responses[loc].trim().length).toBeGreaterThan(0)
        }
      })

      it('every non-en locale differs from en (no English copy-paste stub)', () => {
        for (const loc of LOCALES) {
          if (loc === 'en') continue
          expect(data.responses[loc]).not.toBe(data.responses.en)
        }
      })

      it('every declared placeholder appears in every locale text', () => {
        for (const loc of LOCALES) {
          for (const ph of data.placeholders || []) {
            expect(data.responses[loc]).toContain(ph)
          }
        }
      })

      it('short_code "<topic>-<locale>" matches the required pattern for every locale', () => {
        for (const loc of LOCALES) {
          const shortCode = `${topic}-${loc}`
          expect(shortCode).toMatch(/^[a-z]+(-[a-z]+)*-(en|ru|es|fr|ar|hi|zh)$/)
        }
      })

      it('no locale value contains forbidden content (price, Uber, misspelling, real booking ref, bad variable)', () => {
        for (const loc of LOCALES) {
          const issues = findForbiddenContent(data.responses[loc])
          expect(issues).toEqual([])
        }
      })
    })
  }
})

describe('infra/chatwoot template price guard (D-18)', () => {
  it('.husky/pre-commit scans infra/chatwoot for currency tokens', () => {
    const hook = fs.readFileSync(path.join(process.cwd(), '.husky/pre-commit'), 'utf8')
    expect(hook).toContain('infra/chatwoot')
    expect(hook).toContain('Price or currency found in Chatwoot template source')
  })

  it('scripts/qa/secret_gate_probe.sh proves the currency guard blocks and allows correctly', () => {
    const probe = fs.readFileSync(
      path.join(process.cwd(), 'scripts/qa/secret_gate_probe.sh'),
      'utf8'
    )
    expect(probe).toContain('template-price')
    expect(probe).toContain('template-clean')
  })

  it('WR-04: the gate flags every currency form the shipped locales use, case-insensitively', () => {
    for (const text of [
      'Total \u20AC50', 'EUR 99', 'eur 99', '50 Euros', 'un precio de 50 euros', 'cuesta 1 euro',
      '50 CZK', '1200 kc', '1200 K\u010D', 'about 1000 koruna', '\u0441\u0442\u043E\u0438\u0442 50 \u0435\u0432\u0440\u043E',
      '\u4EF7\u683C 50 \u6B27\u5143', '50 \u064A\u0648\u0631\u0648', '50 \u092F\u0942\u0930\u094B',
    ]) {
      expect(hasCurrencyToken(text), text).toBe(true)
    }
  })

  it('WR-04: the gate does not fire on words that merely contain a currency token', () => {
    for (const text of ['We serve Europe', 'neuron', 'Kcal', '\u0415\u0432\u0440\u043E\u043F\u0430 \u0438 \u0435\u0432\u0440\u043E\u043F\u0435\u0439\u0441\u043A\u0438\u0439', 'Hello, [BOOKING_REF] is confirmed.']) {
      expect(hasCurrencyToken(text), text).toBe(false)
    }
  })

  it('WR-04: .husky/pre-commit scans staged content through the gate script, not the working tree', () => {
    const hook = fs.readFileSync(path.join(process.cwd(), '.husky/pre-commit'), 'utf8')
    expect(hook).toContain('scripts/qa/chatwoot_price_gate.mjs')
    expect(hook).toContain('git diff --cached --name-only --diff-filter=ACMR -- infra/chatwoot')
    expect(hook).not.toMatch(/grep -rIlE/)
  })

  it('infra/chatwoot directory exists on disk', () => {
    expect(fs.existsSync(INFRA_DIR)).toBe(true)
  })
})

describe('Task 2: remaining four canned topics', () => {
  it('exactly 5 topic files exist', () => {
    expect(listCannedResponseFiles().length).toBe(5)
  })

  it('no template contains a one-off customer name/identifier from the six root scripts', () => {
    for (const file of listCannedResponseFiles()) {
      const raw = fs.readFileSync(path.join(CANNED_DIR, file), 'utf8')
      for (const ident of ONE_OFF_IDENTIFIERS) {
        expect(raw).not.toContain(ident)
      }
    }
  })

  it('login-help: en points to the root sign-in page, every other locale to its own /<locale>/login', () => {
    const data = readCannedTopic('login-help')
    expect(data.responses.en).toContain('https://rideprestigo.com/login')
    for (const loc of LOCALES) {
      if (loc === 'en') continue
      expect(data.responses[loc]).toContain(`https://rideprestigo.com/${loc}/login`)
    }
  })

  it('review-request contains the Google review link in every locale', () => {
    const data = readCannedTopic('review-request')
    for (const loc of LOCALES) {
      expect(data.responses[loc]).toContain('https://g.page/r/CdQIkiuHQ1UOEBM/review')
    }
  })

  it('payment-help contains [PAYMENT_LINK] in every locale and no amount (no digits at all)', () => {
    const data = readCannedTopic('payment-help')
    for (const loc of LOCALES) {
      expect(data.responses[loc]).toContain('[PAYMENT_LINK]')
      expect(data.responses[loc]).not.toMatch(/\d/)
      expect(findForbiddenContent(data.responses[loc])).toEqual([])
    }
  })
})

// --- Task 3: labels, teams, custom attributes, inboxes, account, automation ---

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/
const D20_LABELS = [
  'ch-email',
  'ch-web',
  'ch-telegram',
  'ch-whatsapp',
  'wa-window-closing',
  'booking-new',
  'booking-change',
  'payment',
  'b2b',
  'complaint',
  'lost-item',
  'review',
  'other',
] as const
const CHANNEL_LABELS = new Set(['ch-email', 'ch-web', 'ch-telegram', 'ch-whatsapp'])
const CONVERSATION_ATTR_KEYS = [
  'page_url',
  'landing_url',
  'site_locale',
  'referrer',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'book_trip_type',
  'book_origin',
  'book_destination',
  'book_vehicle',
  'chat_opened_at',
  'chat_consent',
] as const

function readInfraJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(INFRA_DIR, file), 'utf8')) as T
}

describe('infra/chatwoot/labels.json (D-20)', () => {
  const data = readInfraJson<{
    labels: { title: string; description: string; color: string; show_on_sidebar: boolean }[]
  }>('labels.json')

  it('titles equal exactly the D-20 labels plus ch-whatsapp and wa-window-closing (13)', () => {
    expect(data.labels.map((l) => l.title).sort()).toEqual([...D20_LABELS].sort())
  })

  it('ch-whatsapp uses the channel color like every other ch-* label (D-17)', () => {
    const wa = data.labels.find((l) => l.title === 'ch-whatsapp')
    expect(wa?.color).toBe('#0F1D2C')
    expect(wa?.show_on_sidebar).toBe(true)
    for (const l of data.labels.filter((x) => x.title.startsWith('ch-'))) expect(l.color).toBe(wa?.color)
  })

  it('every color is a valid #RRGGBB hex value', () => {
    for (const label of data.labels) {
      expect(label.color).toMatch(HEX_COLOR_RE)
    }
  })

  it('channel labels share one color, topic labels share a different color', () => {
    const channelColors = new Set(
      data.labels.filter((l) => CHANNEL_LABELS.has(l.title)).map((l) => l.color)
    )
    const topicColors = new Set(
      data.labels.filter((l) => !CHANNEL_LABELS.has(l.title)).map((l) => l.color)
    )
    expect(channelColors.size).toBe(1)
    expect(topicColors.size).toBe(1)
    expect([...channelColors][0]).not.toBe([...topicColors][0])
  })
})

describe('infra/chatwoot/teams.json (D-21)', () => {
  const data = readInfraJson<{
    teams: { name: string; description: string; allow_auto_assign: boolean; members: string[] }[]
  }>('teams.json')

  it('names equal exactly ["Bookings","B2B"]', () => {
    expect(data.teams.map((t) => t.name)).toEqual(['Bookings', 'B2B'])
  })

  it('allow_auto_assign is false and members is ["@owner"] for every team', () => {
    for (const team of data.teams) {
      expect(team.allow_auto_assign).toBe(false)
      expect(team.members).toEqual(['@owner'])
    }
  })
})

describe('infra/chatwoot/custom-attributes.json (D-06)', () => {
  const data = readInfraJson<{
    conversation: { key: string; display_type: string }[]
    contact: { key: string; display_type: string }[]
  }>('custom-attributes.json')

  it('conversation keys equal exactly the 15 keys in the interfaces block', () => {
    expect(data.conversation.map((a) => a.key)).toEqual([...CONVERSATION_ATTR_KEYS])
  })

  it('contact keys equal ["site_locale"]', () => {
    expect(data.contact.map((a) => a.key)).toEqual(['site_locale'])
  })

  it('every display_type is "text" or "link"', () => {
    for (const attr of [...data.conversation, ...data.contact]) {
      expect(['text', 'link']).toContain(attr.display_type)
    }
  })
})

describe('infra/chatwoot/inboxes.json (D-04/D-07/D-08)', () => {
  const data = readInfraJson<{
    website: {
      avatar: string
      settings: {
        greeting_enabled: boolean
        working_hours_enabled: boolean
        timezone: string
        working_hours: { day_of_week: number; open_all_day: boolean; closed_all_day: boolean }[]
      }
      channel: {
        widget_color: string
        reply_time: string
        hmac_mandatory: boolean
        continuity_via_email: boolean
        pre_chat_form_options: { pre_chat_fields: { name: string; required: boolean }[] }
      }
    }
    managed: { name: string; channel_type: string; settings: Record<string, unknown> }[]
  }>('inboxes.json')

  it('managed WhatsApp inbox: Channel::Whatsapp, only the four non-secret settings, all false (D-15/D-17)', () => {
    const wa = data.managed.filter((m) => m.channel_type === 'Channel::Whatsapp')
    expect(wa).toHaveLength(1)
    expect(wa[0].name).toBe('WhatsApp')
    expect(wa[0].settings).toEqual({
      enable_auto_assignment: false,
      greeting_enabled: false,
      csat_survey_enabled: false,
      working_hours_enabled: false,
    })
    for (const key of Object.keys(wa[0])) expect(key).not.toMatch(/token|secret|key|pin|provider_config|channel$/i)
    for (const key of Object.keys(wa[0].settings)) expect(key).not.toMatch(/token|secret|key|pin/i)
  })

  it('matches the locked interfaces-block values', () => {
    expect(data.website.channel.widget_color).toBe('#0F1D2C')
    expect(data.website.channel.reply_time).toBe('in_a_few_minutes')
    expect(data.website.channel.hmac_mandatory).toBe(true)
    expect(data.website.channel.continuity_via_email).toBe(true)
    // Owner 2026-10-09: show the widget as online 24/7 for now (open all day, every day).
    expect(data.website.settings.working_hours_enabled).toBe(true)
    expect(data.website.settings.timezone).toBe('Europe/Prague')
    expect(data.website.settings.working_hours).toHaveLength(7)
    for (const day of data.website.settings.working_hours) {
      expect(day).toMatchObject({ open_all_day: true, closed_all_day: false })
    }
    expect(data.website.settings.greeting_enabled).toBe(false)
  })

  it('pre-chat form: email required, name optional (D-04)', () => {
    const fields = data.website.channel.pre_chat_form_options.pre_chat_fields
    const email = fields.find((f) => f.name === 'emailAddress')
    const name = fields.find((f) => f.name === 'fullName')
    expect(email?.required).toBe(true)
    expect(name?.required).toBe(false)
  })

  it('the avatar path exists on disk', () => {
    expect(fs.existsSync(path.join(process.cwd(), data.website.avatar))).toBe(true)
  })
})

describe('infra/chatwoot/account.json', () => {
  it('support_email equals bookings@rideprestigo.com', () => {
    const data = readInfraJson<{ support_email: string }>('account.json')
    expect(data.support_email).toBe('bookings@rideprestigo.com')
  })
})

describe('infra/chatwoot/automation-rules.json (D-20/D-21/OPS-02)', () => {
  const labels = readInfraJson<{ labels: { title: string }[] }>('labels.json')
  const teams = readInfraJson<{ teams: { name: string }[] }>('teams.json')
  const inboxes = readInfraJson<{ website: { name: string }; managed: { name: string }[] }>(
    'inboxes.json'
  )
  const data = readInfraJson<{
    channelRules: { name: string; inbox: string; label: string; team: string }[]
    windowRules: { name: string; clearName: string; inbox: string; label: string; delayMinutes: number; optional: boolean }[]
    topicRules: { label: string; team: string | null; keywords: Record<Locale, string[]> }[]
    labelRouting: { name: string; label: string; team: string; optional: boolean }[]
  }>('automation-rules.json')

  const labelTitles = new Set(labels.labels.map((l) => l.title))
  const teamNames = new Set(teams.teams.map((t) => t.name))
  const inboxNames = new Set([inboxes.website.name, ...inboxes.managed.map((m) => m.name)])

  it('every channelRules.inbox is the website name or a managed inbox name', () => {
    for (const rule of data.channelRules) {
      expect(inboxNames.has(rule.inbox)).toBe(true)
    }
  })

  it('every channelRules/topicRules/labelRouting label exists in labels.json', () => {
    for (const rule of data.channelRules) expect(labelTitles.has(rule.label)).toBe(true)
    for (const rule of data.topicRules) expect(labelTitles.has(rule.label)).toBe(true)
    for (const rule of data.labelRouting) expect(labelTitles.has(rule.label)).toBe(true)
  })

  it('every channelRules/labelRouting team exists in teams.json', () => {
    for (const rule of data.channelRules) expect(teamNames.has(rule.team)).toBe(true)
    for (const rule of data.labelRouting) expect(teamNames.has(rule.team)).toBe(true)
  })

  it("has the 'channel: whatsapp' rule on the WhatsApp inbox with the ch-whatsapp label and the Bookings team", () => {
    const rule = data.channelRules.find((r) => r.name === 'channel: whatsapp')
    expect(rule).toEqual({ name: 'channel: whatsapp', inbox: 'WhatsApp', label: 'ch-whatsapp', team: 'Bookings' })
  })

  it('windowRules: one WhatsApp closing-soon rule, 1200 minutes, optional, label and inbox exist (D-16)', () => {
    expect(data.windowRules).toHaveLength(1)
    const rule = data.windowRules[0]
    expect(rule.name).toBe('window: whatsapp closing soon')
    expect(rule.clearName).toBe('window: whatsapp reply clears label')
    expect(rule.delayMinutes).toBe(1200)
    expect(rule.optional).toBe(true)
    expect(inboxNames.has(rule.inbox)).toBe(true)
    expect(labelTitles.has(rule.label)).toBe(true)
  })

  it('windowRules delayMinutes is an integer inside Chatwoot execution_delay range 10..43200 (edge boundary/precision)', () => {
    expect([WINDOW_DELAY_MIN, WINDOW_DELAY_MAX]).toEqual([10, 43200])
    for (const rule of data.windowRules) expect(isValidWindowDelay(rule.delayMinutes)).toBe(true)
    for (const ok of [10, 1200, 43200]) expect(isValidWindowDelay(ok)).toBe(true)
    for (const bad of [9, 43201, 1200.5]) expect(isValidWindowDelay(bad)).toBe(false)
  })

  it('no automation rule carries a send action: WhatsApp rules only label and assign (D-12)', () => {
    expect(JSON.stringify(data)).not.toMatch(/send_message|send_email|send_webhook/)
  })

  it('topicRules cover exactly booking-new, booking-change, payment, b2b, complaint, lost-item, review (not other)', () => {
    const expected = ['booking-new', 'booking-change', 'payment', 'b2b', 'complaint', 'lost-item', 'review']
    expect(data.topicRules.map((r) => r.label).sort()).toEqual([...expected].sort())
  })

  it('b2b topic rule routes to the B2B team', () => {
    const b2b = data.topicRules.find((r) => r.label === 'b2b')
    expect(b2b?.team).toBe('B2B')
  })

  it('every topic has at least 2 keywords per locale for all 7 locales', () => {
    for (const rule of data.topicRules) {
      for (const loc of LOCALES) {
        expect(rule.keywords[loc]?.length ?? 0).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('keywords are lowercase, trimmed; zh keywords are >=2 chars, others >=3 chars; none is forbidden content', () => {
    for (const rule of data.topicRules) {
      for (const loc of LOCALES) {
        for (const kw of rule.keywords[loc]) {
          expect(kw).toBe(kw.trim())
          expect(kw).toBe(kw.toLowerCase())
          expect(kw.length).toBeGreaterThanOrEqual(loc === 'zh' ? 2 : 3)
          expect(findForbiddenContent(kw)).toEqual([])
        }
      }
    }
  })
})
