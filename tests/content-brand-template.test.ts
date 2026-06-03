import { describe, it, expect } from 'vitest'
import { escapeHtml, renderPostHTML, renderStoryHTML } from '@/lib/content/brand-template'

describe('lib/content/brand-template', () => {
  describe('escapeHtml', () => {
    it('escapes HTML-significant characters', () => {
      expect(escapeHtml('<b>"x" & y</b>')).toBe('&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;')
    })
    it('coerces null/undefined to empty string', () => {
      expect(escapeHtml(undefined as unknown as string)).toBe('')
      expect(escapeHtml(null as unknown as string)).toBe('')
    })
  })

  const copy = {
    imageUrl: 'https://img.example/car.jpg',
    headline: 'Arrive in',
    headlineEm: 'Prague',
    subline: 'Private chauffeur',
  }

  describe('renderPostHTML (1080x1080)', () => {
    const html = renderPostHTML(copy)
    it('is a square canvas', () => {
      expect(html).toContain('width: 1080px; height: 1080px')
    })
    it('embeds the background image and copy', () => {
      expect(html).toContain("url('https://img.example/car.jpg')")
      expect(html).toContain('Arrive in')
      expect(html).toContain('<em>Prague</em>')
      expect(html).toContain('Private chauffeur')
    })
    it('carries the PRESTIGO brand marks', () => {
      expect(html).toContain('PRESTI')
      expect(html).toContain('Prestige in every mile')
      expect(html).toContain('#B87333')
    })
    it('escapes injected copy to prevent markup breakout', () => {
      const evil = renderPostHTML({ ...copy, headline: '</style><script>x' })
      expect(evil).not.toContain('<script>x')
      expect(evil).toContain('&lt;/style&gt;&lt;script&gt;x')
    })
  })

  describe('renderStoryHTML (1080x1920)', () => {
    const html = renderStoryHTML(copy)
    it('is a vertical canvas', () => {
      expect(html).toContain('width: 1080px; height: 1920px')
    })
    it('embeds copy and brand', () => {
      expect(html).toContain('<em>Prague</em>')
      expect(html).toContain('Prestige in every mile')
    })
  })
})
