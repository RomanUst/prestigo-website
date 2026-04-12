'use client'

import { useState, useEffect, useRef, useCallback, useId } from 'react'
import { Plane, X } from 'lucide-react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import type { PlaceResult } from '@/types/booking'

// Module-level singleton — shared across all AddressInput instances
let loaderPromise: Promise<void> | null = null
function ensureMapsLoaded(): Promise<void> {
  if (typeof window !== 'undefined' && window.google?.maps?.places?.AutocompleteSuggestion) {
    return Promise.resolve()
  }
  if (loaderPromise) return loaderPromise
  setOptions({
    key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
    libraries: ['places'],
    v: 'weekly',
  })
  loaderPromise = importLibrary('places').then(() => undefined)
  return loaderPromise
}

interface Suggestion {
  placeId: string
  fullText: string
  mainText: string
  mainTextMatches: Array<{ startOffset: number; endOffset: number }>
  secondaryText: string
  types: string[]
}

interface AddressInputProps {
  label: string
  placeholder: string
  value: PlaceResult | null
  onSelect: (place: PlaceResult) => void
  onClear: () => void
  readOnly?: boolean
  readOnlyIcon?: boolean
  hasError?: boolean
  errorMessage?: string
  ariaLabel: string
  neverDisabled?: boolean
  onTextChange?: (text: string) => void
  required?: boolean
}

