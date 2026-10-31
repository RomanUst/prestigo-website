'use client'
import { useState } from 'react'

// Shared table + note styles for the stats tabs (D-17): same markup as the
// admin accounts table, with React-node cells so callers can pass Links.

const cellStyle: React.CSSProperties = {
  padding: '0 12px',
  height: '48px',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  color: 'var(--offwhite)',
}

const emptyCellStyle: React.CSSProperties = {
  padding: '32px',
  textAlign: 'center',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  color: 'var(--warmgrey)',
}

interface StatsTableProps {
  headers: string[]
  /** Columns from this index on are right-aligned (numeric columns). */
  rightAlignFrom: number
  rows: { key: string; cells: React.ReactNode[] }[]
  emptyText: string
  totalRow?: React.ReactNode[]
}

export function StatsTable({ headers, rightAlignFrom, rows, emptyText, totalRow }: StatsTableProps) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  return (
    <div
      style={{
        width: '100%',
        border: '1px solid var(--anthracite-light)',
        borderRadius: '4px',
        overflow: 'hidden',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr
            style={{
              background: 'var(--anthracite)',
              borderBottom: '1px solid var(--anthracite-light)',
              height: '40px',
            }}
          >
            {headers.map((h, i) => (
              <th
                key={h}
                style={{
                  padding: '0 12px',
                  textAlign: i >= rightAlignFrom ? 'right' : 'left',
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '11px',
                  fontWeight: 400,
                  textTransform: 'uppercase',
                  letterSpacing: '0.4em',
                  color: 'var(--warmgrey)',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} style={emptyCellStyle}>
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.key}
                onMouseEnter={() => setHoveredRow(row.key)}
                onMouseLeave={() => setHoveredRow(null)}
                style={{
                  background: hoveredRow === row.key ? 'var(--anthracite-light)' : 'var(--anthracite-mid)',
                  borderBottom: '1px solid var(--anthracite-light)',
                }}
              >
                {row.cells.map((cell, i) => (
                  <td key={i} style={{ ...cellStyle, textAlign: i >= rightAlignFrom ? 'right' : 'left' }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
          {rows.length > 0 && totalRow && (
            <tr style={{ background: 'var(--anthracite)', borderBottom: '1px solid var(--anthracite-light)' }}>
              {totalRow.map((cell, i) => (
                <td
                  key={i}
                  style={{
                    ...cellStyle,
                    fontWeight: 500,
                    textAlign: i >= rightAlignFrom ? 'right' : 'left',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export function StatsNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: '12px 0 0',
        fontFamily: 'var(--font-montserrat)',
        fontSize: '11px',
        lineHeight: 1.5,
        color: 'var(--warmgrey)',
      }}
    >
      {children}
    </p>
  )
}
