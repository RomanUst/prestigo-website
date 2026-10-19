'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { Modal } from '@/components/admin/Modal'
import { MergedByPhoneTable } from '@/components/admin/MergedByPhoneTable'
import { SharedNumbersTable } from '@/components/admin/SharedNumbersTable'
import { SplitContactForm } from '@/components/admin/SplitContactForm'
import { MarkSharedForm } from '@/components/admin/MarkSharedForm'
import { inputBaseStyle, focusRingHandlers } from '@/components/admin/adminFieldStyles'
import type { PhoneMergeRow, SharedPhoneRow } from '@/lib/identity-admin-store'

type IdentitiesResponse = { merges: PhoneMergeRow[]; shared: SharedPhoneRow[] }
type TabId = 'merged' | 'shared'

const TABS: TabId[] = ['merged', 'shared']
const SPLIT_QUEUED = 'Split queued. EspoCRM and Chatwoot will update within a few minutes.'
const FILTER_LABEL = 'Filter by email or phone'

function tabFromHash(): TabId {
  return typeof window !== 'undefined' && window.location.hash === '#shared' ? 'shared' : 'merged'
}

function matches(query: string, values: Array<string | null | undefined>): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const compact = q.replace(/\s+/g, '')
  return values.some((v) => {
    if (!v) return false
    const lower = v.toLowerCase()
    return lower.includes(q) || lower.replace(/\s+/g, '').includes(compact)
  })
}

