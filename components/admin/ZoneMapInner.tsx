'use client'
import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps'
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from 'terra-draw'
import { TerraDrawGoogleMapsAdapter } from 'terra-draw-google-maps-adapter'
import { useEffect, useRef, useState, useCallback } from 'react'
import { StatusBadge } from './StatusBadge'
import { Trash2, MapPin } from 'lucide-react'

interface Zone {
  id: string
  name: string
  geojson: {
    type: 'Feature'
    geometry: { type: 'Polygon'; coordinates: number[][][] }
    properties: Record<string, unknown> | null
  }
  active: boolean
  created_at: string
}

interface DrawLayerProps {
  drawRef: React.MutableRefObject<TerraDraw | null>
  onPolygonComplete: (coordinates: number[][][]) => void
}

function DrawLayer({ drawRef, onPolygonComplete }: DrawLayerProps) {
  const map = useMap()

  useEffect(() => {
    if (!map) return

    // Fix div ID bug — terra-draw requires the map container div to have an id
    const mapDiv = map.getDiv()
    if (!mapDiv.id) mapDiv.id = 'terra-draw-map-container'

    const draw = new TerraDraw({
      adapter: new TerraDrawGoogleMapsAdapter({
        lib: google.maps,
        map,
        coordinatePrecision: 9,
      }),
      modes: [
        new TerraDrawPolygonMode(),
        new TerraDrawSelectMode({ flags: { polygon: { feature: {} } } }),
      ],
    })

    // MANDATORY: Wait for ready event before assigning drawRef
    draw.on('ready', () => {
      drawRef.current = draw
    })

    // Listen for finish event to capture completed polygon
    // FeatureId can be string | number — use loose equality for find
    draw.on('finish', (id) => {
      const snapshot = draw.getSnapshot()
       
      const feature = snapshot.find((f) => f.id == id)
      if (feature && feature.geometry.type === 'Polygon') {
        onPolygonComplete(feature.geometry.coordinates as number[][][])
        draw.clear()
      }
    })

    const startListener = google.maps.event.addListenerOnce(map, 'tilesloaded', () => {
      draw.start()
    })

    return () => {
      google.maps.event.removeListener(startListener)
      if (drawRef.current) {
        draw.stop()
      }
    }
  }, [map, drawRef, onPolygonComplete])

  return null
}

