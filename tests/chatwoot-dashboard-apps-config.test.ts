// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Phase 84-06 (PANEL-01, D-01): infra/chatwoot/dashboard-apps.json is the desired Dashboard App registration.
 * The registered iframe URL must carry no secret: exact host and path, no query string, no fragment (T-84-26).
 */

const file = path.join(process.cwd(), 'infra/chatwoot/dashboard-apps.json')
const config = JSON.parse(fs.readFileSync(file, 'utf8')) as {
  dashboardApps: { title: string; content: { type: string; url: string }[] }[]
}

describe('infra/chatwoot/dashboard-apps.json', () => {
  it('declares exactly one Dashboard App titled Bookings', () => {
    expect(Object.keys(config)).toEqual(['dashboardApps'])
    expect(config.dashboardApps).toHaveLength(1)
    expect(config.dashboardApps[0].title).toBe('Bookings')
  })

  it('content is exactly one frame item', () => {
    const { content } = config.dashboardApps[0]
    expect(content).toHaveLength(1)
    expect(Object.keys(content[0]).sort()).toEqual(['type', 'url'])
    expect(content[0].type).toBe('frame')
  })

  it('frame url is https://rideprestigo.com/embed/chatwoot-dashboard with no query string or fragment (D-01)', () => {
    const raw = config.dashboardApps[0].content[0].url
    const url = new URL(raw)
    expect(url.protocol).toBe('https:')
    expect(url.hostname).toBe('rideprestigo.com')
    expect(url.port).toBe('')
    expect(url.username).toBe('')
    expect(url.password).toBe('')
    expect(url.pathname).toBe('/embed/chatwoot-dashboard')
    expect(url.search).toBe('')
    expect(url.hash).toBe('')
    expect(raw).toBe('https://rideprestigo.com/embed/chatwoot-dashboard')
    expect(raw).not.toMatch(/[?#]/)
  })
})
