'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { ChevronLeft, CircleCheck, CircleX, ExternalLink } from 'lucide-react'
import { BadgeShell } from '@/components/admin/StatusBadge'
import { errorStyle, focusRingHandlers, inputBaseStyle, labelStyle } from '@/components/admin/adminFieldStyles'
import { outlineButtonStyle } from '@/components/admin/paymentShared'
import TourContentTabs from '@/components/admin/tours/TourContentTabs'
import TourPhotoManager from '@/components/admin/tours/TourPhotoManager'
import {
  COPY_SAVE_FAILED,
  COPY_SESSION,
  ConfirmDialog,
  accentButtonStyle,
  bodyTextStyle,
  cardStyle,
  cardTitleStyle,
  languageCount,
  languageList,
  mutedTextStyle,
} from '@/components/admin/tours/tourEditorShared'
import { locales, type AppLocale } from '@/i18n/locales'
import { isLocaleComplete } from '@/lib/tours/completeness'
import type { PublishFailure } from '@/lib/tours/publish-checklist'
import { TOUR_SLUG_MAX_LENGTH, TOUR_SLUG_PATTERN, type TourPhotoRow, type TourRow, type TourTranslationRow } from '@/lib/tours/types'

// Phase 93 (plan 93-10; TRIP-05, TRIP-03; UI-SPEC 7.3): the tour editor shell. It loads GET /api/admin/tours/<id> (tour,
// eight translation slots, photos, server checklist) and renders the header, the publish checklist (A), the basics (B)
// and the publish / unpublish dialogs (E). Content by language (C) and photos (D) are separate components that report
// their own unsaved state; a beforeunload warning is on while any card is dirty. The server stays authoritative: the
// checklist, the completeness and every bound are decided by the API, this file only mirrors them.

const COPY_LOAD_FAILED = 'Could not load the tour. Try again.'
const COPY_NOT_FOUND = 'This tour was not found.'
const COPY_SLUG_TAKEN = 'This address is already used by another tour.'
const COPY_BAD_ADDRESS = 'Use lowercase letters, numbers and single hyphens.'
const COPY_ADDRESS_LOCKED = 'The address cannot change after publishing. Google has indexed it.'

const SLUG_PREFIX = '/services/'
const SLUG_SUFFIX = '-day-trip'
const CHECKLIST_ID = 'tour-publish-checklist'

type AdminTourDetail = {
  tour: TourRow
  translations: Record<AppLocale, TourTranslationRow | null>
  photos: TourPhotoRow[]
  checklist: { ok: boolean; failures: PublishFailure[] }
}

/** The basics as the operator types them (everything a string, parsed on save). */
type BasicsForm = {
  address: string
  destination_label: string
  hours_included: string
  drive_minutes_each_way: string
  price_e_eur: string
  price_s_eur: string
  price_v_eur: string
}
type BasicsKey = keyof BasicsForm

function formFromTour(tour: TourRow): BasicsForm {
  const slug = tour.slug.endsWith(SLUG_SUFFIX) ? tour.slug.slice(0, -SLUG_SUFFIX.length) : tour.slug
  const text = (n: number | null) => (n === null || n === undefined ? '' : String(n))
  return {
    address: slug,
    destination_label: tour.destination_label ?? '',
    hours_included: text(tour.hours_included),
    drive_minutes_each_way: text(tour.drive_minutes_each_way),
    price_e_eur: text(tour.price_e_eur),
    price_s_eur: text(tour.price_s_eur),
    price_v_eur: text(tour.price_v_eur),
  }
}

function parseWhole(text: string, min: number, max: number): number | null {
  const t = text.trim()
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return n >= min && n <= max ? n : null
}

function parsePrice(text: string): number | null {
  const t = text.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  return n > 0 && n <= 100_000 ? n : null
}

