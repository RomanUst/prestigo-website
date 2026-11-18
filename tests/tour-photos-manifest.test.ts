import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

// Guard for the launch photo manifest (D-15, TRIP-02). The seed (plan 93-21)
// downloads each non-own file from its https URL and re-hosts it in the
// tour-photos bucket. Licence data comes from the Commons API extmetadata
// (scripts/tour-photo-licences.mjs), never from memory.

const ROOT = path.resolve(__dirname, '..')
const MANIFEST_PATH = path.join(ROOT, 'content/tours-seed/photos.json')

const ALLOWED_LICENSES = new Set([
  'CC0 1.0',
  'CC0',
  'Public domain',
  'CC BY 2.0',
  'CC BY 2.5',
  'CC BY 3.0',
  'CC BY 4.0',
  'CC BY-SA 2.0',
  'CC BY-SA 2.5',
  'CC BY-SA 3.0',
  'CC BY-SA 4.0',
  'Unsplash License',
])

const REQUIRED_SLUGS = [
  'cesky-krumlov-day-trip',
  'kutna-hora-day-trip',
  'karlovy-vary-day-trip',
  'dresden-day-trip',
  'karlstejn-day-trip',
  'bohemian-switzerland-day-trip',
]

type PhotoEntry = {
  source: 'commons' | 'unsplash' | 'own'
  title: string
  download_url: string | null
  local_path: string | null
  credit_text: string | null
  license: string | null
  credit_url: string | null
  cover: boolean
  alt_hint: string
}

type Manifest = { version: number; tours: Record<string, PhotoEntry[]> }

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as Manifest
const slugs = Object.keys(manifest.tours)

describe('tour photo manifest', () => {
  it('is version 1 and lists tours', () => {
    expect(manifest.version).toBe(1)
    expect(slugs.length).toBeGreaterThan(0)
  })

  it('lists exactly the 6 launch tours', () => {
    expect([...slugs].sort()).toEqual([...REQUIRED_SLUGS].sort())
  })

  describe.each(slugs)('%s', (slug) => {
    const entries = manifest.tours[slug]

    it('has 4..8 entries and exactly one non-own cover', () => {
      expect(entries.length).toBeGreaterThanOrEqual(4)
      expect(entries.length).toBeLessThanOrEqual(8)
      const covers = entries.filter((e) => e.cover)
      expect(covers).toHaveLength(1)
      expect(covers[0].source).not.toBe('own')
    })

    it('has at least one own car photo', () => {
      expect(entries.some((e) => e.source === 'own')).toBe(true)
    })

    it.each(entries.map((e, i) => [i, e.title] as const))('entry %i (%s) follows the rules', (i) => {
      const e = entries[i]
      expect(['commons', 'unsplash', 'own']).toContain(e.source)
      expect(typeof e.title).toBe('string')
      expect(e.title.length).toBeGreaterThan(0)
      expect(typeof e.alt_hint).toBe('string')
      expect(e.alt_hint.length).toBeGreaterThan(0)
      expect(typeof e.cover).toBe('boolean')

      if (e.source === 'own') {
        expect(e.download_url).toBeNull()
        expect(e.local_path).toBeTruthy()
        expect(e.local_path).toMatch(/^public\/vehicles\//)
        expect(fs.existsSync(path.join(ROOT, e.local_path as string))).toBe(true)
      } else {
        expect(e.local_path).toBeNull()
        expect(e.credit_text).toBeTruthy()
        expect(e.license).toBeTruthy()
        expect(ALLOWED_LICENSES.has(e.license as string)).toBe(true)
        expect(e.credit_url).toMatch(/^https:\/\//)
        expect(e.download_url).toMatch(/^https:\/\//)
        if (e.source === 'commons') {
          expect(e.title).toMatch(/^File:/)
          expect(e.credit_url).toMatch(/^https:\/\/commons\.wikimedia\.org\//)
        }
        if (e.source === 'unsplash') {
          expect(e.license).toBe('Unsplash License')
          expect(e.download_url).toMatch(/^https:\/\/images\.unsplash\.com\//)
        }
      }
    })
  })

  it('never reuses a download_url', () => {
    const urls = slugs.flatMap((s) => manifest.tours[s].map((e) => e.download_url).filter(Boolean))
    expect(new Set(urls).size).toBe(urls.length)
  })
})
