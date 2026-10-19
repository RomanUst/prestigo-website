// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { buildFilterBody, formatLine, summarize } from '../infra/chatwoot/probe-filter.mjs'

describe('infra/chatwoot/probe-filter.mjs', () => {
  it('sends the exact equal_to shape the site handler relies on (RESEARCH A3)', () => {
    expect(buildFilterBody('email', 'probe-ab@example.invalid')).toEqual({
      payload: [{ attribute_key: 'email', filter_operator: 'equal_to', values: ['probe-ab@example.invalid'], query_operator: null }],
    })
    // The handler builds the same body; pin the literal so the two cannot drift apart silently.
    const handler = fs.readFileSync(path.resolve(__dirname, '../lib/chatwoot-sync.ts'), 'utf8')
    expect(handler).toContain("filter_operator: 'equal_to'")
    expect(handler).toContain('query_operator: null')
  })

  it('prints status and booleans/counts only, never a body', () => {
    const line = formatLine(summarize(200, { payload: [{ email: 'secret@x.test' }], meta: { count: 1 } }))
    expect(line).toBe('status=200 payload_array=true meta_count=1')
    expect(line).not.toContain('secret')
  })

  it('a non-array payload or missing meta is reported, not hidden', () => {
    expect(formatLine(summarize(200, { payload: {} }))).toBe('status=200 payload_array=false meta_count=-1')
    expect(formatLine(summarize(200, null))).toBe('status=200 payload_array=false meta_count=-1')
  })
})