/** Client mirror of tourBasicsSchema: field errors only; the server still decides. */
function validateBasics(form: BasicsForm, addressEditable: boolean): Partial<Record<BasicsKey, string>> {
  const errors: Partial<Record<BasicsKey, string>> = {}
  if (addressEditable) {
    const slug = `${form.address.trim()}${SLUG_SUFFIX}`
    if (!form.address.trim() || slug.length > TOUR_SLUG_MAX_LENGTH || !TOUR_SLUG_PATTERN.test(slug)) errors.address = COPY_BAD_ADDRESS
  }
  if (parseWhole(form.hours_included, 1, 12) === null) errors.hours_included = 'Enter a whole number from 1 to 12.'
  if (parseWhole(form.drive_minutes_each_way, 10, 600) === null) errors.drive_minutes_each_way = 'Enter a whole number from 10 to 600.'
  for (const key of ['price_e_eur', 'price_s_eur', 'price_v_eur'] as const) {
    if (parsePrice(form[key]) === null) errors[key] = 'Enter a price greater than 0.'
  }
  return errors
}

const CHECKLIST_ROWS: Array<{ text: string; failedBy: PublishFailure[] }> = [
  { text: 'English content complete', failedBy: ['EN_INCOMPLETE'] },
  { text: 'At least one photo, with a cover', failedBy: ['NO_PHOTO', 'NO_COVER'] },
  { text: 'Credit and licence for every photo that needs one', failedBy: ['MISSING_CREDIT'] },
  { text: 'Prices for all three cars', failedBy: ['MISSING_PRICE'] },
]

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
  gap: '16px',
}

export type TourEditorProps = { tourId: string }

