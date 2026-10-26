// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Phase 83-13: guard for the inbound-webhooks runbook. The names, commands and codes an operator needs must appear,
 * and the runbook (tracked in git) must carry nothing that looks like a secret, a customer address or a price.
 */

const ROOT = process.cwd()
const RUNBOOK_REL = 'infra/vps/runbooks/inbound-webhooks.md'
const runbook = fs.readFileSync(path.join(ROOT, RUNBOOK_REL), 'utf8')

const NAMES = [
  'CHATWOOT_WEBHOOK_SECRET',
  'CHATWOOT_WEBHOOK_SECRET_PREVIOUS',
  'ESPOCRM_WEBHOOK_SECRET',
  'ESPOCRM_WEBHOOK_SECRET_PREVIOUS',
  'ESPOCRM_WEBHOOK_ID',
  'chat_hooks_start',
  'skipOwn',
  'prestigo-sync',
  'Итог:',
  'Summary:',
  'no-lead',
  'at-most-once',
  'webhook_purge_failed',
  'webhook_purged',
  'webhook_loop_fused',
  'notes_skipped',
  '999.10',
  'D-18',
  'D-19',
  'D-20',
  'D-21',
]

const COMMANDS = [
  'node infra/espocrm/webhook.mjs create',
  'node infra/espocrm/webhook.mjs list',
  'node infra/espocrm/webhook.mjs delete',
  'node infra/espocrm/webhook.mjs --print secret',
  'node infra/espocrm/webhook.mjs --print id',
  'node infra/espocrm/webhook.mjs probe',
  'node infra/chatwoot/webhook.mjs ensure',
  'node infra/chatwoot/webhook.mjs rotate',
  'node infra/chatwoot/webhook.mjs delete',
  'node infra/chatwoot/webhook.mjs --print secret',
  'node infra/chatwoot/webhook.mjs probe',
  'node infra/chatwoot/sync.mjs --only labels',
  'node infra/espocrm/sync.mjs --only enums',
  'node infra/espocrm/sync.mjs --only roles',
  'node infra/espocrm/verify-acl.mjs --role "Sync writer"',
]

const EVENT_TYPES = ['hook.chat_intake', 'hook.chat_resolve', 'hook.chat_label', 'hook.chat_contact', 'hook.espo_contact']

// Every handler code of plans 83-07..83-11 (the receiver outcomes are checked separately).
const HANDLER_CODES = [
  'hooks_off',
  'before_start',
  'conversation_missing',
  'no_incoming_message',
  'no_lead_label',
  'filtered_auto_reply',
  'filtered_no_reply',
  'filtered_own_domain',
  'customer',
  'known_contact',
  'identity_erasing',
  'contact_pending',
  'no_target',
  'bad_key',
  'contact_missing',
  'echo',
  'no_contact_data',
  'cw_ambiguous',
  'email_owned_elsewhere',
  'no_label',
  'no_chat_lead',
  'lead_not_open',
  'unlinked',
  'cw_unprocessable',
]
const RECEIVER_OUTCOMES = ['queued', 'exists', 'duplicate', 'fused', 'off', 'ignored', 'echo', 'unlinked', 'erasing']

