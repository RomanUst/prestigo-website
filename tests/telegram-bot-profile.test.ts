/**
 * Phase 77, Plan 06 — Task 1 (tracer): Telegram bot profile copy + Bot API
 * profile script, proven offline. No test in this file makes a network
 * call or reads a real bot token.
 */
import { describe, expect, it } from 'vitest'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildProfileCalls, redact, loadToken } from '../infra/chatwoot/telegram/set-bot-profile.mjs'
import {
  BUSINESS_PHONE_DIGITS,
  WHATSAPP_CHAT_URL,
  TELEGRAM_BOT_USERNAME,
  TELEGRAM_CHAT_URL,
} from '../lib/contact-channels'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const PROFILE_PATH = join(REPO_ROOT, 'infra/chatwoot/telegram/bot-profile.json')
const SCRIPT_PATH = join(REPO_ROOT, 'infra/chatwoot/telegram/set-bot-profile.mjs')

function loadProfile() {
  return JSON.parse(readFileSync(PROFILE_PATH, 'utf8'))
}

const LOCALES = ['ru', 'es', 'fr', 'ar', 'hi', 'zh']
const LIMITS = { name: 64, description: 512, short_description: 120 }
const FORBIDDEN_PATTERNS = [/[€$£¥]/, /\bCZK\b/i, /\bEUR\b/i, /\bUSD\b/i, /uber/i, /bolt/i, /ride-hailing/i]

describe('bot-profile.json shape', () => {
  const profile = loadProfile()

  it('has the exact usernameCandidates from the plan interfaces', () => {
    expect(profile.usernameCandidates).toEqual([
      'PrestigoPragueBot',
      'RidePrestigoBot',
      'PrestigoChauffeurBot',
      'PrestigoChatBot',
    ])
  })

  it('has a profiles entry for default and all 6 non-English locales', () => {
    expect(Object.keys(profile.profiles).sort()).toEqual(['ar', 'default', 'es', 'fr', 'hi', 'ru', 'zh'])
  })

  for (const lang of ['default', ...LOCALES]) {
    it(`profiles.${lang} stays within the Bot API length limits`, () => {
      const p = profile.profiles[lang]
      expect(p.name.length).toBeLessThanOrEqual(LIMITS.name)
      expect(p.description.length).toBeLessThanOrEqual(LIMITS.description)
      expect(p.short_description.length).toBeLessThanOrEqual(LIMITS.short_description)
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.description.length).toBeGreaterThan(0)
      expect(p.short_description.length).toBeGreaterThan(0)
    })

    it(`profiles.${lang} contains "Prestigo" and no forbidden content`, () => {
      const p = profile.profiles[lang]
      const all = [p.name, p.description, p.short_description].join(' ')
      expect(all).toContain('Prestigo')
      expect(all.toLowerCase()).not.toContain('prestigio')
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(pattern.test(all)).toBe(false)
      }
    })
  }
})

describe('buildProfileCalls', () => {
  it('returns exactly 21 calls: 3 without language_code, 3 each for ru/es/fr/ar/hi/zh', () => {
    const profile = loadProfile()
    const calls = buildProfileCalls(profile)
    expect(calls).toHaveLength(21)

    const withoutLang = calls.filter((c) => !('language_code' in c.params))
    expect(withoutLang).toHaveLength(3)
    expect(withoutLang.map((c) => c.method).sort()).toEqual(
      ['setMyDescription', 'setMyName', 'setMyShortDescription'].sort()
    )

    for (const lang of LOCALES) {
      const forLang = calls.filter((c) => c.params.language_code === lang)
      expect(forLang).toHaveLength(3)
      expect(forLang.map((c) => c.method).sort()).toEqual(
        ['setMyDescription', 'setMyName', 'setMyShortDescription'].sort()
      )
    }
  })

  it('maps each field to its Bot API method with the correct param key', () => {
    const profile = loadProfile()
    const calls = buildProfileCalls(profile)
    const nameCall = calls.find((c) => c.method === 'setMyName' && !('language_code' in c.params))
    const descCall = calls.find((c) => c.method === 'setMyDescription' && !('language_code' in c.params))
    const shortCall = calls.find(
      (c) => c.method === 'setMyShortDescription' && !('language_code' in c.params)
    )
    expect(nameCall).toBeDefined()
    expect(descCall).toBeDefined()
    expect(shortCall).toBeDefined()
    expect(nameCall?.params.name).toBe(profile.profiles.default.name)
    expect(descCall?.params.description).toBe(profile.profiles.default.description)
    expect(shortCall?.params.short_description).toBe(profile.profiles.default.short_description)
  })

  it('throws when bot-profile.json is missing a required locale', () => {
    const profile = loadProfile()
    const broken = { ...profile, profiles: { ...profile.profiles } }
    delete broken.profiles.ru
    expect(() => buildProfileCalls(broken)).toThrow(/ru/)
  })
})

