// Phase 89 plan 24 (CANC-02, D-18): the Vienna blog table must not state the retired "free up to 1 h before" rule.
// The Prestigo cell of the "Flexibility / cancellation" row names no number, so it can never drift from the policy
// the owner sets in the admin. Competitor cells and every other row are not this test's business.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx'),
  'utf8',
)

function prestigoCell(): string {
  const line = source.split('\n').find((l) => l.includes("label: 'Flexibility / cancellation'"))
  expect(line, 'the Flexibility / cancellation row exists').toBeDefined()
  const match = /prestigo:\s*'([^']*)'/.exec(line as string)
  expect(match, 'the row has a prestigo cell').not.toBeNull()
  return (match as RegExpExecArray)[1]
}

describe('Vienna blog: cancellation row (CANC-02)', () => {
  it('the Prestigo cell holds no digit', () => {
    expect(prestigoCell()).not.toMatch(/\d/)
  })

  it('the Prestigo cell points at the deadline in the booking', () => {
    expect(prestigoCell()).toBe('Free until the deadline in your booking')
  })

  it('the old one-hour rule is gone from the page', () => {
    expect(source).not.toMatch(/Free up to 1 h before/i)
  })

  it('the FAQ answer no longer states a fixed cancellation window', () => {
    expect(source).not.toMatch(/free cancellation up to (two|2|one|1) hours? before/i)
  })
})
