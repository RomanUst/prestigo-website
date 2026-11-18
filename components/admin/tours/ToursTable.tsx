'use client'
import Link from 'next/link'
import { ArrowDown, ArrowUp, Check, ExternalLink, ImagePlus, Minus, Pencil } from 'lucide-react'
import { BadgeShell } from '@/components/admin/StatusBadge'
import { amountStyle, money, outlineButtonStyle } from '@/components/admin/paymentShared'
import { locales, type AppLocale } from '@/i18n/locales'
import { tourPhotoUrl } from '@/lib/tours/photo-url'

// Phase 93 (plan 93-09; TRIP-05; UI-SPEC 7.1): one row per tour with order buttons, cover, English title and address, status,
// eight language chips, the three prices, hours included and the Edit / View actions. Prices come from the row and go
// through the admin amount formatter: no amount is typed here. Colours only through --admin-* / --status-* tokens.

export interface TourListRow {
  id: string
  slug: string
  status: 'draft' | 'published'
  sort_order: number
  hours_included: number
  price_e_eur: number | null
  price_s_eur: number | null
  price_v_eur: number | null
  title: string
  cover_path: string | null
  completeness: Record<AppLocale, boolean>
}

type ToursTableProps = {
  tours: TourListRow[]
  /** Move a tour one place up or down; the parent saves the new order. */
  onMove?: (id: string, direction: 'up' | 'down') => void
  /** True while a move is being saved: the order buttons wait. */
  moving?: boolean
}

const thStyle: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  fontWeight: 400,
  letterSpacing: '0.3em',
  textTransform: 'uppercase',
  color: 'var(--admin-text-muted)',
  padding: '10px 12px',
  textAlign: 'left',
  borderBottom: '1px solid var(--admin-border)',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-body)',
  fontWeight: 300,
  color: 'var(--admin-text)',
  padding: '12px',
  borderBottom: '1px solid var(--admin-border)',
  verticalAlign: 'middle',
}

const mutedStyle: React.CSSProperties = {
  fontSize: 'var(--admin-fs-label)',
  color: 'var(--admin-text-muted)',
}

const iconButtonStyle: React.CSSProperties = {
  ...outlineButtonStyle,
  minWidth: '44px',
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const actionStyle: React.CSSProperties = {
  ...outlineButtonStyle,
  minHeight: '36px',
  padding: '0 12px',
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  textDecoration: 'none',
}

// Below 768px every row becomes a stacked card (UI-SPEC 7.1). Tokens only.
const STACK_CSS = `
@media (max-width: 767px) {
  .tours-table thead { display: none; }
  .tours-table, .tours-table tbody { display: block; }
  .tours-table tr { display: block; padding: 12px; border-bottom: 1px solid var(--admin-border); }
  .tours-table td { display: block; border-bottom: none; padding: 6px 0; }
}
`

/** "RU" / "ZH-HANT": the chip text and the aria-label share it. */
function languageName(locale: AppLocale): string {
  return locale.toUpperCase()
}

function priceText(value: number | null): string {
  return value === null ? '—' : money(Math.round(value * 100), 'eur')
}

export function ToursTable({ tours, onMove, moving = false }: ToursTableProps) {
  return (
    <div
      style={{
        overflowX: 'auto',
        border: '1px solid var(--admin-border)',
        borderRadius: 'var(--admin-radius-lg)',
        backgroundColor: 'var(--admin-surface)',
      }}
    >
      <style>{STACK_CSS}</style>
      <table className="tours-table" data-testid="tours-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Order</th>
            <th style={thStyle}>Photo</th>
            <th style={thStyle}>Tour</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Languages</th>
            <th style={thStyle}>Prices</th>
            <th style={thStyle}>Hours</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tours.map((t, index) => {
            const title = t.title || t.slug
            const cover = t.cover_path ? tourPhotoUrl(t.cover_path) : ''
            return (
              <tr key={t.id} data-testid="tour-row">
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'inline-flex', gap: '8px' }}>
                    <button
                      type="button"
                      aria-label={`Move ${title} up`}
                      disabled={index === 0 || moving}
                      onClick={() => onMove?.(t.id, 'up')}
                      style={{ ...iconButtonStyle, opacity: index === 0 || moving ? 0.4 : 1, cursor: index === 0 || moving ? 'not-allowed' : 'pointer' }}
                    >
                      <ArrowUp size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${title} down`}
                      disabled={index === tours.length - 1 || moving}
                      onClick={() => onMove?.(t.id, 'down')}
                      style={{
                        ...iconButtonStyle,
                        opacity: index === tours.length - 1 || moving ? 0.4 : 1,
                        cursor: index === tours.length - 1 || moving ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <ArrowDown size={16} aria-hidden="true" />
                    </button>
                  </div>
                </td>
                <td style={tdStyle}>
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail from the public bucket, no optimizer needed
                    <img
                      src={cover}
                      alt=""
                      width={64}
                      height={48}
                      style={{ width: '64px', height: '48px', objectFit: 'cover', borderRadius: 'var(--admin-radius-sm)', display: 'block' }}
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      style={{
                        width: '64px',
                        height: '48px',
                        borderRadius: 'var(--admin-radius-sm)',
                        background: 'var(--admin-hover)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--admin-text-muted)',
                      }}
                    >
                      <ImagePlus size={16} />
                    </div>
                  )}
                </td>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 'var(--admin-fw-strong)' as unknown as number }}>{title}</div>
                  <div style={mutedStyle}>{`/services/${t.slug}`}</div>
                </td>
                <td style={tdStyle}>
                  {t.status === 'published' ? (
                    <BadgeShell family="ok" label="Published" />
                  ) : (
                    <BadgeShell family="neutral" label="Draft" />
                  )}
                </td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '260px' }}>
                    {locales.map((locale) => {
                      const complete = t.completeness?.[locale] === true
                      const family = complete ? 'ok' : 'neutral'
                      const Icon = complete ? Check : Minus
                      return (
                        <span
                          key={locale}
                          data-testid="lang-chip"
                          aria-label={`${languageName(locale)}: ${complete ? 'complete' : 'not complete'}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 6px',
                            borderRadius: 'var(--admin-radius-sm)',
                            background: `var(--status-${family}-bg)`,
                            color: `var(--status-${family}-fg)`,
                            border: `1px solid var(--status-${family}-border)`,
                            fontSize: '11px',
                            fontWeight: 400,
                            letterSpacing: '0.04em',
                          }}
                        >
                          <Icon size={12} aria-hidden="true" />
                          {languageName(locale)}
                        </span>
                      )
                    })}
                  </div>
                </td>
                <td style={tdStyle}>
                  <span data-testid="tour-prices" style={amountStyle}>
                    {`E ${priceText(t.price_e_eur)} · S ${priceText(t.price_s_eur)} · V ${priceText(t.price_v_eur)}`}
                  </span>
                </td>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{`${t.hours_included} h included`}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Link href={`/admin/tours/${t.id}`} style={actionStyle}>
                      <Pencil size={14} aria-hidden="true" />
                      Edit
                    </Link>
                    {t.status === 'published' && (
                      <a href={`/services/${t.slug}`} target="_blank" rel="noopener noreferrer" style={actionStyle}>
                        <ExternalLink size={14} aria-hidden="true" />
                        View
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