describe('redact', () => {
  const token = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11'

  it('removes a bare token from a message', () => {
    const message = `Error calling API with token ${token} failed`
    expect(redact(message, token)).not.toContain(token)
    expect(redact(message, token)).toContain('<redacted>')
  })

  it('removes a token embedded in a bot<token> URL segment', () => {
    const message = `request to https://api.telegram.org/bot${token}/getMe failed with 401`
    const result = redact(message, token)
    expect(result).not.toContain(token)
    expect(result).toContain('https://api.telegram.org/bot<redacted>/getMe')
  })

  it('returns the message unchanged when no token is given', () => {
    const message = 'no secrets here'
    expect(redact(message, undefined)).toBe(message)
    expect(redact(message, '')).toBe(message)
  })
})

describe('loadToken', () => {
  it('is a function that never reads process.argv', () => {
    // Behavioral guard: loadToken must not depend on argv at all — verified
    // structurally by confirming its source never references process.argv.
    expect(typeof loadToken).toBe('function')
    expect(loadToken.toString()).not.toMatch(/process\.argv/)
  })
})

describe('--dry-run CLI behavior', () => {
  it('prints 21 "plan " lines and "planned=21" without reading any token', () => {
    const output = execFileSync('node', [SCRIPT_PATH, '--dry-run'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, TELEGRAM_CHAT_BOT_TOKEN: '' },
    })
    const planLines = output.split('\n').filter((l) => l.startsWith('plan '))
    expect(planLines).toHaveLength(21)
    expect(output).toContain('planned=21')
  })
})

describe('WR-05: runs when the script path needs URL-escaping', () => {
  it('--dry-run still prints the plan from a directory containing a space and a #', () => {
    const root = mkdtempSync(join(tmpdir(), 'bot profile #'))
    try {
      const dir = join(root, 'a b')
      mkdirSync(dir, { recursive: true })
      copyFileSync(SCRIPT_PATH, join(dir, 'set-bot-profile.mjs'))
      copyFileSync(PROFILE_PATH, join(dir, 'bot-profile.json'))
      const output = execFileSync('node', [join(dir, 'set-bot-profile.mjs'), '--dry-run'], {
        encoding: 'utf8',
        env: { ...process.env, TELEGRAM_CHAT_BOT_TOKEN: '' },
      })
      expect(output).toContain('planned=21')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('lib/contact-channels.ts agreement', () => {
  it('confirmedUsername is a valid bot username from the candidate list', () => {
    const profile = loadProfile()
    expect(profile.confirmedUsername).toMatch(/^[A-Za-z][A-Za-z0-9_]{3,30}[Bb]ot$/)
    expect(profile.usernameCandidates).toContain(profile.confirmedUsername)
  })

  it('TELEGRAM_BOT_USERNAME equals confirmedUsername', () => {
    expect(TELEGRAM_BOT_USERNAME).toBe(loadProfile().confirmedUsername)
  })

  it('TELEGRAM_CHAT_URL is https://t.me/<username>', () => {
    expect(TELEGRAM_CHAT_URL).toBe(`https://t.me/${loadProfile().confirmedUsername}`)
  })

  it('WHATSAPP_CHAT_URL derives from the single business-number constant', () => {
    expect(WHATSAPP_CHAT_URL).toBe(`https://wa.me/${BUSINESS_PHONE_DIGITS}`)
    const hero = readFileSync(join(REPO_ROOT, 'components/HeroWhatsApp.tsx'), 'utf8')
    expect(hero).toContain('whatsappUrlWithText(')
  })

  it('contact-channels.ts reads no env and names no VPS host', () => {
    const src = readFileSync(join(REPO_ROOT, 'lib/contact-channels.ts'), 'utf8')
    expect(src).not.toMatch(/process\.env/)
    expect(src).not.toMatch(/chat\.rideprestigo\.com/)
  })
})