export default function ZoneMapInner() {
  const [zones, setZones] = useState<Zone[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [pendingPolygon, setPendingPolygon] = useState<number[][][] | null>(null)
  const [zoneName, setZoneName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // drawRef declared in outer component — bridges button handlers and DrawLayer terra-draw instance
  const drawRef = useRef<TerraDraw | null>(null)

  const fetchZones = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/zones')
      if (res.ok) {
        const data = await res.json()
        setZones(data.zones ?? [])
      }
    } catch {
      // silently fail — zones list will be empty
    }
  }, [])

  useEffect(() => {
    fetchZones()
  }, [fetchZones])

  const handleStartDrawing = useCallback(() => {
    setIsDrawing(true)
    if (drawRef.current) {
      drawRef.current.setMode('polygon')
    }
  }, [])

  const handleStopDrawing = useCallback(() => {
    setIsDrawing(false)
    if (drawRef.current) {
      drawRef.current.setMode('static')
    }
  }, [])

  const handlePolygonComplete = useCallback((coordinates: number[][][]) => {
    setPendingPolygon(coordinates)
    setIsDrawing(false)
    if (drawRef.current) {
      drawRef.current.setMode('static')
    }
  }, [])

  const handleSaveZone = useCallback(async () => {
    if (!pendingPolygon || !zoneName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: zoneName.trim(),
          geojson: {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: pendingPolygon },
            properties: {},
          },
        }),
      })
      if (res.ok) {
        setPendingPolygon(null)
        setZoneName('')
        setIsDrawing(false)
        await fetchZones()
      }
    } catch {
      // silently fail
    } finally {
      setSaving(false)
    }
  }, [pendingPolygon, zoneName, fetchZones])

  const handleToggleZone = useCallback(async (zone: Zone) => {
    try {
      const res = await fetch('/api/admin/zones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: zone.id, active: !zone.active }),
      })
      if (res.ok) {
        await fetchZones()
      }
    } catch {
      // silently fail
    }
  }, [fetchZones])

  const handleDeleteZone = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/zones?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setDeleteConfirm(null)
        await fetchZones()
      }
    } catch {
      // silently fail
    }
  }, [fetchZones])

  return (
    <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
      {/* Left: Map */}
      <div style={{ flex: 1, minHeight: '480px', position: 'relative' }}>
        <div
          style={{
            flex: 1,
            minHeight: '480px',
            height: '520px',
            border: '1px solid var(--anthracite-light)',
            borderRadius: '4px',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
            <Map
              defaultCenter={{ lat: 50.0755, lng: 14.4378 }}
              defaultZoom={11}
              mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || undefined}
              style={{ width: '100%', height: '100%' }}
              disableDefaultUI
            >
              <DrawLayer drawRef={drawRef} onPolygonComplete={handlePolygonComplete} />
            </Map>
          </APIProvider>

          {/* Draw Toolbar — positioned absolute top-right of map container */}
          <div
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              zIndex: 1,
            }}
          >
            {!isDrawing ? (
              <button
                onClick={handleStartDrawing}
                style={{
                  border: '1px solid var(--anthracite-light)',
                  background: 'var(--anthracite)',
                  color: 'var(--warmgrey)',
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  padding: '8px 16px',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  letterSpacing: '0.08em',
                }}
              >
                DRAW ZONE
              </button>
            ) : (
              <button
                onClick={handleStopDrawing}
                style={{
                  border: '1px solid var(--copper)',
                  background: 'var(--anthracite)',
                  color: 'var(--offwhite)',
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  padding: '8px 16px',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  letterSpacing: '0.08em',
                }}
              >
                STOP DRAWING
              </button>
            )}
          </div>
        </div>

        {/* Save Zone Prompt — shown when pendingPolygon is set */}
        {pendingPolygon && (
          <div
            style={{
              marginTop: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <input
              type="text"
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              placeholder="Zone name"
              style={{
                flex: 1,
                minWidth: '200px',
                background: 'var(--anthracite-mid)',
                border: '1px solid var(--anthracite-light)',
                borderRadius: '2px',
                color: 'var(--offwhite)',
                fontFamily: 'var(--font-montserrat)',
                fontSize: '13px',
                padding: '8px 12px',
                textAlign: 'left',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--copper)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--anthracite-light)'
              }}
            />
            <button
              onClick={handleSaveZone}
              disabled={saving || !zoneName.trim()}
              style={{
                border: '1px solid var(--copper)',
                background: 'transparent',
                color: 'var(--copper)',
                fontFamily: 'var(--font-montserrat)',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '8px 20px',
                borderRadius: '2px',
                cursor: saving || !zoneName.trim() ? 'not-allowed' : 'pointer',
                opacity: saving || !zoneName.trim() ? 0.6 : 1,
              }}
            >
              SAVE ZONE
            </button>
            <button
              onClick={() => {
                setPendingPolygon(null)
                setZoneName('')
              }}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '11px',
                color: 'var(--warmgrey)',
                textDecoration: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-montserrat)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.textDecoration = 'underline'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.textDecoration = 'none'
              }}
            >
              Discard zone
            </button>
          </div>
        )}
      </div>

      {/* Right: Zone List Panel */}
      <div
        style={{
          width: '280px',
          background: 'var(--anthracite-mid)',
          border: '1px solid var(--anthracite-light)',
          borderRadius: '4px',
          padding: '16px',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.4em',
            color: 'var(--copper)',
            marginBottom: '16px',
          }}
        >
          ZONES
        </div>

        {zones.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              paddingTop: '24px',
            }}
          >
            <MapPin size={24} color="var(--warmgrey)" />
            <p
              style={{
                fontSize: '13px',
                color: 'var(--warmgrey)',
                textAlign: 'center',
                margin: 0,
              }}
            >
              No coverage zones defined.
            </p>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--warmgrey)',
                textAlign: 'center',
                margin: 0,
              }}
            >
              All bookings will be accepted.
            </p>
          </div>
        ) : (
          <div>
            {zones.map((zone, index) => (
              <div
                key={zone.id}
                style={{
                  padding: '8px 0',
                  borderBottom:
                    index < zones.length - 1
                      ? '1px solid var(--anthracite-light)'
                      : 'none',
                }}
              >
                {deleteConfirm === zone.id ? (
                  /* Delete confirmation row */
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--warmgrey)',
                        fontFamily: 'var(--font-montserrat)',
                        flex: 1,
                      }}
                    >
                      Delete this zone?
                    </span>
                    <button
                      onClick={() => handleDeleteZone(zone.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: '11px',
                        color: '#f87171',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-montserrat)',
                        padding: 0,
                      }}
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: '11px',
                        color: 'var(--warmgrey)',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-montserrat)',
                        padding: 0,
                      }}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  /* Normal zone row */
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    {/* Left side: name + badge */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span
                        style={{
                          fontSize: '13px',
                          color: 'var(--offwhite)',
                          fontFamily: 'var(--font-montserrat)',
                        }}
                      >
                        {zone.name}
                      </span>
                      <StatusBadge
                        variant={zone.active ? 'active' : 'inactive'}
                        label={zone.active ? 'Active' : 'Inactive'}
                      />
                    </div>

                    {/* Right side: toggle + delete */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* Toggle switch */}
                      <button
                        onClick={() => handleToggleZone(zone)}
                        title={zone.active ? 'Deactivate zone' : 'Activate zone'}
                        style={{
                          width: '36px',
                          height: '20px',
                          borderRadius: '10px',
                          background: zone.active ? 'var(--copper)' : 'var(--anthracite-light)',
                          border: 'none',
                          position: 'relative',
                          cursor: 'pointer',
                          transition: 'background 150ms ease',
                          flexShrink: 0,
                          padding: 0,
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            background: 'var(--offwhite)',
                            top: '2px',
                            left: zone.active ? '18px' : '2px',
                            transition: 'left 150ms ease',
                          }}
                        />
                      </button>

                      {/* Delete icon */}
                      <button
                        onClick={() => setDeleteConfirm(zone.id)}
                        title="Delete zone"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--warmgrey)',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        onMouseEnter={(e) => {
                          const icon = e.currentTarget.querySelector('svg')
                          if (icon) icon.style.color = '#f87171'
                        }}
                        onMouseLeave={(e) => {
                          const icon = e.currentTarget.querySelector('svg')
                          if (icon) icon.style.color = 'var(--warmgrey)'
                        }}
                      >
                        <Trash2 size={16} color="var(--warmgrey)" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
