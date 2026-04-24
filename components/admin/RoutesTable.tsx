'use client'
import { useState } from 'react'
import type { RoutePrice } from '@/lib/route-prices'

const inputBaseStyle: React.CSSProperties = {
  width: '100px',
  background: 'var(--anthracite)',
  border: '1px solid var(--anthracite-light)',
  borderRadius: '2px',
  color: 'var(--offwhite)',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  textAlign: 'right',
  padding: '8px',
  outline: 'none',
}

const cardStyle: React.CSSProperties = {
  background: 'var(--anthracite-mid)',
  border: '1px solid var(--anthracite-light)',
  borderRadius: '4px',
  padding: '24px',
}

const headerLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.4em',
  color: 'var(--warmgrey)',
}

type DirtyFields = { e_class_eur?: number; s_class_eur?: number; v_class_eur?: number }

type RoutesTableProps = {
  initialRoutes: RoutePrice[]
}

export default function RoutesTable({ initialRoutes }: RoutesTableProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [sortKey, setSortKey] = useState<'slug' | 'distanceKm' | 'eClassEur'>('slug')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [dirtyRows, setDirtyRows] = useState<Map<string, DirtyFields>>(new Map())
  const [savingRows, setSavingRows] = useState<Set<string>>(new Set())
  const [rowStatus, setRowStatus] = useState<Map<string, 'idle' | 'saved' | 'error'>>(new Map())

  const isDirty = (slug: string) => dirtyRows.has(slug)

  function markField(slug: string, field: 'e_class_eur' | 's_class_eur' | 'v_class_eur', value: number) {
    setDirtyRows(prev => {
      const next = new Map(prev)
      const existing = next.get(slug) ?? {}
      next.set(slug, { ...existing, [field]: value })
      return next
    })
  }

  async function saveRow(route: RoutePrice) {
    const dirty = dirtyRows.get(route.slug)
    if (!dirty) return
    setSavingRows(prev => new Set(prev).add(route.slug))
    const body = {
      e_class_eur: dirty.e_class_eur ?? route.eClassEur,
      s_class_eur: dirty.s_class_eur ?? route.sClassEur,
      v_class_eur: dirty.v_class_eur ?? route.vClassEur,
    }
    const res = await fetch(`/api/admin/route-prices/${route.slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSavingRows(prev => {
      const next = new Set(prev)
      next.delete(route.slug)
      return next
    })
    if (res.ok) {
      setDirtyRows(prev => {
        const next = new Map(prev)
        next.delete(route.slug)
        return next
      })
      setRowStatus(prev => new Map(prev).set(route.slug, 'saved'))
      setTimeout(() => {
        setRowStatus(prev => {
          const next = new Map(prev)
          next.delete(route.slug)
          return next
        })
      }, 3000)
    } else {
      setRowStatus(prev => new Map(prev).set(route.slug, 'error'))
    }
  }

  const sortedRoutes = [...initialRoutes].sort((a, b) => {
    const aVal = a[sortKey]
    const bVal = b[sortKey]
    const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal as string) : (aVal as number) - (bVal as number)
    return sortDir === 'asc' ? cmp : -cmp
  })

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return (
    <div style={cardStyle}>
      <div
        onClick={() => setIsOpen(o => !o)}
        style={{ ...headerLabelStyle, cursor: 'pointer', userSelect: 'none' }}
        role="button"
        aria-expanded={isOpen}
      >
        INTERCITY ROUTES {isOpen ? '▲' : '▼'}
      </div>

      {isOpen && (
        <div style={{ overflowX: 'auto', marginTop: '16px' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th
                  onClick={() => toggleSort('slug')}
                  style={{ cursor: 'pointer', ...headerLabelStyle, padding: '8px', textAlign: 'left' }}
                >
                  Slug
                </th>
                <th style={{ ...headerLabelStyle, padding: '8px', textAlign: 'left' }}>From</th>
                <th style={{ ...headerLabelStyle, padding: '8px', textAlign: 'left' }}>To</th>
                <th
                  onClick={() => toggleSort('distanceKm')}
                  style={{ cursor: 'pointer', ...headerLabelStyle, padding: '8px', textAlign: 'right' }}
                >
                  km
                </th>
                <th
                  onClick={() => toggleSort('eClassEur')}
                  style={{ cursor: 'pointer', ...headerLabelStyle, padding: '8px', textAlign: 'right' }}
                >
                  E €
                </th>
                <th style={{ ...headerLabelStyle, padding: '8px', textAlign: 'right' }}>S €</th>
                <th style={{ ...headerLabelStyle, padding: '8px', textAlign: 'right' }}>V €</th>
                <th style={{ ...headerLabelStyle, padding: '8px', textAlign: 'center' }}>Save</th>
              </tr>
            </thead>
            <tbody>
              {sortedRoutes.map(route => {
                const dirty = dirtyRows.get(route.slug) ?? {}
                const eVal = dirty.e_class_eur ?? route.eClassEur
                const sVal = dirty.s_class_eur ?? route.sClassEur
                const vVal = dirty.v_class_eur ?? route.vClassEur
                const status = rowStatus.get(route.slug)
                return (
                  <tr key={route.slug}>
                    <td style={{ padding: '8px', fontFamily: 'var(--font-montserrat)', fontSize: '12px', color: 'var(--offwhite)' }}>
                      {route.slug}
                    </td>
                    <td style={{ padding: '8px', fontFamily: 'var(--font-montserrat)', fontSize: '12px', color: 'var(--offwhite)' }}>
                      {route.fromLabel}
                    </td>
                    <td style={{ padding: '8px', fontFamily: 'var(--font-montserrat)', fontSize: '12px', color: 'var(--offwhite)' }}>
                      {route.toLabel}
                    </td>
                    <td style={{ padding: '8px', fontFamily: 'var(--font-montserrat)', fontSize: '12px', color: 'var(--offwhite)', textAlign: 'right' }}>
                      {route.distanceKm}
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        aria-label={`E-Class price for ${route.slug}`}
                        value={eVal}
                        onChange={e => markField(route.slug, 'e_class_eur', Number(e.target.value))}
                        style={inputBaseStyle}
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        aria-label={`S-Class price for ${route.slug}`}
                        value={sVal}
                        onChange={e => markField(route.slug, 's_class_eur', Number(e.target.value))}
                        style={inputBaseStyle}
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        aria-label={`V-Class price for ${route.slug}`}
                        value={vVal}
                        onChange={e => markField(route.slug, 'v_class_eur', Number(e.target.value))}
                        style={inputBaseStyle}
                      />
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      {isDirty(route.slug) && (
                        <button
                          type="button"
                          onClick={() => saveRow(route)}
                          disabled={savingRows.has(route.slug)}
                          style={{
                            border: '1px solid var(--copper)',
                            color: 'var(--offwhite)',
                            background: 'transparent',
                            padding: '6px 12px',
                            fontFamily: 'var(--font-montserrat)',
                            fontSize: '11px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.2em',
                            cursor: savingRows.has(route.slug) ? 'not-allowed' : 'pointer',
                            opacity: savingRows.has(route.slug) ? 0.5 : 1,
                          }}
                        >
                          Save
                        </button>
                      )}
                      {status === 'saved' && (
                        <span style={{ color: 'var(--copper)', marginLeft: '8px', fontSize: '11px', fontFamily: 'var(--font-montserrat)' }}>
                          Route saved · /routes/{route.slug} revalidating
                        </span>
                      )}
                      {status === 'error' && (
                        <span style={{ color: '#ff6b6b', marginLeft: '8px', fontSize: '11px', fontFamily: 'var(--font-montserrat)' }}>
                          Error
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
