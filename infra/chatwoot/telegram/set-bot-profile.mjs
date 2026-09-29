#!/usr/bin/env node
/**
 * infra/chatwoot/telegram/set-bot-profile.mjs
 *
 * Applies (or dry-runs / checks) the localized Telegram bot profile from
 * bot-profile.json against the real Telegram Bot API.
 *
 * D-15/D-16 (Phase 77 plan 06): this is a NEW customer-facing Telegram bot
 * for Chatwoot — distinct from and never touching the content-approval bot
 * (lib/content/telegram.ts, app/api/telegram) or the Phase 76 alert bots.
 * Chatwoot registers its own webhook on this bot when the owner pastes the
 * token into its Telegram inbox settings; this script never sets a webhook.
 *
 * Modes:
 *   --dry-run                        print the 21 planned calls, no token read, no network
 *   --check [--expect-username U]    getMe + getWebhookInfo; verify unwired / expected username
 *   --apply                          issue setMyName/setMyDescription/setMyShortDescription x21
 *
 * Token source (never argv): env TELEGRAM_CHAT_BOT_TOKEN, else the file
 * ~/.config/prestigo/telegram-chat-bot.env (line TELEGRAM_CHAT_BOT_TOKEN=...),
 * created by the owner with umask 077. The token is never printed; webhook
 * URLs are reduced to their hostname before being logged.
 */

import { readFileSync, existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROFILE_PATH = path.join(__dirname, 'bot-profile.json')
const CHATWOOT_HOST = 'chat.rideprestigo.com'
const TOKEN_ENV_VAR = 'TELEGRAM_CHAT_BOT_TOKEN'
const TOKEN_FILE = path.join(os.homedir(), '.config', 'prestigo', 'telegram-chat-bot.env')

const LANGS = ['default', 'ru', 'es', 'fr', 'ar', 'hi', 'zh']
const FIELD_TO_METHOD = {
  name: 'setMyName',
  description: 'setMyDescription',
  short_description: 'setMyShortDescription',
}

/**
 * Build the exact 21 {method, params} objects for the localized profile:
 * 3 calls without language_code (default = English), 3 each for the 6
 * non-default locales (ru, es, fr, ar, hi, zh) = 21 total.
 */
export function buildProfileCalls(profile) {
  const calls = []
  for (const lang of LANGS) {
    const p = profile.profiles?.[lang]
    if (!p) throw new Error(`bot-profile.json is missing profiles.${lang}`)
    for (const [field, method] of Object.entries(FIELD_TO_METHOD)) {
      const value = p[field]
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`bot-profile.json profiles.${lang}.${field} is missing or empty`)
      }
      const params = { [field]: value }
      if (lang !== 'default') params.language_code = lang
      calls.push({ method, params })
    }
  }
  return calls
}

/**
 * Remove every occurrence of `token` from `message`, including inside a
 * bot<token> URL segment. Returns `message` unchanged when `token` is
 * falsy (nothing to redact).
 */
export function redact(message, token) {
  if (!token || typeof message !== 'string') return message
  return message.split(token).join('<redacted>')
}

/**
 * Read the bot token from env, else the on-disk config file. Never reads
 * argv — a token must never appear in shell history or process listings.
 * Returns null when no token is configured anywhere.
 */
export function loadToken() {
  const fromEnv = process.env[TOKEN_ENV_VAR]
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim()
  if (existsSync(TOKEN_FILE)) {
    const contents = readFileSync(TOKEN_FILE, 'utf8')
    const match = contents.match(/^TELEGRAM_CHAT_BOT_TOKEN=(.+)$/m)
    if (match && match[1].trim().length > 0) return match[1].trim()
  }
  return null
}

function apiUrl(token, method) {
  return `https://api.telegram.org/bot${token}/${method}`
}

async function callApi(token, method, params) {
  const res = await fetch(apiUrl(token, method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params ?? {}),
  })
  const json = await res.json()
  if (!json.ok) {
    const err = new Error(`${method} failed: ${json.description ?? `HTTP ${res.status}`}`)
    err.httpStatus = res.status
    err.method = method
    throw err
  }
  return json.result
}

