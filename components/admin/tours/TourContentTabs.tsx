'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { CircleCheck, Minus, RefreshCw } from 'lucide-react'
import { errorStyle, inputBaseStyle, labelStyle } from '@/components/admin/adminFieldStyles'
import { outlineButtonStyle } from '@/components/admin/paymentShared'
import TourListEditor, { type ListEditorRow } from '@/components/admin/tours/TourListEditor'
import {
  COPY_SAVE_FAILED,
  COPY_SESSION,
  ConfirmDialog,
  FONT,
  LANGUAGE_NAMES,
  accentButtonStyle,
  cardStyle,
  cardTitleStyle,
  localeCode,
  mutedTextStyle,
  ringHandlers,
  warnBannerStyle,
  warnTextStyle,
} from '@/components/admin/tours/tourEditorShared'
import { locales, rtlLocales, type AppLocale } from '@/i18n/locales'
import { isLocaleComplete, type LocaleCompleteness, type LocaleLeak } from '@/lib/tours/completeness'
import type { TourTranslationRow } from '@/lib/tours/types'

// Phase 93 (plan 93-10; TRIP-05; D-08, D-23, D-24; UI-SPEC 7.3 C): content by language. Eight WAI-ARIA tabs, one panel with
// the twelve fields of the selected language, list editors for the repeated parts, and per-language Save. Completeness is
// decided by the server on every save (the PUT answer carries complete / missing / leak); until a save happens the tab
// shows the verdict of the same pure rule over the stored row. The inputs carry the language and direction of their tab so
// the operator types in the right direction (AR is rtl); no web font is forced, system fonts cover Arabic, Devanagari and
// Chinese.

const COPY_REQUIRED = 'Required to publish this language.'
const COPY_LEAK_ENGLISH = 'This text looks like English. Translate it before this language can go live.'
const COPY_ZH_FIRST = 'Save the ZH tab first.'

/** Script names for the leak-guard message. */
const SCRIPT_NAMES: Partial<Record<AppLocale, string>> = {
  ru: 'Cyrillic',
  ar: 'Arabic',
  hi: 'Devanagari',
  zh: 'Chinese',
  'zh-hant': 'Chinese',
}

/** BCP 47 tag for the `lang` attribute (zh needs the script so the browser picks the right glyph set). */
const LANG_ATTR: Record<AppLocale, string> = {
  en: 'en',
  ru: 'ru',
  es: 'es',
  fr: 'fr',
  ar: 'ar',
  hi: 'hi',
  zh: 'zh-Hans',
  'zh-hant': 'zh-Hant',
}

type Draft = {
  title: string
  short_description: string
  description: string
  pickup_info: string
  important_info: string
  seo_title: string
  seo_description: string
  highlights: string[]
  includes: string[]
  excludes: string[]
  itinerary: Array<{ title: string; body: string }>
  faq: Array<{ q: string; a: string }>
}

function draftFromRow(row: TourTranslationRow | null): Draft {
  return {
    title: row?.title ?? '',
    short_description: row?.short_description ?? '',
    description: row?.description ?? '',
    pickup_info: row?.pickup_info ?? '',
    important_info: row?.important_info ?? '',
    seo_title: row?.seo_title ?? '',
    seo_description: row?.seo_description ?? '',
    highlights: [...(row?.highlights ?? [])],
    includes: [...(row?.includes ?? [])],
    excludes: [...(row?.excludes ?? [])],
    itinerary: (row?.itinerary ?? []).map((i) => ({ title: i.title, body: i.body })),
    faq: (row?.faq ?? []).map((f) => ({ q: f.q, a: f.a })),
  }
}

function sameDraft(a: Draft, b: Draft): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function emptyRow(tourId: string, locale: AppLocale): TourTranslationRow {
  return { ...draftFromRow(null), tour_id: tourId, locale, is_complete: false, updated_at: '' }
}

type Answer = Pick<LocaleCompleteness, 'complete' | 'missing' | 'leak'>

export type TourContentTabsProps = {
  tourId: string
  translations: Record<AppLocale, TourTranslationRow | null>
  /** A language was saved or filled: the editor patches its copy and re-reads the checklist. */
  onTranslationSaved: (locale: AppLocale, translation: TourTranslationRow) => void
  onDirtyChange?: (dirty: boolean) => void
}

const tabListStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
  borderBottom: '1px solid var(--admin-border)',
  marginBottom: '24px',
}

const TEXT_STYLE: CSSProperties = { ...inputBaseStyle, fontWeight: 400, fontFamily: FONT }

export default function TourContentTabs({ tourId, translations, onTranslationSaved, onDirtyChange }: TourContentTabsProps) {
  const [active, setActive] = useState<AppLocale>('en')
  const [edits, setEdits] = useState<Partial<Record<AppLocale, Draft>>>({})
  const [answers, setAnswers] = useState<Partial<Record<AppLocale, Answer>>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [switchTo, setSwitchTo] = useState<AppLocale | null>(null)
  const [fillOpen, setFillOpen] = useState(false)
  const [fillBusy, setFillBusy] = useState(false)
  const [fillError, setFillError] = useState<string | null>(null)
  const tabRefs = useRef<Partial<Record<AppLocale, HTMLButtonElement | null>>>({})
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const enRow = translations.en

  const dirtyLocales = useMemo(
    () => locales.filter((l) => edits[l] !== undefined && !sameDraft(edits[l] as Draft, draftFromRow(translations[l]))),
    [edits, translations],
  )
  const isDirty = useCallback((l: AppLocale) => dirtyLocales.includes(l), [dirtyLocales])
  const anyDirty = dirtyLocales.length > 0
  useEffect(() => {
    onDirtyChange?.(anyDirty)
  }, [anyDirty, onDirtyChange])

  /** The server answer when there is one, else the verdict of the same rule over the stored row. */
  const statusOf = useCallback(
    (l: AppLocale): Answer => {
      const answer = answers[l]
      if (answer) return answer
      return isLocaleComplete(l, translations[l] ?? emptyRow(tourId, l), enRow)
    },
    [answers, translations, enRow, tourId],
  )

  const draft: Draft = edits[active] ?? draftFromRow(translations[active])
  const dirty = isDirty(active)
  const status = statusOf(active)
  const dir: 'ltr' | 'rtl' = rtlLocales.includes(active) ? 'rtl' : 'ltr'
  const lang = LANG_ATTR[active]
  const code = localeCode(active)

  function setDraft(next: Draft) {
    setEdits((prev) => ({ ...prev, [active]: next }))
    setError(null)
  }
  function patch<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft({ ...draft, [key]: value })
  }

  function dropEdits(l: AppLocale) {
    setEdits((prev) => {
      const next = { ...prev }
      delete next[l]
      return next
    })
  }

  /** PUTs the language; true when saved. */
  async function save(l: AppLocale): Promise<boolean> {
    const body = edits[l]
    if (!body || saving) return false
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/tours/${tourId}/translations/${l}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!alive.current) return false
      if (!res.ok) {
        setError(res.status === 401 || res.status === 403 ? COPY_SESSION : COPY_SAVE_FAILED)
        return false
      }
      const json = (await res.json()) as { translation: TourTranslationRow; complete: boolean; missing: Answer['missing']; leak: LocaleLeak }
      if (!alive.current) return false
      setAnswers((prev) => {
        const next: Partial<Record<AppLocale, Answer>> = { ...prev, [l]: { complete: json.complete, missing: json.missing ?? [], leak: json.leak ?? null } }
        // es / fr are judged against the English text: after an English save their verdict is read from the rows again.
        if (l === 'en') {
          delete next.es
          delete next.fr
        }
        return next
      })
      dropEdits(l)
      onTranslationSaved(l, json.translation)
      return true
    } catch {
      if (alive.current) setError(COPY_SAVE_FAILED)
      return false
    } finally {
      if (alive.current) setSaving(false)
    }
  }

  function requestTab(l: AppLocale) {
    if (l === active) return
    if (dirty) {
      setSwitchTo(l)
      return
    }
    setError(null)
    setActive(l)
  }

  async function saveAndSwitch() {
    const target = switchTo
    if (!target) return
    const ok = await save(active)
    if (!ok || !alive.current) {
      setSwitchTo(null)
      return
    }
    setSwitchTo(null)
    setActive(target)
  }

  function discardAndSwitch() {
    const target = switchTo
    if (!target) return
    dropEdits(active)
    setError(null)
    setSwitchTo(null)
    setActive(target)
  }

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let to = index
    if (e.key === 'ArrowRight') to = (index + 1) % locales.length
    else if (e.key === 'ArrowLeft') to = (index - 1 + locales.length) % locales.length
    else if (e.key === 'Home') to = 0
    else if (e.key === 'End') to = locales.length - 1
    else return
    e.preventDefault()
    const target = locales[to]
    tabRefs.current[target]?.focus()
    requestTab(target)
  }

  async function fillFromZh() {
    if (fillBusy) return
    setFillBusy(true)
    setFillError(null)
    try {
      const res = await fetch(`/api/admin/tours/${tourId}/fill-zh-hant`, { method: 'POST' })
      if (!alive.current) return
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { code?: string } | null
        setFillError(
          res.status === 401 || res.status === 403 ? COPY_SESSION : body?.code === 'ZH_INCOMPLETE' ? COPY_ZH_FIRST : COPY_SAVE_FAILED,
        )
        return
      }
      const json = (await res.json()) as { translation: TourTranslationRow }
      if (!alive.current) return
      dropEdits('zh-hant')
      setAnswers((prev) => {
        const next = { ...prev }
        delete next['zh-hant']
        return next
      })
      setFillOpen(false)
      onTranslationSaved('zh-hant', json.translation)
    } catch {
      if (alive.current) setFillError(COPY_SAVE_FAILED)
    } finally {
      if (alive.current) setFillBusy(false)
    }
  }

  const missing = new Set<string>(status.missing as string[])
  const requiredHelper = (key: string) => (missing.has(key) ? COPY_REQUIRED : undefined)
  const leakMessage =
    status.leak === 'english'
      ? COPY_LEAK_ENGLISH
      : status.leak === 'script'
        ? `This text is not in ${SCRIPT_NAMES[active] ?? 'the right'} script. Translate it before this language can go live.`
        : null

  const zhReady = statusOf('zh').complete && !isDirty('zh')

  const textRows = (items: string[]): ListEditorRow[] => items.map((text) => ({ text }))
  const fromTextRows = (rows: ListEditorRow[]) => rows.map((r) => r.text ?? '')

  return (
    <section aria-label="Content by language" style={cardStyle}>
      <h2 style={cardTitleStyle}>Content by language</h2>

      <div role="tablist" aria-label="Language" style={tabListStyle}>
        {locales.map((l, index) => {
          const st = statusOf(l)
          const selected = l === active
          const count = st.missing.length
          const name = LANGUAGE_NAMES[l]
          const ariaLabel = st.complete
            ? `${name}, complete`
            : count > 0
              ? `${name}, ${count} ${count === 1 ? 'field' : 'fields'} missing`
              : `${name}, text needs translating`
          return (
            <button
              key={l}
              ref={(el) => {
                tabRefs.current[l] = el
              }}
              id={`tour-tab-${l}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="tour-content-panel"
              aria-label={ariaLabel}
              tabIndex={selected ? 0 : -1}
              onClick={() => requestTab(l)}
              onKeyDown={(e) => onTabKeyDown(e, index)}
              style={{
                minHeight: '44px',
                padding: '0 12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'transparent',
                border: 'none',
                borderBottom: selected ? '2px solid var(--admin-accent)' : '2px solid transparent',
                color: selected ? 'var(--admin-text)' : 'var(--admin-text-muted)',
                fontFamily: FONT,
                fontSize: 'var(--admin-fs-body)',
                fontWeight: 'var(--admin-fw-strong)',
                cursor: 'pointer',
              }}
            >
              {st.complete ? (
                <CircleCheck size={14} aria-hidden="true" style={{ color: 'var(--status-ok-fg)' }} />
              ) : (
                <Minus size={14} aria-hidden="true" style={{ color: 'var(--status-warn-fg)' }} />
              )}
              {localeCode(l)}
            </button>
          )
        })}
      </div>

      <div id="tour-content-panel" role="tabpanel" aria-labelledby={`tour-tab-${active}`} key={active}>
        {!status.complete && (
          <p role="status" style={warnBannerStyle}>
            {`${LANGUAGE_NAMES[active]} is not on the site yet. Fill every required field to publish it.`}
          </p>
        )}

        <TextField
          id={`tc-${active}-title`}
          label="Title"
          value={draft.title}
          aim={60}
          lang={lang}
          dir={dir}
          required={requiredHelper('title')}
          extra={leakMessage}
          onChange={(v) => patch('title', v)}
        />
        <TextField
          id={`tc-${active}-short`}
          label="Short description"
          value={draft.short_description}
          aim={200}
          rows={3}
          lang={lang}
          dir={dir}
          required={requiredHelper('short_description')}
          helper="Shown on cards."
          onChange={(v) => patch('short_description', v)}
        />
        <TextField
          id={`tc-${active}-about`}
          label="About this trip"
          value={draft.description}
          rows={8}
          lang={lang}
          dir={dir}
          required={requiredHelper('description')}
          helper="A blank line starts a new paragraph."
          onChange={(v) => patch('description', v)}
        />

        <TourListEditor
          id={`tc-${active}-highlights`}
          label="Highlights"
          helper="One line each."
          itemName="highlight"
          addLabel="Add highlight"
          fields={[{ key: 'text', label: 'text' }]}
          rows={textRows(draft.highlights)}
          onChange={(rows) => patch('highlights', fromTextRows(rows))}
          lang={lang}
          dir={dir}
          warning={requiredHelper('highlights')}
        />
        <TourListEditor
          id={`tc-${active}-itinerary`}
          label="Itinerary"
          helper="Start with the pickup, end with the return."
          itemName="step"
          addLabel="Add step"
          fields={[
            { key: 'title', label: 'title' },
            { key: 'body', label: 'text', multiline: true, rows: 3 },
          ]}
          rows={draft.itinerary.map((i) => ({ title: i.title, body: i.body }))}
          onChange={(rows) => patch('itinerary', rows.map((r) => ({ title: r.title ?? '', body: r.body ?? '' })))}
          lang={lang}
          dir={dir}
          warning={requiredHelper('itinerary')}
        />
        <TourListEditor
          id={`tc-${active}-includes`}
          label="What's included"
          itemName="included item"
          addLabel="Add item"
          fields={[{ key: 'text', label: 'text' }]}
          rows={textRows(draft.includes)}
          onChange={(rows) => patch('includes', fromTextRows(rows))}
          lang={lang}
          dir={dir}
          warning={requiredHelper('includes')}
        />
        <TourListEditor
          id={`tc-${active}-excludes`}
          label="Not included"
          itemName="not included item"
          addLabel="Add item"
          fields={[{ key: 'text', label: 'text' }]}
          rows={textRows(draft.excludes)}
          onChange={(rows) => patch('excludes', fromTextRows(rows))}
          lang={lang}
          dir={dir}
          warning={requiredHelper('excludes')}
        />

        <TextField
          id={`tc-${active}-pickup`}
          label="Pickup"
          value={draft.pickup_info}
          rows={4}
          lang={lang}
          dir={dir}
          required={requiredHelper('pickup_info')}
          onChange={(v) => patch('pickup_info', v)}
        />
        <TextField
          id={`tc-${active}-important`}
          label="Important information"
          value={draft.important_info}
          rows={4}
          lang={lang}
          dir={dir}
          helper="A blank line starts a new item."
          onChange={(v) => patch('important_info', v)}
        />

        <TourListEditor
          id={`tc-${active}-faq`}
          label="Questions and answers"
          itemName="question"
          addLabel="Add question"
          fields={[
            { key: 'q', label: '' },
            { key: 'a', label: 'answer', multiline: true, rows: 3 },
          ]}
          rows={draft.faq.map((f) => ({ q: f.q, a: f.a }))}
          onChange={(rows) => patch('faq', rows.map((r) => ({ q: r.q ?? '', a: r.a ?? '' })))}
          lang={lang}
          dir={dir}
          warning={requiredHelper('faq')}
        />

        <TextField
          id={`tc-${active}-seo-title`}
          label="SEO title"
          value={draft.seo_title}
          aim={60}
          lang={lang}
          dir={dir}
          required={requiredHelper('seo_title')}
          onChange={(v) => patch('seo_title', v)}
        />
        <TextField
          id={`tc-${active}-seo-description`}
          label="SEO description"
          value={draft.seo_description}
          aim={160}
          lang={lang}
          dir={dir}
          required={requiredHelper('seo_description')}
          onChange={(v) => patch('seo_description', v)}
        />
      </div>

      {error && (
        <p role="alert" style={{ ...errorStyle, marginTop: '8px' }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px', marginTop: '16px' }}>
        <button
          type="button"
          onClick={() => void save(active)}
          disabled={!dirty || saving}
          style={{ ...accentButtonStyle, opacity: !dirty || saving ? 0.6 : 1, cursor: !dirty || saving ? 'not-allowed' : 'pointer' }}
        >
          {saving ? 'Saving…' : `Save ${code}`}
        </button>
        {dirty && <span style={{ ...mutedTextStyle, fontSize: 'var(--admin-fs-body)' }}>Unsaved changes</span>}

        {active === 'zh-hant' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              disabled={!zhReady}
              aria-describedby={zhReady ? undefined : 'tc-zh-first-note'}
              onClick={() => {
                setFillError(null)
                setFillOpen(true)
              }}
              style={{
                ...outlineButtonStyle,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                opacity: zhReady ? 1 : 0.5,
                cursor: zhReady ? 'pointer' : 'not-allowed',
              }}
            >
              <RefreshCw size={14} aria-hidden="true" /> Fill from Simplified Chinese
            </button>
            {!zhReady && (
              <span id="tc-zh-first-note" style={mutedTextStyle}>
                {COPY_ZH_FIRST}
              </span>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={switchTo !== null}
        title={`You have unsaved changes in ${LANGUAGE_NAMES[active]}.`}
        confirmLabel="Save and switch"
        cancelLabel="Discard changes"
        busy={saving}
        error={error}
        onConfirm={() => void saveAndSwitch()}
        onCancel={discardAndSwitch}
        onDismiss={() => setSwitchTo(null)}
      />

      <ConfirmDialog
        isOpen={fillOpen}
        title="Fill from Simplified Chinese"
        confirmLabel="Replace text"
        cancelLabel="Keep my text"
        initialFocus="cancel"
        busy={fillBusy}
        error={fillError}
        onConfirm={() => void fillFromZh()}
        onCancel={() => setFillOpen(false)}
      >
        Replace the Traditional Chinese text with a conversion of the Simplified Chinese text? Your edits in this tab will be lost.
      </ConfirmDialog>
    </section>
  )
}

function TextField({
  id,
  label,
  value,
  onChange,
  lang,
  dir,
  rows,
  aim,
  helper,
  required,
  extra,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  lang: string
  dir: 'ltr' | 'rtl'
  rows?: number
  /** Aim for this many characters (counter only, never a block). */
  aim?: number
  helper?: string
  /** "Required to publish this language." when the field is missing. */
  required?: string
  /** A danger line under the field (leak guard). */
  extra?: string | null
}) {
  const describedBy = [helper || aim ? `${id}-help` : null, required ? `${id}-required` : null, extra ? `${id}-extra` : null]
    .filter(Boolean)
    .join(' ')
  const common = {
    id,
    value,
    lang,
    dir,
    'aria-describedby': describedBy || undefined,
    ...ringHandlers,
  }
  return (
    <div style={{ marginBottom: '24px' }}>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      {rows ? (
        <textarea {...common} rows={rows} onChange={(e) => onChange(e.target.value)} style={{ ...TEXT_STYLE, resize: 'vertical' }} />
      ) : (
        <input {...common} type="text" autoComplete="off" onChange={(e) => onChange(e.target.value)} style={TEXT_STYLE} />
      )}
      {(helper || aim) && (
        <p id={`${id}-help`} style={{ ...mutedTextStyle, marginTop: '4px' }}>
          {[aim ? `${value.length} characters, aim for ${aim}.` : null, helper].filter(Boolean).join(' ')}
        </p>
      )}
      {required && (
        <p id={`${id}-required`} style={warnTextStyle}>
          {required}
        </p>
      )}
      {extra && (
        <p id={`${id}-extra`} role="alert" style={errorStyle}>
          {extra}
        </p>
      )}
    </div>
  )
}
