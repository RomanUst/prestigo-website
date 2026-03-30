'use client'

import { useState, useEffect, useRef, useCallback, useId } from 'react'
import { Plane, X } from 'lucide-react'
import usePlacesAutocomplete, { getGeocode, getLatLng } from 'use-places-autocomplete'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import type { PlaceResult } from '@/types/booking'

// Module-level singleton loader — shared across all AddressInput instances
let loaderPromise: Promise<void> | null = null
function ensureMapsLoaded(): Promise<void> {
  if (loaderPromise) return loaderPromise
  setOptions({
    key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
    libraries: ['places'],
    v: 'weekly',
  })
  loaderPromise = importLibrary('places').then(() => undefined)
  return loaderPromise
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
}: AddressInputProps) {
  const [mapsLoaded, setMapsLoaded] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const uid = useId()
  const listboxId = useRef(`address-listbox-${uid.replace(/:/g, '')}`)
  const containerRef = useRef<HTMLDivElement>(null)
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    ready,
    value: inputValue,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
    init,
  } = usePlacesAutocomplete({
    initOnMount: false,
    debounce: 300,
    requestOptions: {},
  })

  // Load Google Maps on mount
  useEffect(() => {
    ensureMapsLoaded().then(() => {
      init()
      setMapsLoaded(true)
    })
  }, [init])

  // Sync inputValue with external value changes (e.g., on clear or airport auto-fill)
  useEffect(() => {
    if (value === null && inputValue !== '') {
      setValue('', false)
      clearSuggestions()
      setShowSuggestions(false)
    }
  }, [value, inputValue, setValue, clearSuggestions])

  // Show suggestions when status is OK and input has 2+ chars
  useEffect(() => {
    if (status === 'OK' && inputValue.length >= 2) {
      setShowSuggestions(true)
      setActiveIndex(-1)
    } else {
      setShowSuggestions(false)
    }
  }, [status, inputValue])

  const handleSelect = useCallback(
    async (description: string, placeId: string) => {
      setValue(description, false)
      clearSuggestions()
      setShowSuggestions(false)
      setActiveIndex(-1)
      try {
        const results = await getGeocode({ address: description })
        const { lat, lng } = getLatLng(results[0])
        onSelect({ address: description, placeId, lat, lng })
      } catch (error) {
        console.error('Geocode error:', error)
      }
    },
    [setValue, clearSuggestions, onSelect]
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value
    setValue(text)
    // If user modifies text after a selection, clear the parent's value
    if (value !== null) {
      onClear()
    }
  }

  const handleClear = () => {
    onClear()
    setValue('', false)
    clearSuggestions()
    setShowSuggestions(false)
    setActiveIndex(-1)
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
    if (status === 'OK' && inputValue.length >= 2) {
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
        handleSelect(s.description, s.place_id)
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
        <p className="label" style={{ marginBottom: '8px' }}>
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

  // Compute border color for editable input
  const borderColor = hasError ? '#C0392B' : 'var(--anthracite-light)'

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <p className="label" style={{ marginBottom: '8px' }}>
        {label}
      </p>

      {/* Input wrapper */}
      <div style={{ position: 'relative' }}>
        <input
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
          disabled={!mapsLoaded && !ready}
          autoComplete="off"
          aria-label={ariaLabel}
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
              const {
                place_id,
                description,
                structured_formatting: { main_text, main_text_matched_substrings, secondary_text },
                types,
              } = suggestion
              const isActive = index === activeIndex
              const placeType = types?.[0]

              // Render main_text with copper highlighting for matched substrings
              const renderMainText = () => {
                if (!main_text_matched_substrings || main_text_matched_substrings.length === 0) {
                  return (
                    <span style={{ color: 'var(--warmgrey)', fontWeight: 300 }}>{main_text}</span>
                  )
                }
                const parts: React.ReactNode[] = []
                let lastIndex = 0
                for (const match of main_text_matched_substrings) {
                  if (match.offset > lastIndex) {
                    parts.push(
                      <span
                        key={`pre-${match.offset}`}
                        style={{ color: 'var(--warmgrey)', fontWeight: 300 }}
                      >
                        {main_text.slice(lastIndex, match.offset)}
                      </span>
                    )
                  }
                  parts.push(
                    <span
                      key={`match-${match.offset}`}
                      style={{ color: 'var(--copper)', fontWeight: 400 }}
                    >
                      {main_text.slice(match.offset, match.offset + match.length)}
                    </span>
                  )
                  lastIndex = match.offset + match.length
                }
                if (lastIndex < main_text.length) {
                  parts.push(
                    <span
                      key="tail"
                      style={{ color: 'var(--warmgrey)', fontWeight: 300 }}
                    >
                      {main_text.slice(lastIndex)}
                    </span>
                  )
                }
                return parts
              }

              return (
                <li
                  key={place_id}
                  id={`${listboxId.current}-option-${index}`}
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={() => handleSelect(description, place_id)}
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
                    {secondary_text && (
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
                        {secondary_text}
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