export default function AddressInput({
  label,
  placeholder,
  value,
  onSelect,
  onClear,
  readOnly = false,
  readOnlyIcon = false,
  hasError = false,
  errorMessage,
  ariaLabel,
  neverDisabled = false,
  onTextChange,
  required = false,
}: AddressInputProps) {
  const [mapsLoaded, setMapsLoaded] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const uid = useId()
  const uidClean = uid.replace(/:/g, '')
  const inputId = useRef(`address-input-${uidClean}`)
  const listboxId = useRef(`address-listbox-${uidClean}`)
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  // Store raw predictions so toPlace() is available on select without re-fetching
  const rawPredictionsRef = useRef<google.maps.places.PlacePrediction[]>([])
  const prevValueRef = useRef(value)
  const isTypingClearRef = useRef(false)

  // Load Maps JS API on mount
  useEffect(() => {
    ensureMapsLoaded().then(() => {
      sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken()
      setMapsLoaded(true)
    })
  }, [])

  // Sync when parent clears value externally (not via typing)
  useEffect(() => {
    if (prevValueRef.current !== null && value === null && !isTypingClearRef.current) {
      setInputValue('')
      setSuggestions([])
      setShowSuggestions(false)
    }
    isTypingClearRef.current = false
    prevValueRef.current = value
  }, [value])

  const fetchSuggestions = useCallback(async (text: string) => {
    if (!mapsLoaded || text.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      rawPredictionsRef.current = []
      return
    }
    try {
      const { suggestions: raw } =
        await window.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: text,
          sessionToken: sessionTokenRef.current ?? undefined,
          includedRegionCodes: ['cz', 'at', 'de', 'sk', 'hu', 'pl'],
          language: 'en',
        })
      // Store raw predictions for toPlace() access on select
      rawPredictionsRef.current = raw
        .map((s) => s.placePrediction)
        .filter((p): p is google.maps.places.PlacePrediction => p != null)

      const mapped: Suggestion[] = rawPredictionsRef.current.map((p) => {
        const mainText = p.mainText?.text ?? p.text.text
        const mainTextMatches = (p.mainText?.matches ?? []).map((m) => ({
          startOffset: m.startOffset ?? 0,
          endOffset: m.endOffset,
        }))
        return {
          placeId: p.placeId,
          fullText: p.text.text,
          mainText,
          mainTextMatches,
          secondaryText: p.secondaryText?.text ?? '',
          types: p.types ?? [],
        }
      })
      setSuggestions(mapped)
      setShowSuggestions(mapped.length > 0)
      setActiveIndex(-1)
    } catch {
      setSuggestions([])
      setShowSuggestions(false)
      rawPredictionsRef.current = []
    }
  }, [mapsLoaded])

  const handleSelect = useCallback(
    async (suggestion: Suggestion) => {
      setInputValue(suggestion.fullText)
      setSuggestions([])
      setShowSuggestions(false)
      setActiveIndex(-1)
      try {
        const prediction = rawPredictionsRef.current.find((p) => p.placeId === suggestion.placeId)
        if (!prediction) return
        const place = prediction.toPlace()
        await place.fetchFields({ fields: ['location'] })
        if (place.location) {
          onSelect({
            address: suggestion.fullText,
            placeId: suggestion.placeId,
            lat: place.location.lat(),
            lng: place.location.lng(),
          })
        }
        // Rotate session token — each selection ends one billing session
        sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken()
        rawPredictionsRef.current = []
      } catch (err) {
        console.error('Place details error:', err)
      }
    },
    [onSelect]
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value
    setInputValue(text)
    onTextChange?.(text)
    if (value !== null) {
      isTypingClearRef.current = true
      onClear()
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(text), 300)
  }

  const handleClear = () => {
    onClear()
    setInputValue('')
    setSuggestions([])
    setShowSuggestions(false)
    setActiveIndex(-1)
    rawPredictionsRef.current = []
  }

  const handleBlur = () => {
    blurTimeoutRef.current = setTimeout(() => setShowSuggestions(false), 200)
  }

  const handleFocus = () => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current)
    if (suggestions.length > 0) setShowSuggestions(true)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => Math.max(prev - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        handleSelect(suggestions[activeIndex])
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setActiveIndex(-1)
    }
  }

  // Read-only airport field
  if (readOnly) {
    return (
      <div>
        <p className="label" style={{ marginBottom: '8px' }} aria-hidden="true">
          {label}
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'var(--anthracite)',
            border: '1px solid var(--anthracite-light)',
            opacity: 0.6,
            padding: '12px 16px',
            cursor: 'default',
          }}
        >
          {readOnlyIcon && <Plane size={16} style={{ color: 'var(--copper)', flexShrink: 0 }} />}
          <span
            style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: '14px',
              fontWeight: 300,
              color: 'var(--copper)',
            }}
          >
            {value?.address ?? ''}
          </span>
        </div>
        <p
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 300,
            color: 'var(--warmgrey)',
            marginTop: '8px',
          }}
        >
          Auto-set for airport transfers.
        </p>
      </div>
    )
  }

  const borderColor = hasError ? '#C0392B' : 'var(--anthracite-light)'

  const renderMainText = (s: Suggestion) => {
    const { mainText, mainTextMatches } = s
    if (!mainTextMatches || mainTextMatches.length === 0) {
      return <span style={{ color: 'var(--warmgrey)', fontWeight: 300 }}>{mainText}</span>
    }
    const parts: React.ReactNode[] = []
    let cursor = 0
    for (const match of mainTextMatches) {
      if (match.startOffset > cursor) {
        parts.push(
          <span key={`pre-${cursor}`} style={{ color: 'var(--warmgrey)', fontWeight: 300 }}>
            {mainText.slice(cursor, match.startOffset)}
          </span>
        )
      }
      parts.push(
        <span key={`match-${match.startOffset}`} style={{ color: 'var(--copper)', fontWeight: 400 }}>
          {mainText.slice(match.startOffset, match.endOffset)}
        </span>
      )
      cursor = match.endOffset
    }
    if (cursor < mainText.length) {
      parts.push(
        <span key="tail" style={{ color: 'var(--warmgrey)', fontWeight: 300 }}>
          {mainText.slice(cursor)}
        </span>
      )
    }
    return parts
  }

  const PLACE_TYPE_LABELS: Record<string, string> = {
    airport: 'AIRPORT',
    international_airport: 'AIRPORT',
    lodging: 'HOTEL',
    hotel: 'HOTEL',
    train_station: 'TRAIN',
    transit_station: 'TRANSIT',
  }

  return (
    <div style={{ position: 'relative' }}>
      <label htmlFor={inputId.current} className="label" style={{ display: 'block', marginBottom: '8px' }}>
        {label}
        {required && (
          <span aria-hidden="true" style={{ color: 'var(--copper-light)', marginLeft: '4px' }}>*</span>
        )}
      </label>

      <div style={{ position: 'relative' }}>
        <input
          id={inputId.current}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={(e) => {
            handleFocus()
            e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={false}
          autoComplete="off"
          aria-label={ariaLabel}
          aria-required={required || undefined}
          aria-invalid={hasError || undefined}
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={listboxId.current}
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId.current}-option-${activeIndex}` : undefined
          }
          style={{
            width: '100%',
            background: 'var(--anthracite-mid)',
            border: `1px solid ${borderColor}`,
            padding: value !== null ? '12px 40px 12px 16px' : '12px 16px',
            minHeight: '48px',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '14px',
            fontWeight: 300,
            color: 'var(--offwhite)',
            outline: 'none',
          }}
        />

        {value !== null && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear address"
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--warmgrey)',
              padding: 0,
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {showSuggestions && (
        <ul
          id={listboxId.current}
          role="listbox"
          aria-label={ariaLabel}
          style={{
            position: 'absolute',
            width: '100%',
            zIndex: 50,
            background: 'var(--anthracite-mid)',
            border: '1px solid var(--anthracite-light)',
            borderTop: 'none',
            listStyle: 'none',
            margin: 0,
            padding: 0,
            maxHeight: '280px',
            overflowY: 'auto',
          }}
        >
          {suggestions.map((s, index) => {
            const isActive = index === activeIndex
            const placeType = s.types.reduce<string | undefined>(
              (found, t) => found ?? PLACE_TYPE_LABELS[t],
              undefined
            )
            return (
              <li
                key={s.placeId}
                id={`${listboxId.current}-option-${index}`}
                role="option"
                aria-selected={isActive}
                onMouseDown={() => handleSelect(s)}
                onMouseEnter={() => setActiveIndex(index)}
                style={{
                  minHeight: '44px',
                  padding: '0 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  background: isActive ? 'var(--anthracite-light)' : 'transparent',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-montserrat)',
                      fontSize: '13px',
                      lineHeight: 1.4,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {renderMainText(s)}
                  </div>
                  {s.secondaryText && (
                    <div
                      style={{
                        fontFamily: 'var(--font-montserrat)',
                        fontSize: '12px',
                        fontWeight: 300,
                        color: 'var(--warmgrey)',
                        lineHeight: 1.4,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {s.secondaryText}
                    </div>
                  )}
                </div>
                {placeType && (
                  <span
                    style={{
                      fontFamily: 'var(--font-montserrat)',
                      fontSize: '9px',
                      fontWeight: 400,
                      color: 'var(--warmgrey)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.2em',
                      marginLeft: '12px',
                      flexShrink: 0,
                    }}
                  >
                    {placeType.replace(/_/g, ' ')}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {hasError && errorMessage && (
        <p
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 400,
            color: '#C0392B',
            marginTop: '8px',
          }}
        >
          {errorMessage}
        </p>
      )}
    </div>
  )
}
