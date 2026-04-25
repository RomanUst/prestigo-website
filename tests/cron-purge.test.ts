import { describe, it, expect, vi } from 'vitest'

// ── vi.hoisted stubs (must be declared before vi.mock factories) ───────────────

const {
  mockFrom,
  mockDelete,
  mockLt,
} = vi.hoisted(() => ({
  mockFrom:   vi.fn(),
  mockDelete: vi.fn(),
  mockLt:     vi.fn(),
}))

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

// ── Import helper after mocks are set up ─────────────────────────────────────
import { purgeQuoteLeads } from '@/lib/purge-quote-leads'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LEAD-04: purgeQuoteLeads helper', () => {
  it('deletes rows older than 30 days and returns deleted count', async () => {
    mockLt.mockResolvedValue({ error: null, count: 5 })
    mockDelete.mockReturnValue({ lt: mockLt })
    mockFrom.mockReturnValue({ delete: mockDelete })

    const supabase = { from: mockFrom } as any
    const result = await purgeQuoteLeads(supabase)

    expect(result).toEqual({ deleted: 5 })
    expect(mockFrom).toHaveBeenCalledWith('quote_leads')
    expect(mockDelete).toHaveBeenCalledWith({ count: 'exact' })
    expect(mockLt).toHaveBeenCalledWith('created_at', expect.any(String))
  })

  it('returns deleted:0 when count is null (no matching rows)', async () => {
    mockLt.mockResolvedValue({ error: null, count: null })
    mockDelete.mockReturnValue({ lt: mockLt })
    mockFrom.mockReturnValue({ delete: mockDelete })

    const supabase = { from: mockFrom } as any
    const result = await purgeQuoteLeads(supabase)

    expect(result).toEqual({ deleted: 0 })
  })

  it('throws when Supabase returns an error', async () => {
    const dbError = { message: 'DB connection failed' }
    mockLt.mockResolvedValue({ error: dbError, count: null })
    mockDelete.mockReturnValue({ lt: mockLt })
    mockFrom.mockReturnValue({ delete: mockDelete })

    const supabase = { from: mockFrom } as any
    await expect(purgeQuoteLeads(supabase)).rejects.toMatchObject({ message: 'DB connection failed' })
  })

  it('passes a cutoff timestamp in the past (> 29 days ago)', async () => {
    let capturedCutoff: string | undefined
    mockLt.mockImplementation((field: string, value: string) => {
      capturedCutoff = value
      return Promise.resolve({ error: null, count: 0 })
    })
    mockDelete.mockReturnValue({ lt: mockLt })
    mockFrom.mockReturnValue({ delete: mockDelete })

    const supabase = { from: mockFrom } as any
    await purgeQuoteLeads(supabase)

    const cutoffDate = new Date(capturedCutoff!)
    const msAgo = Date.now() - cutoffDate.getTime()
    // Should be approximately 30 days ago (within 1 minute of tolerance)
    expect(msAgo).toBeGreaterThan(29 * 24 * 60 * 60 * 1000)
    expect(msAgo).toBeLessThan(30 * 24 * 60 * 60 * 1000 + 60_000)
  })
})