function loadProfile() {
  return JSON.parse(readFileSync(PROFILE_PATH, 'utf8'))
}

function textCharCount(str) {
  return Array.from(str).length
}

function runDryRun(profile) {
  const calls = buildProfileCalls(profile)
  for (const { method, params } of calls) {
    const lang = params.language_code ?? 'default'
    const text = params.name ?? params.description ?? params.short_description ?? ''
    console.log(`plan ${method} lang=${lang} chars=${textCharCount(text)}`)
  }
  console.log(`planned=${calls.length}`)
}

/** Reduce a webhook URL to just its hostname (never log the token it embeds). */
function webhookLabelFrom(webhookUrl) {
  if (!webhookUrl) return 'unset'
  try {
    return new URL(webhookUrl).hostname
  } catch {
    return 'invalid'
  }
}

async function runCheck(expectUsername) {
  const token = loadToken()
  if (!token) {
    console.error(
      `No token found. Set ${TOKEN_ENV_VAR} or create ${TOKEN_FILE} (see plan Task 2 instructions).`
    )
    process.exitCode = 1
    return
  }

  let me
  let webhook
  try {
    me = await callApi(token, 'getMe', {})
    webhook = await callApi(token, 'getWebhookInfo', {})
  } catch (err) {
    console.error(redact(String(err?.message ?? err), token))
    process.exitCode = 1
    return
  }

  const username = me.username
  const webhookLabel = webhookLabelFrom(webhook.url)

  console.log(`username=${username}`)
  console.log(`webhook=${webhookLabel}`)
  console.log(`pending_update_count=${webhook.pending_update_count ?? 0}`)

  const usernameMismatch = Boolean(expectUsername) && username !== expectUsername
  const webhookNotChatwoot = webhookLabel !== 'unset' && webhookLabel !== CHATWOOT_HOST

  if (usernameMismatch || webhookNotChatwoot) {
    process.exitCode = 1
  }
}

async function runApply(profile) {
  const token = loadToken()
  if (!token) {
    console.error(
      `No token found. Set ${TOKEN_ENV_VAR} or create ${TOKEN_FILE} (see plan Task 2 instructions).`
    )
    process.exitCode = 1
    return
  }

  const calls = buildProfileCalls(profile)
  let applied = 0
  for (const { method, params } of calls) {
    try {
      await callApi(token, method, params)
      applied += 1
    } catch (err) {
      console.error(
        `${method} HTTP ${err?.httpStatus ?? '?'} ${redact(String(err?.message ?? err), token)}`
      )
      console.log(`applied=${applied}`)
      process.exitCode = 1
      return
    }
  }
  console.log(`applied=${applied}`)
}

function parseArgs(argv) {
  const args = { mode: null, expectUsername: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') args.mode = 'dry-run'
    else if (a === '--check') args.mode = 'check'
    else if (a === '--apply') args.mode = 'apply'
    else if (a === '--expect-username') args.expectUsername = argv[++i]
  }
  return args
}

async function main() {
  const { mode, expectUsername } = parseArgs(process.argv.slice(2))

  if (mode === 'dry-run') {
    const profile = loadProfile()
    runDryRun(profile)
    return
  }
  if (mode === 'check') {
    await runCheck(expectUsername)
    return
  }
  if (mode === 'apply') {
    const profile = loadProfile()
    await runApply(profile)
    return
  }

  console.error('Usage: set-bot-profile.mjs --dry-run | --check [--expect-username U] | --apply')
  process.exitCode = 1
}

// pathToFileURL (on the realpath), not a template string: a path with a space,
// #, % etc. is URL-escaped in import.meta.url, and a symlinked directory
// (e.g. macOS /var -> /private/var) is resolved there but not in argv[1] — a
// naive comparison silently never matches (exit 0, no output).
function isEntryPoint() {
  if (!process.argv[1]) return false
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href
  }
}
const isMainModule = isEntryPoint()
if (isMainModule) {
  main().catch((err) => {
    console.error('set-bot-profile failed:', err)
    process.exitCode = 1
  })
}
