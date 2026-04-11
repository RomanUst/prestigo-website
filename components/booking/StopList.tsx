'use client'

import { Plus } from 'lucide-react'
import StopItem from '@/components/booking/StopItem'
import type { Stop, PlaceResult } from '@/types/booking'

export interface StopListProps {
  stops: Stop[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, place: PlaceResult | null) => void
  maxStops?: number
}

export default function StopList({
  stops,
  onAdd,
  onRemove,
  onUpdate,
  maxStops = 5,
}: StopListProps) {
  const canAdd = stops.length < maxStops

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {stops.map((stop, index) => (
        <StopItem
          key={stop.id}
          stop={stop}
          index={index}
          onRemove={onRemove}
          onUpdate={onUpdate}
        />
      ))}

      {canAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label="Add stop"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 16px',
            minHeight: '44px',
            background: 'transparent',
            border: '1px dashed var(--anthracite-light)',
            color: 'var(--copper-light)',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '12px',
            fontWeight: 400,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          <Plus size={14} />
          Add stop
        </button>
      )}
    </div>
  )
}
