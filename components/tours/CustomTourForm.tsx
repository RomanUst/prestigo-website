'use client'

// Phase 93 (plan 93-34; TRIP-06; D-16, D-17; UI-SPEC Surface 6): the custom-tour request form.
// Posts to /api/custom-tour (93-32); the server validates again, rate-limits and checks CSRF. The query prefill
// arrives already validated from the page (parseCustomTourQuery); the chip only exists for a published tour.
// No start time field: a custom tour has no fixed pickup window (the day trips themselves start at any time).

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { DayPicker } from 'react-day-picker'
import { CalendarDays, CircleCheck, LoaderCircle, Minus, Plus, X } from 'lucide-react'
import { Link } from '@/i18n/routing'
import { rtlLocales, type AppLocale } from '@/i18n/locales'
import { formatLocaleDate } from '@/lib/locale-date'
import { getPragueTodayISO, shiftIsoDate } from '@/lib/prague-date'
import { isValidIntlPhone, normalizePhone, PHONE_PLACEHOLDER } from '@/lib/phone'

export interface CustomTourFormProps {
  /** The starting tour (published and complete in this locale) or null. */
  tour: { slug: string; title: string } | null
  /** Already validated by the page: a bookable ISO date. */
  initialDate: string | null
  /** Already validated by the page: 1..50. */
  initialPax: number | null
}

const HUB_HREF = '/services/day-trips-from-prague'
const MAX_PEOPLE = 50
const MAX_TEXT = 1000
const COUNTER_FROM = 900
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper'

// Dark theme overrides for the inline DayPicker (same set the booking box uses).
const calendarStyles = {
  root: { fontFamily: 'var(--font-montserrat)', color: 'var(--offwhite)', background: 'transparent' },
  caption_label: { color: 'var(--offwhite)', fontSize: 12, fontWeight: 400, fontFamily: 'var(--font-montserrat)', letterSpacing: '0.18em', textTransform: 'uppercase' as const },
  weekday: { color: 'var(--warmgrey)', fontSize: 12, fontWeight: 400 },
  day: { color: 'var(--offwhite)', fontSize: 13, width: 36, height: 36 },
  day_button: { color: 'var(--offwhite)', fontSize: 13, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'transparent', border: 'none' },
  nav: { color: 'var(--copper)' },
  button_previous: { color: 'var(--copper)', border: '1px solid var(--copper)', background: 'transparent', cursor: 'pointer', width: 32, height: 32 },
  button_next: { color: 'var(--copper)', border: '1px solid var(--copper)', background: 'transparent', cursor: 'pointer', width: 32, height: 32 },
  chevron: { fill: 'var(--copper)', width: 16, height: 16 },
}