export default function IdentitiesPage() {
  const [merges, setMerges] = useState<PhoneMergeRow[]>([])
  const [shared, setShared] = useState<SharedPhoneRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [tab, setTab] = useState<TabId>('merged')
  const [filters, setFilters] = useState<Record<TabId, string>>({ merged: '', shared: '' })
  const [splitTarget, setSplitTarget] = useState<PhoneMergeRow | null>(null)
  const [splitQueued, setSplitQueued] = useState(false)
  const [markOpen, setMarkOpen] = useState(false)
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ merged: null, shared: null })

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch('/api/admin/identities')
      const json = res.ok ? ((await res.json()) as Partial<IdentitiesResponse>) : null
      if (json && Array.isArray(json.merges) && Array.isArray(json.shared)) {
        setMerges(json.merges)
        setShared(json.shared)
      } else {
        setMerges([])
        setShared([])
        setLoadError(true)
      }
    } catch {
      setMerges([])
      setShared([])
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // The selected tab lives in the URL hash (#shared) so a reload keeps the place.
  useEffect(() => {
    setTab(tabFromHash())
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const selectTab = useCallback((next: TabId, focus = false) => {
    setTab(next)
    const url = `${window.location.pathname}${window.location.search}${next === 'shared' ? '#shared' : ''}`
    window.history.replaceState(window.history.state, '', url)
    if (focus) tabRefs.current[next]?.focus()
  }, [])

  const onTabKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const step = e.key === 'ArrowRight' ? 1 : -1
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length]
    selectTab(next, true)
  }

  const closeSplit = useCallback(() => setSplitTarget(null), [])
  const closeMark = useCallback(() => setMarkOpen(false), [])

  const filter = filters[tab]
  const visibleMerges = useMemo(
    () => merges.filter((m) => matches(filters.merged, [m.contactEmail, m.mergedEmail, m.phone])),
    [merges, filters.merged],
  )
  const visibleShared = useMemo(
    () => shared.filter((s) => matches(filters.shared, [s.phone, s.note, ...s.emails])),
    [shared, filters.shared],
  )

  const counts: Record<TabId, number> = { merged: merges.length, shared: shared.length }
  const tabLabel = (id: TabId) => {
    const base = id === 'merged' ? 'Merged by phone' : 'Shared numbers'
    return loading || loadError ? base : `${base} (${counts[id]})`
  }

  const total = counts[tab]
  const noMatch = filter.trim() !== '' && total > 0
  const mergedEmpty = noMatch
    ? { body: `No matches. Clear the filter to see all ${total} rows.` }
    : {
        heading: 'No phone merges yet',
        body: 'A contact is merged by phone only when a new email arrives with a number we already know. Any merge appears here so you can split it.',
      }
  const sharedEmpty = noMatch
    ? { body: `No matches. Clear the filter to see all ${total} rows.` }
    : {
        heading: 'No shared numbers',
        body: 'A number becomes shared automatically when it appears with two different emails. You can also mark one by hand, for example an agency or hotel desk.',
      }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          justifyContent: 'space-between',
          alignItems: 'center',
          margin: '0 0 24px',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: '28px',
            fontWeight: 400,
            color: 'var(--offwhite)',
            letterSpacing: '0.08em',
            margin: 0,
          }}
        >
          Identities
        </h1>
        <button type="button" onClick={() => setMarkOpen(true)} style={primaryButton}>
          Mark number as shared
        </button>
      </div>

      <p style={{ ...bodyText, color: 'var(--warmgrey)', margin: '0 0 32px' }}>
        Contacts are matched across the site, EspoCRM and Chatwoot by email, or by phone when the number is not shared.
        Review phone merges here and split any that join two different people.
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: '0 0 16px',
        }}
      >
        <div role="tablist" aria-label="Identity lists" onKeyDown={onTabKeyDown} style={{ display: 'flex', gap: '8px' }}>
          {TABS.map((id) => {
            const active = tab === id
            return (
              <button
                key={id}
                ref={(el) => {
                  tabRefs.current[id] = el
                }}
                type="button"
                role="tab"
                id={`identities-tab-${id}`}
                aria-selected={active}
                aria-controls="identities-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => selectTab(id)}
                style={tabStyle(active)}
              >
                {tabLabel(id)}
              </button>
            )
          })}
        </div>
        <button type="button" onClick={() => void load()} style={secondaryButton}>
          <RefreshCw size={16} aria-hidden="true" />
          Refresh identities
        </button>
      </div>

      <div aria-live="polite" style={{ ...labelText, color: 'var(--copper-light)', minHeight: '16px', margin: '0 0 8px' }}>
        {splitQueued && (
          <>
            {SPLIT_QUEUED}{' '}
            <Link href="/admin/outbox" style={{ color: 'var(--copper)', fontWeight: 500 }}>
              View Outbox
            </Link>
          </>
        )}
      </div>

      <div role="tabpanel" id="identities-panel" aria-labelledby={`identities-tab-${tab}`}>
        {loadError ? (
          <div style={{ ...bodyText, color: 'var(--warmgrey)', padding: '32px', textAlign: 'center' }}>
            <p style={{ margin: 0 }}>Could not load identities. Refresh to retry.</p>
          </div>
        ) : (
          <>
            <div style={{ margin: '0 0 16px', maxWidth: '360px' }}>
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilters((prev) => ({ ...prev, [tab]: e.target.value }))}
                placeholder={FILTER_LABEL}
                aria-label={FILTER_LABEL}
                maxLength={100}
                style={{ ...inputBaseStyle, fontWeight: 400 }}
                {...focusRingHandlers}
              />
            </div>
            {tab === 'merged' ? (
              <MergedByPhoneTable
                merges={visibleMerges}
                loading={loading}
                onSplit={(m) => {
                  setSplitQueued(false)
                  setSplitTarget(m)
                }}
                empty={mergedEmpty}
              />
            ) : (
              <SharedNumbersTable rows={visibleShared} loading={loading} empty={sharedEmpty} />
            )}
          </>
        )}
      </div>

      <Modal isOpen={splitTarget !== null} onClose={closeSplit} title="Split this contact">
        {splitTarget && (
          <SplitContactForm
            key={`${splitTarget.identityId}:${splitTarget.mergedEmail}`}
            merge={splitTarget}
            onKeep={closeSplit}
            onSplit={() => {
              setSplitTarget(null)
              setSplitQueued(true)
              void load()
            }}
          />
        )}
      </Modal>

      <Modal isOpen={markOpen} onClose={closeMark} title="Mark a number as shared">
        <MarkSharedForm
          onKeep={closeMark}
          onMarked={() => {
            setMarkOpen(false)
            void load()
          }}
        />
      </Modal>
    </div>
  )
}

const bodyText: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  fontWeight: 400,
  lineHeight: 1.5,
}

const labelText: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  fontWeight: 400,
  lineHeight: 1.5,
}

const secondaryButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  minHeight: '44px',
  padding: '0 16px',
  background: 'transparent',
  color: 'var(--offwhite)',
  border: '1px solid var(--anthracite-light)',
  borderRadius: '4px',
  cursor: 'pointer',
  ...bodyText,
}

const primaryButton: React.CSSProperties = {
  minHeight: '44px',
  padding: '0 24px',
  background: 'var(--copper)',
  color: 'var(--anthracite)',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  ...bodyText,
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    minHeight: '44px',
    padding: '0 16px',
    background: 'transparent',
    border: 'none',
    borderBottom: active ? '2px solid var(--copper)' : '2px solid transparent',
    color: active ? 'var(--offwhite)' : 'var(--warmgrey)',
    cursor: 'pointer',
    ...bodyText,
  }
}
