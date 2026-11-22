'use client'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { inputBaseStyle, labelStyle } from '@/components/admin/adminFieldStyles'
import { outlineButtonStyle } from '@/components/admin/paymentShared'
import { FONT, iconButtonStyle, mutedTextStyle, ringHandlers, warnTextStyle } from '@/components/admin/tours/tourEditorShared'

// Phase 93 (plan 93-10; TRIP-05; UI-SPEC 7.3 C): the list editor of the language card. One component for both shapes:
// a list of single lines (highlights, included, not included: one field) and a list of two-field rows (itinerary step
// title + text, question + answer). Each row has move up / down and delete buttons (44x44) whose aria-labels carry the
// row number. The text of a row is controlled by the parent; this file owns no state.

export type ListEditorField = {
  key: string
  /** Names the input for assistive tech ("Step 2 title"); empty = just "Question 2". Ignored for one-field lists. */
  label: string
  multiline?: boolean
  rows?: number
}

export type ListEditorRow = Record<string, string>

type Props = {
  id: string
  /** Heading of the group, e.g. "Highlights". */
  label: string
  helper?: string
  /** Singular noun for the rows: "highlight", "step", "included item", "question". */
  itemName: string
  /** Visible text of the add button: "Add highlight", "Add step", "Add item", "Add question". */
  addLabel: string
  fields: ListEditorField[]
  rows: ListEditorRow[]
  onChange: (rows: ListEditorRow[]) => void
  lang: string
  dir: 'ltr' | 'rtl'
  /** Shown under the list in the warn colour, e.g. "Required to publish this language.". */
  warning?: string
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export default function TourListEditor({ id, label, helper, itemName, addLabel, fields, rows, onChange, lang, dir, warning }: Props) {
  const labelId = `${id}-label`

  function update(index: number, key: string, value: string) {
    onChange(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
  }

  function move(index: number, by: -1 | 1) {
    const to = index + by
    if (to < 0 || to >= rows.length) return
    const next = [...rows]
    ;[next[index], next[to]] = [next[to], next[index]]
    onChange(next)
  }

  function remove(index: number) {
    onChange(rows.filter((_, i) => i !== index))
  }

  function add() {
    onChange([...rows, Object.fromEntries(fields.map((f) => [f.key, '']))])
  }

  return (
    <div role="group" aria-labelledby={labelId} style={{ marginBottom: '24px' }}>
      <span id={labelId} style={labelStyle}>
        {label}
      </span>
      {helper && <p style={{ ...mutedTextStyle, marginBottom: '8px' }}>{helper}</p>}

      <div style={{ display: 'grid', gap: '12px' }}>
        {rows.map((row, index) => {
          const n = index + 1
          return (
            <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: '8px' }}>
                {fields.map((field) => {
                  const name = [`${capitalise(itemName)} ${n}`, fields.length === 1 ? '' : field.label.toLowerCase()].filter(Boolean).join(' ')
                  const common = {
                    id: `${id}-${index}-${field.key}`,
                    'aria-label': name,
                    value: row[field.key] ?? '',
                    lang,
                    dir,
                    ...ringHandlers,
                  }
                  return field.multiline ? (
                    <textarea
                      key={field.key}
                      {...common}
                      rows={field.rows ?? 3}
                      onChange={(e) => update(index, field.key, e.target.value)}
                      style={{ ...inputBaseStyle, fontWeight: 400, resize: 'vertical', fontFamily: FONT }}
                    />
                  ) : (
                    <input
                      key={field.key}
                      {...common}
                      type="text"
                      autoComplete="off"
                      onChange={(e) => update(index, field.key, e.target.value)}
                      style={{ ...inputBaseStyle, fontWeight: 400 }}
                    />
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <button
                  type="button"
                  aria-label={`Move ${itemName} ${n} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  style={{ ...iconButtonStyle, opacity: index === 0 ? 0.4 : 1 }}
                >
                  <ArrowUp size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${itemName} ${n} down`}
                  disabled={index === rows.length - 1}
                  onClick={() => move(index, 1)}
                  style={{ ...iconButtonStyle, opacity: index === rows.length - 1 ? 0.4 : 1 }}
                >
                  <ArrowDown size={16} aria-hidden="true" />
                </button>
                <button type="button" aria-label={`Delete ${itemName} ${n}`} onClick={() => remove(index)} style={iconButtonStyle}>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {warning && <p style={warnTextStyle}>{warning}</p>}

      <button
        type="button"
        onClick={add}
        style={{ ...outlineButtonStyle, marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
      >
        <Plus size={14} aria-hidden="true" /> {addLabel}
      </button>
    </div>
  )
}