function section(heading: string): string {
  const start = runbook.indexOf(`## ${heading}`)
  expect(start, `section "${heading}" missing`).toBeGreaterThanOrEqual(0)
  const rest = runbook.slice(start + 3)
  const next = rest.search(/\n## /)
  return next === -1 ? rest : rest.slice(0, next)
}

describe('inbound-webhooks runbook: structure', () => {
  it('has the required sections in order', () => {
    const order = [
      '1. What it does',
      '2. When a chat becomes a Lead',
      '3. Summary note convention',
      '4. Go-live',
      '5. Switch off',
      '6. Secret rotation',
      '7. Lost events',
      '8. Loop fuse ALERT',
      '9. Known limitation: same-value re-edit',
      '10. Outbox codes',
      '11. Erasure checklist addition',
    ]
    const positions = order.map((h) => runbook.indexOf(`## ${h}`))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect((runbook.match(/^## /gm) ?? []).length).toBeGreaterThanOrEqual(10)
  })
})

describe('inbound-webhooks runbook: live contract', () => {
  it('has exactly one "## Live contract" section, after the erasure checklist', () => {
    expect(runbook.match(/^## Live contract$/gm) ?? []).toHaveLength(1)
    expect(runbook.indexOf('## Live contract')).toBeGreaterThan(runbook.indexOf('## 11. Erasure checklist addition'))
  })

  it('records the confirmed facts (capture switch, fingerprint, skipOwn owner check, no-lead, no loop)', () => {
    const live = section('Live contract')
    for (const fact of ['chat_hooks_start', 'site_sync_fp', 'skipOwn', 'createdById', 'no-lead', 'webhook_loop_fused']) {
      expect(live).toContain(fact)
    }
  })
})

describe('inbound-webhooks runbook: names, commands and codes', () => {
  it.each(NAMES)('mentions %s', (name) => {
    expect(runbook).toContain(name)
  })

  it.each(COMMANDS)('documents the command %s', (cmd) => {
    expect(runbook).toContain(cmd)
  })

  it.each(EVENT_TYPES)('names the event type %s', (t) => {
    expect(runbook).toContain(t)
  })

  it.each(HANDLER_CODES)('lists the outbox code %s as a table row', (code) => {
    expect(section('10. Outbox codes')).toContain(`| \`${code}\` |`)
  })

  it.each(RECEIVER_OUTCOMES)('lists the receiver outcome %s', (code) => {
    expect(section('10. Outbox codes')).toContain(`\`${code}\``)
  })

  it('shows the go-live and switch-off statements for chat_hooks_start', () => {
    expect(runbook).toContain("insert into public.integration_config (key, value) values ('chat_hooks_start', now()::text);")
    expect(runbook).toContain("delete from public.integration_config where key = 'chat_hooks_start';")
  })

  it('explains the lost-event symptoms and recovery for every event type', () => {
    const lost = section('7. Lost events')
    for (const ev of ['message_created', 'conversation_status_changed', 'contact_updated', 'conversation_updated', 'Contact.update']) {
      expect(lost, ev).toContain(ev)
    }
    expect(lost).toContain('at-most-once')
    expect(lost).toContain('no retry')
    expect(lost).toContain('5 second timeout')
    expect(lost).toContain('4 times, every 10 minutes')
  })

  it('records the operational caveats from the earlier plans', () => {
    expect(runbook).toContain('?v=2') // 83-05 rotation URL
    expect(runbook).toMatch(/401/) // 83-06 residual rotation window
    expect(section('9. Known limitation: same-value re-edit')).toContain('30 days') // 83-11 dedup trade-off
  })

  it('names every handler code in the code base (no drift)', () => {
    const src = ['lib/chat-intake.ts', 'lib/chat-resolve.ts', 'lib/chat-contact.ts', 'lib/espo-contact-hook.ts', 'lib/hook-dispatch.ts', 'lib/outbox-labels.ts']
      .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'))
      .join('\n')
    for (const code of ['hooks_off', 'before_start', 'no_incoming_message', 'identity_erasing', 'contact_pending', 'no_target', 'email_owned_elsewhere', 'no_chat_lead', 'lead_not_open', 'cw_unprocessable']) {
      expect(src, code).toContain(code)
    }
  })
})

describe('inbound-webhooks runbook: no secrets, no customer data, no prices', () => {
  it('has no 32+ character hex string', () => {
    expect(runbook.match(/\b[0-9a-f]{32,}\b/gi) ?? []).toEqual([])
  })

  it('has no base64-looking token', () => {
    const hits = (runbook.match(/[A-Za-z0-9+/=_-]{32,}/g) ?? []).filter((s) => /\d/.test(s) && /[A-Za-z]/.test(s))
    expect(hits).toEqual([])
  })

  it('has no NAME=value assignment for a secret-like name', () => {
    const bad = runbook.split('\n').filter((line) => /(SECRET|TOKEN|KEY)=[A-Za-z0-9]/.test(line))
    expect(bad).toEqual([])
  })

  it('has no email address other than rideprestigo.com role addresses or example domains', () => {
    const addrs = runbook.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []
    expect(addrs.filter((a) => !/@(rideprestigo\.com|example\.(com|org|net|test))$/.test(a))).toEqual([])
  })

  it('has no phone-number-looking value', () => {
    expect(runbook.match(/\+\d{8,}/g) ?? []).toEqual([])
  })

  it('has no price (no euro sign, no amount with a currency)', () => {
    expect(runbook).not.toContain('€')
    expect(runbook).not.toMatch(/\b(EUR|CZK)\s?\d|\d\s?(EUR|CZK)\b/)
  })
})