export default function TourEditor({ tourId }: TourEditorProps) {
  const [detail, setDetail] = useState<AdminTourDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  const [edits, setEdits] = useState<Partial<BasicsForm>>({})
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [serverFieldError, setServerFieldError] = useState<Partial<Record<BasicsKey, string>>>({})

  const [contentDirty, setContentDirty] = useState(false)
  const [photosDirty, setPhotosDirty] = useState(false)

  const [dialog, setDialog] = useState<'publish' | 'unpublish' | null>(null)
  const [dialogBusy, setDialogBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [publishFailed, setPublishFailed] = useState(false)

  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  /** Reads the tour, its checklist and the other cards' data. `quiet` keeps the page on screen while it refreshes. */
  const load = useCallback(
    async (quiet: boolean) => {
      try {
        const res = await fetch(`/api/admin/tours/${tourId}`, { cache: 'no-store' })
        if (!alive.current) return
        if (!res.ok) {
          if (!quiet) {
            setLoadError(res.status === 401 || res.status === 403 ? COPY_SESSION : res.status === 404 ? COPY_NOT_FOUND : COPY_LOAD_FAILED)
          }
          return
        }
        const json = (await res.json()) as AdminTourDetail
        if (!alive.current) return
        setDetail(json)
        setLoadError(null)
      } catch {
        if (alive.current && !quiet) setLoadError(COPY_LOAD_FAILED)
      } finally {
        if (alive.current && !quiet) setLoading(false)
      }
    },
    [tourId],
  )

  useEffect(() => {
    setLoading(true)
    void load(false)
  }, [load, reloadTick])

  const base = useMemo(() => (detail ? formFromTour(detail.tour) : null), [detail])
  const form: BasicsForm | null = useMemo(() => (base ? { ...base, ...edits } : null), [base, edits])
  const basicsDirty = useMemo(() => {
    if (!base) return false
    return (Object.keys(edits) as BasicsKey[]).some((k) => edits[k] !== undefined && edits[k] !== base[k])
  }, [base, edits])

  const anyDirty = basicsDirty || contentDirty || photosDirty
  useEffect(() => {
    if (!anyDirty) return
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [anyDirty])

  const addressEditable = detail ? detail.tour.first_published_at === null : false
  const errors = useMemo(
    () => (form ? { ...validateBasics(form, addressEditable), ...serverFieldError } : {}),
    [form, addressEditable, serverFieldError],
  )

  function setField(key: BasicsKey, value: string) {
    setEdits((prev) => ({ ...prev, [key]: value }))
    setServerFieldError((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
    setSaveError(null)
  }

  async function saveBasics() {
    if (!detail || !form || !base || saving || !basicsDirty) return
    setTouched(true)
    const local = validateBasics(form, addressEditable)
    if (Object.keys(local).length > 0) return

    // Only the fields the operator changed go to the server.
    const patch: Record<string, string | number> = {}
    if (form.address !== base.address && addressEditable) patch.slug = `${form.address.trim()}${SLUG_SUFFIX}`
    if (form.destination_label !== base.destination_label) patch.destination_label = form.destination_label.trim()
    if (form.hours_included !== base.hours_included) patch.hours_included = Number(form.hours_included)
    if (form.drive_minutes_each_way !== base.drive_minutes_each_way) patch.drive_minutes_each_way = Number(form.drive_minutes_each_way)
    if (form.price_e_eur !== base.price_e_eur) patch.price_e_eur = Number(form.price_e_eur)
    if (form.price_s_eur !== base.price_s_eur) patch.price_s_eur = Number(form.price_s_eur)
    if (form.price_v_eur !== base.price_v_eur) patch.price_v_eur = Number(form.price_v_eur)
    if (Object.keys(patch).length === 0) return

    setSaving(true)
    setSaveError(null)
    setServerFieldError({})
    try {
      const res = await fetch(`/api/admin/tours/${tourId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!alive.current) return
      if (res.ok) {
        const json = (await res.json().catch(() => null)) as { tour?: TourRow } | null
        if (json?.tour) {
          const saved = json.tour
          setDetail((prev) => (prev ? { ...prev, tour: saved } : prev))
        }
        setEdits({})
        setTouched(false)
        await load(true)
        return
      }
      const body = (await res.json().catch(() => null)) as { code?: string } | null
      if (res.status === 401 || res.status === 403) setSaveError(COPY_SESSION)
      else if (body?.code === 'SLUG_TAKEN') setServerFieldError({ address: COPY_SLUG_TAKEN })
      else if (body?.code === 'SLUG_LOCKED') setServerFieldError({ address: COPY_ADDRESS_LOCKED })
      else setSaveError(COPY_SAVE_FAILED)
    } catch {
      if (alive.current) setSaveError(COPY_SAVE_FAILED)
    } finally {
      if (alive.current) setSaving(false)
    }
  }

  // Which languages are live: the saved row is complete (the server set is_complete).
  const liveLocales = useMemo<AppLocale[]>(() => {
    if (!detail) return []
    return locales.filter((l) => {
      const row = detail.translations[l]
      if (!row) return false
      // Same rule the server used when it set the flag; guards a stale flag after an English edit.
      return row.is_complete === true && isLocaleComplete(l, row, detail.translations.en).complete
    })
  }, [detail])

  const failures = detail?.checklist.failures ?? []
  const checklistOk = detail?.checklist.ok === true
  const title = detail?.translations.en?.title?.trim() || detail?.tour.slug || ''
  const published = detail?.tour.status === 'published'

  async function sendAction(action: 'publish' | 'unpublish') {
    if (dialogBusy) return
    setDialogBusy(true)
    setDialogError(null)
    try {
      const res = await fetch(`/api/admin/tours/${tourId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!alive.current) return
      if (res.ok) {
        const json = (await res.json().catch(() => null)) as { tour?: TourRow } | null
        if (json?.tour) {
          const saved = json.tour
          setDetail((prev) => (prev ? { ...prev, tour: saved } : prev))
        }
        setPublishFailed(false)
        setDialog(null)
        await load(true)
        return
      }
      const body = (await res.json().catch(() => null)) as { code?: string; failures?: PublishFailure[] } | null
      if (res.status === 422 && body?.code === 'CHECKLIST_FAILED') {
        const list = Array.isArray(body.failures) ? body.failures : []
        setDetail((prev) => (prev ? { ...prev, checklist: { ok: false, failures: list } } : prev))
        setPublishFailed(true)
        setDialog(null)
        return
      }
      setDialogError(res.status === 401 || res.status === 403 ? COPY_SESSION : COPY_SAVE_FAILED)
    } catch {
      if (alive.current) setDialogError(COPY_SAVE_FAILED)
    } finally {
      if (alive.current) setDialogBusy(false)
    }
  }

  // A language was saved or filled: keep the saved row, then re-read the tour so the checklist and the live languages follow.
  const onTranslationSaved = useCallback(
    (locale: AppLocale, translation: TourTranslationRow) => {
      setDetail((prev) => (prev ? { ...prev, translations: { ...prev.translations, [locale]: translation } } : prev))
      void load(true)
    },
    [load],
  )

  // Photos changed: show the server's new list at once when the answer carried one, then re-read the tour for the checklist.
  const onPhotosChanged = useCallback(
    async (next?: TourPhotoRow[]) => {
      if (next) setDetail((prev) => (prev ? { ...prev, photos: next } : prev))
      await load(true)
    },
    [load],
  )

  const closeDialog = useCallback(() => {
    setDialog(null)
    setDialogError(null)
  }, [])

  const backLink = (
    <Link
      href="/admin/tours"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: '16px',
        color: 'var(--admin-text-muted)',
        textDecoration: 'none',
        fontFamily: 'var(--font-montserrat)',
        fontSize: 'var(--admin-fs-label)',
        textTransform: 'uppercase',
        letterSpacing: '0.2em',
      }}
    >
      <ChevronLeft size={14} aria-hidden="true" /> All tours
    </Link>
  )

  if (loading && !detail) {
    return (
      <div style={{ maxWidth: 1080 }}>
        {backLink}
        <div data-testid="tour-editor-loading" aria-busy="true" style={{ display: 'grid', gap: '12px' }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ height: '96px', borderRadius: 'var(--admin-radius-lg)', background: 'var(--admin-hover)' }} />
          ))}
        </div>
      </div>
    )
  }

  if (!detail || !form) {
    return (
      <div style={{ maxWidth: 1080 }}>
        {backLink}
        <p role="alert" style={errorStyle}>
          {loadError ?? COPY_LOAD_FAILED}
        </p>
        {loadError !== COPY_SESSION && loadError !== COPY_NOT_FOUND && (
          <button type="button" onClick={() => setReloadTick((n) => n + 1)} style={{ ...outlineButtonStyle, marginTop: '8px' }}>
            Retry
          </button>
        )}
      </div>
    )
  }

  const rowFailed = (failedBy: PublishFailure[]) => failedBy.some((f) => failures.includes(f))
  const basicsMissing = failures.includes('MISSING_BASICS')
  const showError = (key: BasicsKey) => (touched || serverFieldError[key] ? errors[key] : undefined)

  return (
    <div style={{ maxWidth: 1080 }}>
      {backLink}

      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--admin-font-heading)',
              fontSize: 'var(--admin-fs-display)',
              fontWeight: 'var(--admin-fw-heading)',
              lineHeight: 1.2,
              color: 'var(--admin-text)',
              overflowWrap: 'anywhere',
            }}
          >
            {title}
          </h1>
          <BadgeShell family={published ? 'ok' : 'neutral'} label={published ? 'Published' : 'Draft'} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
          {published && (
            <Link
              href={`/services/${detail.tour.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...outlineButtonStyle, display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
            >
              View on site <ExternalLink size={14} aria-hidden="true" />
            </Link>
          )}
          {published ? (
            <button type="button" onClick={() => setDialog('unpublish')} style={outlineButtonStyle}>
              Unpublish
            </button>
          ) : (
            <button
              type="button"
              disabled={!checklistOk}
              aria-describedby={CHECKLIST_ID}
              onClick={() => setDialog('publish')}
              style={{
                ...accentButtonStyle,
                opacity: checklistOk ? 1 : 0.5,
                cursor: checklistOk ? 'pointer' : 'not-allowed',
              }}
            >
              Publish
            </button>
          )}
        </div>
      </header>

      {/* A. Publish checklist */}
      <section id={CHECKLIST_ID} aria-label="Publish checklist" style={cardStyle}>
        {published ? (
          <p style={{ ...bodyTextStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CircleCheck size={16} aria-hidden="true" style={{ color: 'var(--status-ok-fg)', flexShrink: 0 }} />
            <span>{`Published. Visible in ${languageCount(liveLocales.length)}: ${languageList(liveLocales)}.`}</span>
          </p>
        ) : (
          <>
            <h2 style={cardTitleStyle}>Publish checklist</h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '8px' }}>
              {CHECKLIST_ROWS.map((row) => (
                <ChecklistLine key={row.text} text={row.text} failed={rowFailed(row.failedBy)} />
              ))}
              {basicsMissing && <ChecklistLine text="Destination name and drive time" failed />}
            </ul>
            {publishFailed && (
              <p role="alert" style={{ ...errorStyle, marginTop: '12px' }}>
                The server found something still missing. Fix the lines marked above, then publish again.
              </p>
            )}
            <p style={{ ...mutedTextStyle, marginTop: '12px' }}>
              Only English blocks publishing. Other languages go live one by one when they are complete.
            </p>
          </>
        )}
      </section>

      {/* B. Basics */}
      <section aria-label="Basics" style={cardStyle}>
        <h2 style={cardTitleStyle}>Basics</h2>
        <div style={gridStyle}>
          <div>
            {addressEditable ? (
              <>
                <label htmlFor="tb-address" style={labelStyle}>
                  Address
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ ...mutedTextStyle, whiteSpace: 'nowrap' }}>{SLUG_PREFIX}</span>
                  <input
                    id="tb-address"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={TOUR_SLUG_MAX_LENGTH}
                    value={form.address}
                    aria-invalid={showError('address') ? true : undefined}
                    aria-describedby={showError('address') ? 'tb-address-error' : undefined}
                    onChange={(e) => setField('address', e.target.value)}
                    {...focusRingHandlers}
                    style={{ ...inputBaseStyle, fontWeight: 400, flex: 1, minWidth: 0 }}
                  />
                  <span style={{ ...mutedTextStyle, whiteSpace: 'nowrap' }}>{SLUG_SUFFIX}</span>
                </div>
                {showError('address') && (
                  <p id="tb-address-error" role="alert" style={errorStyle}>
                    {showError('address')}
                  </p>
                )}
              </>
            ) : (
              <>
                <span style={labelStyle}>Address</span>
                <p style={{ ...bodyTextStyle, minHeight: '44px', display: 'flex', alignItems: 'center' }}>
                  {`${SLUG_PREFIX}${detail.tour.slug}`}
                </p>
                <p style={mutedTextStyle}>{COPY_ADDRESS_LOCKED}</p>
              </>
            )}
          </div>

          <div>
            <label htmlFor="tb-destination" style={labelStyle}>
              Destination name for bookings (English)
            </label>
            <input
              id="tb-destination"
              type="text"
              autoComplete="off"
              maxLength={120}
              value={form.destination_label}
              onChange={(e) => setField('destination_label', e.target.value)}
              {...focusRingHandlers}
              style={{ ...inputBaseStyle, fontWeight: 400 }}
            />
            <p style={mutedTextStyle}>Shown in bookings, emails and the driver screen.</p>
          </div>

          <NumberField
            id="tb-hours"
            label="Hours at the destination (included)"
            value={form.hours_included}
            min={1}
            max={12}
            error={showError('hours_included')}
            onChange={(v) => setField('hours_included', v)}
          />
          <NumberField
            id="tb-drive"
            label="Drive time each way, minutes"
            value={form.drive_minutes_each_way}
            min={10}
            max={600}
            error={showError('drive_minutes_each_way')}
            onChange={(v) => setField('drive_minutes_each_way', v)}
          />

          <PriceField
            id="tb-price-e"
            label="Price per car, Business (E)"
            value={form.price_e_eur}
            error={showError('price_e_eur')}
            onChange={(v) => setField('price_e_eur', v)}
          />
          <PriceField
            id="tb-price-s"
            label="Price per car, First Class (S)"
            value={form.price_s_eur}
            error={showError('price_s_eur')}
            onChange={(v) => setField('price_s_eur', v)}
          />
          <PriceField
            id="tb-price-v"
            label="Price per car, Business Van (V)"
            value={form.price_v_eur}
            error={showError('price_v_eur')}
            onChange={(v) => setField('price_v_eur', v)}
          />
        </div>

        {saveError && (
          <p role="alert" style={{ ...errorStyle, marginTop: '16px' }}>
            {saveError}
          </p>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px', marginTop: '24px' }}>
          <button
            type="button"
            onClick={() => void saveBasics()}
            disabled={saving || !basicsDirty}
            style={{
              ...accentButtonStyle,
              opacity: saving || !basicsDirty ? 0.6 : 1,
              cursor: saving || !basicsDirty ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save basics'}
          </button>
          {basicsDirty && <span style={{ ...mutedTextStyle, fontSize: 'var(--admin-fs-body)' }}>Unsaved changes</span>}
        </div>
      </section>

      {/* C. Content by language */}
      <TourContentTabs
        tourId={tourId}
        translations={detail.translations}
        onTranslationSaved={onTranslationSaved}
        onDirtyChange={setContentDirty}
      />

      {/* D. Photos */}
      <TourPhotoManager tourId={tourId} photos={detail.photos} onPhotosChanged={onPhotosChanged} onDirtyChange={setPhotosDirty} />

      <ConfirmDialog
        isOpen={dialog === 'publish'}
        title={`Publish ${title}?`}
        confirmLabel="Publish"
        cancelLabel="Not yet"
        busy={dialogBusy}
        error={dialogError}
        onConfirm={() => void sendAction('publish')}
        onCancel={closeDialog}
      >
        {`It appears on the site in ${languageCount(liveLocales.length)}: ${languageList(liveLocales)}. Other languages go live when they are complete.`}
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={dialog === 'unpublish'}
        title={`Unpublish ${title}?`}
        tone="danger"
        confirmLabel="Unpublish"
        cancelLabel="Keep published"
        busy={dialogBusy}
        error={dialogError}
        onConfirm={() => void sendAction('unpublish')}
        onCancel={closeDialog}
      >
        The page disappears from the site and the sitemap, and it can no longer be booked. Bookings already made are not affected.
      </ConfirmDialog>
    </div>
  )
}

function ChecklistLine({ text, failed }: { text: string; failed: boolean }) {
  return (
    <li style={{ ...bodyTextStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
      {failed ? (
        <CircleX size={16} role="img" aria-label="Missing" style={{ color: 'var(--status-danger-fg)', flexShrink: 0 }} />
      ) : (
        <CircleCheck size={16} role="img" aria-label="Done" style={{ color: 'var(--status-ok-fg)', flexShrink: 0 }} />
      )}
      <span>{text}</span>
    </li>
  )
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  error,
  onChange,
}: {
  id: string
  label: string
  value: string
  min: number
  max: number
  error?: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        {...focusRingHandlers}
        style={{ ...inputBaseStyle, fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}
      />
      {error && (
        <p id={`${id}-error`} role="alert" style={errorStyle}>
          {error}
        </p>
      )}
    </div>
  )
}

function PriceField({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string
  label: string
  value: string
  error?: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
          {...focusRingHandlers}
          style={{ ...inputBaseStyle, fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}
        />
        <span style={{ ...mutedTextStyle, whiteSpace: 'nowrap' }}>EUR</span>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" style={errorStyle}>
          {error}
        </p>
      )}
    </div>
  )
}
