'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { Modal } from '@/components/admin/Modal'
import { MergedByPhoneTable } from '@/components/admin/MergedByPhoneTable'
import { SplitContactForm } from '@/components/admin/SplitContactForm'
import type { PhoneMergeRow } from '@/lib/identity-admin-store'

type IdentitiesResponse = { merges: PhoneMergeRow[] }

const SPLIT_QUEUED = 'Split queued. EspoCRM and Chatwoot will update within a few minutes.'

export default function IdentitiesPage() {
  const [merges, setMerges] = useState<PhoneMergeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [splitTarget, setSplitTarget] = useState<PhoneMergeRow | null>(null)
  const [splitQueued, setSplitQueued] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch('/api/admin/identities')
      const json = res.ok ? ((await res.json()) as Partial<IdentitiesResponse>) : null
      if (json && Array.isArray(json.merges)) {
        setMerges(json.merges)
      } else {
        setMerges([])
        setLoadError(true)
      }
    } catch {
      setMerges([])
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const closeSplit = useCallback(() => setSplitTarget(null), [])

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
        <div role="tablist" aria-label="Identity lists" style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            role="tab"
            id="identities-tab-merged"
            aria-selected={true}
            aria-controls="identities-panel-merged"
            style={tabStyle(true)}
          >
            {loading ? 'Merged by phone' : `Merged by phone (${merges.length})`}
          </button>
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

      <div role="tabpanel" id="identities-panel-merged" aria-labelledby="identities-tab-merged">
        {loadError ? (
          <div style={{ ...bodyText, color: 'var(--warmgrey)', padding: '32px', textAlign: 'center' }}>
            <p style={{ margin: 0 }}>Could not load identities. Refresh to retry.</p>
          </div>
        ) : (
          <MergedByPhoneTable
            merges={merges}
            loading={loading}
            onSplit={(m) => {
              setSplitQueued(false)
              setSplitTarget(m)
            }}
            empty={{
              heading: 'No phone merges yet',
              body: 'A contact is merged by phone only when a new email arrives with a number we already know. Any merge appears here so you can split it.',
            }}
          />
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