const calendarModifiers = {
  selected: { background: 'var(--copper)', color: 'var(--anthracite)', borderRadius: 0 },
  disabled: { color: 'var(--warmgrey)', opacity: 0.4, cursor: 'not-allowed' },
  today: { outline: '1px solid var(--anthracite-light)', outlineOffset: '-2px' },
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateOf(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

type Field = 'where' | 'date' | 'people' | 'name' | 'email' | 'phone'
type FieldErrors = Partial<Record<Field, string>>
type FormError = '429' | 'generic' | 'network' | null

const FIELD_ORDER: Field[] = ['where', 'date', 'people', 'name', 'email', 'phone']

export default function CustomTourForm({ tour, initialDate, initialPax }: CustomTourFormProps) {
  const t = useTranslations('Tours.request')
  const tb = useTranslations('Tours.box')
  const locale = useLocale() as AppLocale
  const rtl = (rtlLocales as readonly string[]).includes(locale)
  const uid = useId()

  const [tourSlug, setTourSlug] = useState<string | null>(tour?.slug ?? null)
  const [where, setWhere] = useState(tour?.title ?? '')
  const [date, setDate] = useState(initialDate ?? '')
  const [people, setPeople] = useState(String(initialPax ?? 2))
  const [wishes, setWishes] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<FormError>(null)
  const [busy, setBusy] = useState(false)
  const [sentEmail, setSentEmail] = useState<string | null>(null)
  const [dateOpen, setDateOpen] = useState(false)
  // Prague "today", read after mount so the server and the first client render agree.
  const [today, setToday] = useState('')

  const sentHeadingRef = useRef<HTMLHeadingElement>(null)
  const dateBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setToday(getPragueTodayISO())
  }, [])

  useEffect(() => {
    if (sentEmail !== null) sentHeadingRef.current?.focus()
  }, [sentEmail])

  const peopleNumber = /^\d+$/.test(people.trim()) ? Number(people.trim()) : NaN
  const peopleValid = Number.isInteger(peopleNumber) && peopleNumber >= 1 && peopleNumber <= MAX_PEOPLE

  function changePeople(delta: number) {
    const base = peopleValid ? peopleNumber : 2
    setPeople(String(Math.min(MAX_PEOPLE, Math.max(1, base + delta))))
    clearError('people')
  }

  function clearError(field: Field) {
    setErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  function closeDatePanel() {
    setDateOpen(false)
    dateBtnRef.current?.focus()
  }

  function selectDate(d: Date | undefined) {
    if (!d) return
    setDate(isoOf(d))
    clearError('date')
    closeDatePanel()
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (!where.trim()) next.where = t('errWhere')
    if (!date) next.date = t('errDate')
    if (!peopleValid) next.people = t('errPeople')
    if (!name.trim()) next.name = t('errName')
    if (!EMAIL_RE.test(email.trim())) next.email = t('errEmail')
    if (!isValidIntlPhone(phone)) next.phone = t('errPhone')
    return next
  }

  function messageFor(field: string): string | null {
    switch (field) {
      case 'where':
        return t('errWhere')
      case 'date':
        return t('errDate')
      case 'people':
        return t('errPeople')
      case 'name':
        return t('errName')
      case 'email':
        return t('errEmail')
      case 'phone':
        return t('errPhone')
      default:
        return null
    }
  }

  function focusFirst(next: FieldErrors) {
    const first = FIELD_ORDER.find((f) => next[f])
    if (!first) return
    // The date control is a button; the others are inputs with a stable id.
    document.getElementById(`${uid}-${first}`)?.focus()
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const found = validate()
    setErrors(found)
    setFormError(null)
    if (Object.keys(found).length > 0) {
      focusFirst(found)
      return
    }

    setBusy(true)
    const trimmedEmail = email.trim()
    const payload: Record<string, unknown> = {
      where: where.trim(),
      date,
      people: peopleNumber,
      wishes: wishes.trim(),
      name: name.trim(),
      email: trimmedEmail,
      phone: normalizePhone(phone) ?? phone.trim(),
      locale,
      website,
    }
    if (tourSlug) payload.tourSlug = tourSlug

    let res: Response
    try {
      res = await fetch('/api/custom-tour', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch {
      setFormError('network')
      setBusy(false)
      return
    }

    if (res.ok) {
      setBusy(false)
      setSentEmail(trimmedEmail)
      return
    }

    if (res.status === 429) {
      setFormError('429')
    } else if (res.status === 400) {
      const body = (await res.json().catch(() => null)) as { fieldErrors?: Record<string, unknown> } | null
      const mapped: FieldErrors = {}
      for (const key of Object.keys(body?.fieldErrors ?? {})) {
        const message = messageFor(key)
        if (message) mapped[key as Field] = message
      }
      if (Object.keys(mapped).length > 0) {
        setErrors(mapped)
        focusFirst(mapped)
      } else {
        setFormError('generic')
      }
    } else if (res.status === 422) {
      const body = (await res.json().catch(() => null)) as { code?: string } | null
      if (body?.code === 'INVALID_PHONE') {
        setErrors({ phone: t('errPhone') })
        focusFirst({ phone: t('errPhone') })
      } else {
        setFormError('generic')
      }
    } else {
      setFormError('generic')
    }
    setBusy(false)
  }

  if (sentEmail !== null) {
    return (
      <div
        role="status"
        className="rounded-[4px] border-s-[3px] border-s-copper bg-anthracite-mid p-6"
      >
        <CircleCheck size={24} aria-hidden="true" className="mb-3 text-copper-light" />
        <h2
          ref={sentHeadingRef}
          tabIndex={-1}
          className="m-0 mb-3 font-display text-[24px] font-normal leading-[1.2] text-offwhite outline-none"
        >
          {t('sentTitle')}
        </h2>
        <p className="m-0 mb-6 text-[14px] font-light leading-[1.75] text-warmgrey">
          {t('sentBody', { email: sentEmail })}
        </p>
        <Link href={HUB_HREF} className={`btn-secondary inline-flex min-h-[44px] items-center ${FOCUS_RING}`}>
          {t('seeTrips')}
        </Link>
      </div>
    )
  }

  const labelClass = 'label mb-2 block'
  const errorClass = 'mt-2 text-[14px] font-light text-[#f87171]'
  const helperClass = 'mt-2 text-[11px] font-light leading-[1.5] text-warmgrey'
  const inputClass = (invalid: boolean) =>
    `block w-full min-h-[44px] rounded-[4px] border bg-anthracite px-4 py-3 font-body text-[16px] font-light text-offwhite ${
      invalid ? 'border-[#f87171]' : 'border-anthracite-light'
    } ${FOCUS_RING}`
  const stepperBtn = `flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] border border-anthracite-light text-offwhite transition-colors duration-200 hover:border-copper disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-anthracite-light ${FOCUS_RING}`

  const minDate = today ? shiftIsoDate(today, 1) : ''
  const formErrorText =
    formError === '429' ? t('err429') : formError === 'network' ? t('errNetwork') : formError === 'generic' ? t('errGeneric') : null

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={busy} className="relative flex flex-col gap-6">
      {tourSlug && tour ? (
        <div className="flex min-h-[44px] items-center justify-between gap-2 rounded-[4px] border border-copper bg-anthracite-mid py-2 ps-4 pe-2">
          <span className="text-[14px] font-normal text-offwhite">
            {t('basedOn', { title: tour.title })}
          </span>
          <button
            type="button"
            aria-label={t('remove', { title: tour.title })}
            disabled={busy}
            onClick={() => setTourSlug(null)}
            className={`flex h-11 w-11 shrink-0 items-center justify-center text-warmgrey hover:text-offwhite ${FOCUS_RING}`}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {/* Where */}
      <div>
        <label htmlFor={`${uid}-where`} className={labelClass}>
          {t('where')}
        </label>
        <textarea
          id={`${uid}-where`}
          value={where}
          onChange={(e) => {
            setWhere(e.target.value)
            clearError('where')
          }}
          readOnly={busy}
          maxLength={MAX_TEXT}
          placeholder={t('wherePlaceholder')}
          aria-required="true"
          aria-invalid={errors.where ? true : undefined}
          aria-describedby={errors.where ? `${uid}-where-err` : undefined}
          className={`${inputClass(Boolean(errors.where))} min-h-[96px]`}
        />
        {errors.where ? (
          <p id={`${uid}-where-err`} className={errorClass}>
            {errors.where}
          </p>
        ) : null}
      </div>

      {/* Date */}
      <div>
        <span id={`${uid}-date-label`} className={labelClass}>
          {t('date')}
        </span>
        <button
          ref={dateBtnRef}
          id={`${uid}-date`}
          type="button"
          disabled={busy}
          aria-labelledby={`${uid}-date-label ${uid}-date-value`}
          aria-expanded={dateOpen}
          aria-controls={`${uid}-date-panel`}
          aria-invalid={errors.date ? true : undefined}
          aria-describedby={errors.date ? `${uid}-date-err` : undefined}
          onClick={() => setDateOpen((v) => !v)}
          className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-[4px] border bg-anthracite px-4 py-3 text-start text-[14px] ${
            errors.date ? 'border-[#f87171]' : 'border-anthracite-light'
          } ${FOCUS_RING}`}
        >
          <span id={`${uid}-date-value`} className={date ? 'text-offwhite' : 'text-warmgrey'}>
            {date ? formatLocaleDate(date, locale) : tb('chooseDate')}
          </span>
          <CalendarDays className="h-4 w-4 shrink-0 text-copper-light" aria-hidden="true" />
        </button>
        {dateOpen ? (
          <div
            id={`${uid}-date-panel`}
            className="mt-2 flex justify-center rounded-[4px] border border-anthracite-light bg-anthracite p-2"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                closeDatePanel()
              }
            }}
          >
            <DayPicker
              mode="single"
              dir={rtl ? 'rtl' : 'ltr'}
              selected={date ? dateOf(date) : undefined}
              defaultMonth={dateOf(date || minDate || getPragueTodayISO())}
              onSelect={selectDate}
              disabled={(d: Date) => isoOf(d) < (minDate || shiftIsoDate(getPragueTodayISO(), 1))}
              styles={calendarStyles as Parameters<typeof DayPicker>[0]['styles']}
              modifiersStyles={calendarModifiers}
            />
          </div>
        ) : null}
        {errors.date ? (
          <p id={`${uid}-date-err`} className={errorClass}>
            {errors.date}
          </p>
        ) : null}
      </div>

      {/* People */}
      <div>
        <label htmlFor={`${uid}-people`} className={labelClass}>
          {t('people')}
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={tb('fewer')}
            disabled={busy || (peopleValid && peopleNumber <= 1)}
            onClick={() => changePeople(-1)}
            className={stepperBtn}
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <input
            id={`${uid}-people`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={people}
            readOnly={busy}
            onChange={(e) => {
              setPeople(e.target.value.replace(/[^\d]/g, '').slice(0, 2))
              clearError('people')
            }}
            aria-required="true"
            aria-invalid={errors.people ? true : undefined}
            aria-describedby={errors.people ? `${uid}-people-err` : undefined}
            className={`${inputClass(Boolean(errors.people))} w-20 text-center`}
          />
          <button
            type="button"
            aria-label={tb('more')}
            disabled={busy || (peopleValid && peopleNumber >= MAX_PEOPLE)}
            onClick={() => changePeople(1)}
            className={stepperBtn}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {errors.people ? (
          <p id={`${uid}-people-err`} className={errorClass}>
            {errors.people}
          </p>
        ) : null}
      </div>

      {/* Wishes */}
      <div>
        <label htmlFor={`${uid}-wishes`} className={labelClass}>
          {t('wishes')}
        </label>
        <textarea
          id={`${uid}-wishes`}
          value={wishes}
          onChange={(e) => setWishes(e.target.value)}
          readOnly={busy}
          maxLength={MAX_TEXT}
          placeholder={t('wishesPlaceholder')}
          className={`${inputClass(false)} min-h-[120px]`}
        />
        {wishes.length >= COUNTER_FROM ? (
          <p className={`${helperClass} text-end`} aria-live="polite">
            <bdi>
              {wishes.length} / {MAX_TEXT}
            </bdi>
          </p>
        ) : null}
      </div>

      {/* Name */}
      <div>
        <label htmlFor={`${uid}-name`} className={labelClass}>
          {t('name')}
        </label>
        <input
          id={`${uid}-name`}
          type="text"
          autoComplete="name"
          value={name}
          readOnly={busy}
          onChange={(e) => {
            setName(e.target.value.replace(/[\r\n]+/g, ' '))
            clearError('name')
          }}
          aria-required="true"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${uid}-name-err` : undefined}
          className={inputClass(Boolean(errors.name))}
        />
        {errors.name ? (
          <p id={`${uid}-name-err`} className={errorClass}>
            {errors.name}
          </p>
        ) : null}
      </div>

      {/* Email */}
      <div>
        <label htmlFor={`${uid}-email`} className={labelClass}>
          {t('email')}
        </label>
        <input
          id={`${uid}-email`}
          type="email"
          autoComplete="email"
          value={email}
          readOnly={busy}
          onChange={(e) => {
            setEmail(e.target.value)
            clearError('email')
          }}
          aria-required="true"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? `${uid}-email-err` : undefined}
          className={inputClass(Boolean(errors.email))}
        />
        {errors.email ? (
          <p id={`${uid}-email-err`} className={errorClass}>
            {errors.email}
          </p>
        ) : null}
      </div>

      {/* Phone */}
      <div>
        <label htmlFor={`${uid}-phone`} className={labelClass}>
          {t('phone')}
        </label>
        <input
          id={`${uid}-phone`}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={PHONE_PLACEHOLDER}
          value={phone}
          readOnly={busy}
          onChange={(e) => {
            setPhone(e.target.value)
            clearError('phone')
          }}
          onBlur={(e) => {
            const normalized = normalizePhone(e.target.value)
            if (normalized && normalized !== e.target.value) setPhone(normalized)
          }}
          aria-required="true"
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={errors.phone ? `${uid}-phone-err` : `${uid}-phone-help`}
          className={inputClass(Boolean(errors.phone))}
        />
        <p id={`${uid}-phone-help`} className={helperClass}>
          {t('phoneHelper')}
        </p>
        {errors.phone ? (
          <p id={`${uid}-phone-err`} className={errorClass}>
            {errors.phone}
          </p>
        ) : null}
      </div>

      {/* Honeypot: never shown, never focused */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          data-testid="custom-tour-website"
        />
      </div>

      <p className="m-0 text-[11px] font-light leading-[1.5] text-warmgrey">
        {t.rich('privacy', {
          link: (chunks) => (
            <Link href="/privacy" className={`underline underline-offset-2 ${FOCUS_RING}`}>
              {chunks}
            </Link>
          ),
        })}
      </p>

      {formErrorText ? (
        <p role="alert" className="m-0 text-[14px] font-light leading-[1.5] text-[#f87171]">
          {formErrorText}
        </p>
      ) : null}

      <button type="submit" className="btn-primary min-h-[44px] w-full sm:w-auto" aria-busy={busy} disabled={busy}>
        {busy ? (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
            {t('sending')}
          </span>
        ) : (
          t('send')
        )}
      </button>
    </form>
  )
}
