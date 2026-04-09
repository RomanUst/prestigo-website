'use client'

/**
 * AddressInputNew — Places API (New) implementation using places-autocomplete-hook.
 *
 * This component is a drop-in replacement for AddressInput.tsx that uses
 * google.maps.places.AutocompleteSuggestion (New Places API) instead of the
 * deprecated AutocompleteService.
 *
 * Activated via NEXT_PUBLIC_USE_NEW_PLACES_API=1 feature flag in BookingWidget.
 * Once QA on Vercel preview passes, the old AddressInput.tsx will be deleted
 * and this file renamed.
 *
 * Differences from old AddressInput:
 * - No Google Maps loader needed — hook handles API loading via REST call
 * - Session tokens are manually managed (required for efficient billing)
 * - Region restriction for Czech + neighboring countries (intercity use case)
 * - Response shape uses camelCase (placeId, text.text, structuredFormat.*)
 *   instead of snake_case (place_id, description, structured_formatting.*)
 */

import { useState, useEffect, useRef, useCallback, useId } from 'react'
import { Plane, X } from 'lucide-react'
import { usePlacesAutocomplete } from 'places-autocomplete-hook'
import type { PlaceResult } from '@/types/booking'

/**
 * Generate a random UUID v4 for Google Places session tokens.
 * Session tokens group autocomplete keystrokes + details fetch into a single
 * billing event — without them, each keystroke is a separate charge.
 */
function makeSessionToken(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

interface AddressInputNewProps {
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

export default function AddressInputNew({
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
}: AddressInputNewProps) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [sessionToken, setSessionToken] = useState<string>(() => makeSessionToken())
  const uid = useId()
  const uidClean = uid.replace(/:/g, '')
  const inputId = useRef(`address-input-${uidClean}`)
  const listboxId = useRef(`address-listbox-${uidClean}`)
  const containerRef = useRef<HTMLDivElement>(null)
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevValueRef = useRef(value)
  const isTypingClearRef = useRef(false)

  const {
    value: inputValue,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
    getPlaceDetails,
  } = usePlacesAutocomplete({
    apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
    debounceMs: 300,
    language: 'en',
    includedRegionCodes: ['cz', 'at', 'de', 'sk', 'hu', 'pl'],
    sessionToken,
  })

  // Sync when parent explicitly clears the value (null transition).
  // Skip clearing when the transition was caused by user typing.
  useEffect(() => {
    if (prevValueRef.current !== null && value === null && !isTypingClearRef.current) {
      setValue('', false)
      clearSuggestions()
      setShowSuggestions(false)
    }
    isTypingClearRef.current = false
    prevValueRef.current = value
  }, [value, setValue, clearSuggestions])

  // Show suggestions when status is OK and input has 2+ chars
  useEffect(() => {
    if (status === 'OK' && inputValue.length >= 2 && data.length > 0) {
      setShowSuggestions(true)
      setActiveIndex(-1)
    } else {
      setShowSuggestions(false)
    }
  }, [status, inputValue, data.length])

  const handleSelect = useCallback(
    async (description: string, placeId: string) => {
      setValue(description, false)
      clearSuggestions()
      setShowSuggestions(false)
      setActiveIndex(-1)
      try {
        const details = await getPlaceDetails(placeId, ['location'])
        if (details?.location) {
          onSelect({
            address: description,
            placeId,
            lat: details.location.latitude,
            lng: details.location.longitude,
          })
          // Rotate session token — each selection ends one session, starts a new one
          setSessionToken(makeSessionToken())
        }
      } catch (error) {
        console.error('Place details error:', error)
      }
    },
    [setValue, clearSuggestions, onSelect, getPlaceDetails]
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value
    setValue(text)
    onTextChange?.(text)
    if (value !== null) {
      isTypingClearRef.current = true
      onClear()
    }
  }

  const handleClear = () => {
    onClear()
    setValue('', false)
    clearSuggestions()
    setShowSuggestions(false)
    setActiveIndex(-1)
    // Start a fresh session after clearing
    setSessionToken(makeSessionToken())
  }

  const handleBlur = () => {
    blurTimeoutRef.current = setTimeout(() => {
      setShowSuggestions(false)
    }, 200)
  }

  const handleFocus = () => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current)
    }
    if (status === 'OK' && inputValue.length >= 2 && data.length > 0) {
      setShowSuggestions(true)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => Math.min(prev + 1, data.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => Math.max(prev - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && data[activeIndex]) {
        const s = data[activeIndex]
        handleSelect(s.text.text, s.placeId)
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

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <label htmlFor={inputId.current} className="label" style={{ display: 'block', marginBottom: '8px' }}>
        {label}
        {required && (
          <span aria-hidden="true" style={{ color: 'var(--copper-light)', marginLeft: '4px' }}>*</span>
        )}
      </label>

      {/* Input wrapper */}
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

        {/* Clear button — visible when a place is selected */}
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

      {/* Autocomplete dropdown */}
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
          {data.length === 0 ? (
            <li
              style={{
                padding: '12px 16px',
                fontFamily: 'var(--font-montserrat)',
                fontSize: '13px',
                fontWeight: 300,
                color: 'var(--warmgrey)',
              }}
            >
              No results. Try a different address.
            </li>
          ) : (
            data.map((suggestion, index) => {
              const { placeId, text, structuredFormat, types } = suggestion
              const mainText = structuredFormat.mainText.text
              const mainTextMatches = structuredFormat.mainText.matches
              const secondaryText = structuredFormat.secondaryText?.text
              const isActive = index === activeIndex
              const placeType = types?.[0]

              // Highlight matched substrings in main_text with copper.
              // New API provides matches as [{endOffset}] — each match starts
              // at index 0 (or right after the previous match's end) and runs
              // to endOffset. This is simpler than the old API's {offset, length}.
              const renderMainText = () => {
                if (!mainTextMatches || mainTextMatches.length === 0) {
                  return (
                    <span style={{ color: 'var(--warmgrey)', fontWeight: 300 }}>{mainText}</span>
                  )
                }
                const parts: React.ReactNode[] = []
                let cursor = 0
                for (const match of mainTextMatches) {
                  const end = match.endOffset
                  if (end > cursor) {
                    parts.push(
                      <span
                        key={`match-${cursor}-${end}`}
                        style={{ color: 'var(--copper-light)', fontWeight: 400 }}
                      >
                        {mainText.slice(cursor, end)}
                      </span>
                    )
                    cursor = end
                  }
                }
                if (cursor < mainText.length) {
                  parts.push(
                    <span
                      key="tail"
                      style={{ color: 'var(--warmgrey)', fontWeight: 300 }}
                    >
                      {mainText.slice(cursor)}
                    </span>
                  )
                }
                return parts
              }

              return (
                <li
                  key={placeId}
                  id={`${listboxId.current}-option-${index}`}
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={() => handleSelect(text.text, placeId)}
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
                      {renderMainText()}
                    </div>
                    {secondaryText && (
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
                        {secondaryText}
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
            })
          )}
        </ul>
      )}

      {/* Error message */}
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
