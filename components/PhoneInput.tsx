'use client'

/**
 * Phone field with a country-code picker.
 *
 * The customer picks a country (flag + code) and types the national number;
 * the parent gets one string back: E.164 when the number is plausible
 * (see composePhone in lib/phone-countries.ts), "" when the field is empty.
 * The parent keeps validating that string with isValidIntlPhone, and the
 * server keeps refusing anything that is not E.164.
 *
 * A full international number typed or pasted into the number box
 * ("+44 7700 900123", "0044…", or a browser autofill) switches the picker to
 * that country. The picker starts on the country of the browser's language
 * ("en-GB" -> UK), falling back to Czechia.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  DEFAULT_COUNTRY,
  DIAL_CODES,
  POPULAR_COUNTRIES,
  composePhone,
  flagEmoji,
  guessCountry,
  splitPhone,
} from '@/lib/phone-countries'

export const PHONE_NATIONAL_PLACEHOLDER = '123 456 789'

type Props = {
  id: string
  value: string
  onChange: (value: string) => void
  /** Fired when the number box loses focus (not when the picker does). */
  onBlur?: () => void
  inputRef?: Ref<HTMLInputElement>
  name?: string
  readOnly?: boolean
  required?: boolean
  invalid?: boolean
  describedBy?: string
  /** Applied to both the picker box and the number box so they match the form. */
  className?: string
  style?: CSSProperties
}

function initialState(value: string): { country: string; national: string } {
  const split = splitPhone(value)
  if (split) return { country: split.iso, national: split.national }
  return { country: DEFAULT_COUNTRY, national: value }
}

export default function PhoneInput({
  id,
  value,
  onChange,
  onBlur,
  inputRef,
  name,
  readOnly,
  required,
  invalid,
  describedBy,
  className,
  style,
}: Props) {
  const locale = useLocale()
  const t = useTranslations('PhoneInput')
  const [{ country, national }, setState] = useState(() => initialState(value))
  const [mounted, setMounted] = useState(false)
  const [pickerFocused, setPickerFocused] = useState(false)
  const lastEmitted = useRef<string>(value)
  const countryChosen = useRef(false)

  // After hydration: start on the visitor's own country when nothing is filled in yet.
  useEffect(() => {
    setMounted(true)
    if (!value && !countryChosen.current) {
      const guessed = guessCountry(typeof navigator !== 'undefined' ? navigator.languages : undefined)
      if (guessed) setState((s) => ({ ...s, country: guessed }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A value set from outside (profile prefill, session restore) is split back into country + number.
  useEffect(() => {
    if (value === lastEmitted.current) return
    lastEmitted.current = value
    const split = splitPhone(value, country)
    setState((s) => (split ? { country: split.iso, national: split.national } : { ...s, national: value }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function emit(next: string) {
    lastEmitted.current = next
    onChange(next)
  }

  function handleNumber(text: string) {
    const split = /^\s*(\+|00)/.test(text) ? splitPhone(text, country) : null
    if (split) {
      countryChosen.current = true
      setState({ country: split.iso, national: split.national })
      emit(composePhone(split.iso, split.national))
      return
    }
    setState({ country, national: text })
    emit(composePhone(country, text))
  }

  function handleCountry(iso: string) {
    countryChosen.current = true
    setState({ country: iso, national })
    emit(composePhone(iso, national))
  }

  // Names come from the browser's Intl data, so they are only rendered after
  // hydration (server and browser ICU data can differ).
  const options = useMemo(() => {
    if (!mounted) return null
    let names: Intl.DisplayNames | null = null
    try {
      names = new Intl.DisplayNames([locale, 'en'], { type: 'region' })
    } catch {
      names = null
    }
    const nameOf = (iso: string) => names?.of(iso) ?? iso
    const label = (iso: string) => `${flagEmoji(iso)} ${nameOf(iso)} (+${DIAL_CODES[iso]})`
    const all = Object.keys(DIAL_CODES)
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b), locale))
      .map((iso) => ({ iso, text: label(iso) }))
    const popular = POPULAR_COUNTRIES.map((iso) => ({ iso, text: label(iso) }))
    return { popular, all }
  }, [mounted, locale])

  const boxStyle: CSSProperties = {
    ...style,
    width: 'auto',
    flex: '0 0 auto',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
    ...(pickerFocused ? { outline: '2px solid var(--copper, #BFA06A)', outlineOffset: 2 } : null),
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
      <div className={className} style={boxStyle}>
        <span aria-hidden="true">{flagEmoji(country)}</span>
        <span aria-hidden="true">+{DIAL_CODES[country]}</span>
        <span aria-hidden="true" style={{ fontSize: '0.7em', opacity: 0.7 }}>▾</span>
        <select
          id={`${id}-country`}
          aria-label={t('countryLabel')}
          value={country}
          disabled={readOnly}
          onChange={(e) => handleCountry(e.target.value)}
          onFocus={() => setPickerFocused(true)}
          onBlur={() => setPickerFocused(false)}
          autoComplete="tel-country-code"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', fontSize: 16 }}
        >
          {options ? (
            <>
              {options.popular.map((o) => (
                <option key={`p-${o.iso}`} value={o.iso}>{o.text}</option>
              ))}
              <option disabled value="">──────────</option>
              {options.all
                .filter((o) => !(POPULAR_COUNTRIES as readonly string[]).includes(o.iso))
                .map((o) => (
                  <option key={o.iso} value={o.iso}>{o.text}</option>
                ))}
            </>
          ) : (
            <option value={country}>+{DIAL_CODES[country]}</option>
          )}
        </select>
      </div>
      <input
        id={id}
        ref={inputRef}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder={PHONE_NATIONAL_PLACEHOLDER}
        value={national}
        readOnly={readOnly}
        onChange={(e) => handleNumber(e.target.value)}
        onBlur={onBlur}
        aria-required={required ? 'true' : undefined}
        required={required}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        className={className}
        style={{ ...style, flex: '1 1 auto', minWidth: 0, width: 'auto' }}
      />
    </div>
  )
}
