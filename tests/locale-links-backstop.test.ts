import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { scanTree } from '../scripts/qa/en_leak_static.mjs'

/**
 * tests/locale-links-backstop.test.ts — permanent regression guard (D-06 R3,
 * Phase 75 Plan 14).
 *
 * Reuses the plan-75-02 static scanner's R3 rule (locale-dropping navigation:
 * a raw `<a href="/...">`, a `next/link` default import, a `useRouter`
 * import from `next/navigation`, or a `redirect()` call with a root-relative
 * string-literal argument) over the same `app/[locale]/**` + `components/**`
 * tree the scanner already walks. `scanTree()` applies
 * `scripts/qa/en_leak_allowlist.json`'s `staticIgnoreFiles` entries itself
 * (e.g. the D-05 `app/[locale]/book/confirmation/page.tsx` entry, which
 * suppresses only R1/R2 — its R3 navigation stays checked here), so this test
 * needs no allowlist logic of its own beyond one narrow, reasoned exclusion:
 *
 * `components/admin/**` is explicitly OUT of i18n scope (STATE.md: "Do NOT
 * localize app/admin/*"; 75-EN-LEAK-AUDIT.md buckets every admin-panel
 * finding — including AdminSidebar.tsx's own `next/link` default import —
 * under an explicit UNOWNED heading, never assigned to any Phase 75 fix
 * plan). `en_leak_allowlist.json`'s `staticIgnoreFiles` is reserved for
 * D-09/D-05/external-link exceptions (this plan's own acceptance criteria
 * forbids widening that file), so the admin-panel scope boundary is applied
 * here in the test instead of in the shared allowlist.
 *
 * After every phase-75 fix plan has landed, the remaining, non-admin R3
 * finding count must be exactly zero — any regression (a component
 * reverting to `next/link`/`next/navigation`'s `useRouter`, or a new raw
 * `<a href="/...">`) fails this test immediately with the offending
 * file:line.
 */
describe('locale-links-backstop (D-06 R3 permanent regression guard)', () => {
  it('every internal navigation across app/[locale]/** and components/** keeps the visitor locale — zero non-allowlisted R3 findings', () => {
    const rootDir = path.resolve(__dirname, '..')
    const findings = scanTree(rootDir)
    const r3Findings = findings.filter((f: { rule: string }) => f.rule === 'R3')

    const nonAdminR3 = r3Findings.filter(
      (f: { file: string }) => !f.file.startsWith('components/admin/')
    )

    if (nonAdminR3.length > 0) {
      const detail = nonAdminR3
        .map((f: { file: string; line: number; text: string }) => `${f.file}:${f.line} — ${f.text}`)
        .join('\n')
      throw new Error(`Locale-dropping navigation found (R3):\n${detail}`)
    }

    expect(nonAdminR3).toEqual([])
  })

  it('sanity check: the admin-panel exclusion is narrow — it does not silently swallow a non-admin finding', () => {
    const rootDir = path.resolve(__dirname, '..')
    const findings = scanTree(rootDir)
    const r3Findings = findings.filter((f: { rule: string }) => f.rule === 'R3')
    const adminR3 = r3Findings.filter((f: { file: string }) => f.file.startsWith('components/admin/'))

    // As of this plan, exactly one UNOWNED admin-panel R3 finding is known
    // (AdminSidebar.tsx's next/link default import, 75-EN-LEAK-AUDIT.md).
    // This assertion documents that baseline rather than silently widening
    // to swallow any future admin-panel finding without review.
    for (const f of adminR3) {
      expect(f.file).toMatch(/^components\/admin\//)
    }
  })
})
