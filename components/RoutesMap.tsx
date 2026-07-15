'use client'

import { useEffect, useRef } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'

export type MapCity = { name: string; lat: number; lng: number; time?: string }

type Props = { hub: MapCity; cities: MapCity[] }

// Singleton loader — same key/libraries as the booking RouteMap (no new credential).
let mapsLoaderPromise: Promise<void> | null = null
function ensureMapsLibraryLoaded(): Promise<void> {
  if (typeof window !== 'undefined' && window.google?.maps?.Map) return Promise.resolve()
  if (mapsLoaderPromise) return mapsLoaderPromise
  setOptions({
    key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
    libraries: ['maps', 'places', 'routes'],
    v: 'weekly',
  })
  mapsLoaderPromise = importLibrary('maps').then(() => undefined)
  return mapsLoaderPromise
}

// Dark navy outline styling: navy land, darker water, subtle country borders,
// no labels / roads / POI.
// Land is painted the exact section background (#17293B / --anthracite-mid) so the
// map dissolves seamlessly into the section — no visible edges. Water sits a touch
// darker for subtle definition; country borders in muted steel-navy.
const OUTLINE_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#17293B' }] },
  { elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ visibility: 'on' }, { color: '#45617F' }, { weight: 1.1 }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#17293B' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#101F30' }] },
]

const DOT_DURATION = 3600
const DOT_STAGGER = 260

export default function RoutesMap({ hub, cities }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    let rafId = 0

    ensureMapsLibraryLoaded()
      .then(() => {
        if (cancelled || !ref.current) return

        const map = new google.maps.Map(ref.current, {
          disableDefaultUI: true,
          gestureHandling: 'none',
          keyboardShortcuts: false,
          clickableIcons: false,
          disableDoubleClickZoom: true,
          backgroundColor: '#17293B',
          styles: OUTLINE_STYLES,
          center: { lat: hub.lat, lng: hub.lng },
          zoom: 6,
        })

        const bounds = new google.maps.LatLngBounds()
        ;[hub, ...cities].forEach((c) => bounds.extend({ lat: c.lat, lng: c.lng }))
        map.fitBounds(bounds, 64)

        // Custom label overlay (name + optional time), rendered below each dot.
        const makeLabel = (pos: google.maps.LatLngLiteral, name: string, time: string | undefined, isHub: boolean) => {
          class Label extends google.maps.OverlayView {
            private div: HTMLDivElement | null = null
            onAdd() {
              const div = document.createElement('div')
              div.style.cssText = 'position:absolute;pointer-events:none;transform:translate(-50%,0);white-space:nowrap;'
              div.innerHTML = `
                <div style="font-family:var(--font-montserrat),sans-serif;text-align:center">
                  <div style="font-size:${isHub ? 13 : 11}px;font-weight:${isHub ? 600 : 500};letter-spacing:0.14em;text-transform:uppercase;color:#F3EEE3;text-shadow:0 1px 4px rgba(11,22,34,0.95)">${name}</div>
                  ${time ? `<div style="font-size:10px;letter-spacing:0.06em;color:#C9B98C;text-shadow:0 1px 4px rgba(11,22,34,0.95)">${time}</div>` : ''}
                </div>`
              this.div = div
              this.getPanes()?.floatPane.appendChild(div)
            }
            draw() {
              const p = this.getProjection()?.fromLatLngToDivPixel(new google.maps.LatLng(pos.lat, pos.lng))
              if (this.div && p) {
                this.div.style.left = `${p.x}px`
                this.div.style.top = `${p.y + (isHub ? 12 : 9)}px`
              }
            }
            onRemove() {
              this.div?.parentNode?.removeChild(this.div)
              this.div = null
            }
          }
          new Label().setMap(map)
        }

        const from: google.maps.LatLngLiteral = { lat: hub.lat, lng: hub.lng }
        const dots: google.maps.Marker[] = []

        cities.forEach((c) => {
          const to: google.maps.LatLngLiteral = { lat: c.lat, lng: c.lng }

          new google.maps.Polyline({
            path: [from, to],
            geodesic: true,
            strokeColor: '#BFA06A',
            strokeOpacity: 0.4,
            strokeWeight: 1,
            map,
          })

          new google.maps.Marker({
            position: to,
            map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 3.5,
              fillColor: '#BFA06A',
              fillOpacity: 1,
              strokeColor: '#17293B',
              strokeWeight: 1.5,
            },
          })

          makeLabel(to, c.name, c.time, false)

          dots.push(
            new google.maps.Marker({
              position: from,
              map,
              zIndex: 20,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 2.6,
                fillColor: '#E6D6B0',
                fillOpacity: 1,
                strokeColor: '#E6D6B0',
                strokeWeight: 0,
              },
            }),
          )
        })

        // Prague hub — larger dot + ring
        new google.maps.Marker({
          position: from,
          map,
          zIndex: 30,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 6,
            fillColor: '#BFA06A',
            fillOpacity: 1,
            strokeColor: '#E6D6B0',
            strokeWeight: 1.5,
          },
        })
        makeLabel(from, hub.name, undefined, true)

        // Single RAF loop drives every dot (cheaper than one loop per route).
        const reduced =
          typeof window !== 'undefined' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches

        if (reduced) {
          cities.forEach((c, i) =>
            dots[i].setPosition({ lat: (from.lat + c.lat) / 2, lng: (from.lng + c.lng) / 2 }),
          )
          return
        }

        let start: number | null = null
        const frame = (now: number) => {
          if (start === null) start = now
          const base = now - start
          for (let i = 0; i < cities.length; i++) {
            const elapsed = base - i * DOT_STAGGER
            if (elapsed < 0) continue
            const t = (elapsed % DOT_DURATION) / DOT_DURATION
            const c = cities[i]
            dots[i].setPosition({
              lat: from.lat + (c.lat - from.lat) * t,
              lng: from.lng + (c.lng - from.lng) * t,
            })
          }
          rafId = requestAnimationFrame(frame)
        }
        rafId = requestAnimationFrame(frame)
      })
      .catch(() => {
        /* Map key unavailable — container stays navy. */
      })

    return () => {
      cancelled = true
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [hub, cities])

  return (
    <div
      ref={ref}
      className="w-full h-[420px] sm:h-[500px] lg:h-[560px] outline-none [&_*]:outline-none"
      style={{ background: '#17293B' }}
      role="img"
      aria-label="Map of Prestigo chauffeur routes radiating from Prague across Central Europe"
    />
  )
}
