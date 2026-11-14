// Phase 90 plan 04 (research assumption A2): @dnd-kit/core 6.3.1 mounts under React 19.
// Minimal board shape: one draggable card, one enabled and one disabled drop target, a DragOverlay.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'

function Card() {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: 'card-1' })
  return (
    <div ref={setNodeRef} data-testid="card" {...attributes} {...listeners}>
      card
    </div>
  )
}

function Column({ id, disabled }: { id: string; disabled?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled })
  return (
    <div ref={setNodeRef} data-testid={`col-${id}`} data-over={String(isOver)}>
      {id}
    </div>
  )
}

function Board() {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )
  return (
    <DndContext sensors={sensors}>
      <Card />
      <Column id="enabled" />
      <Column id="disabled" disabled />
      <DragOverlay>{null}</DragOverlay>
    </DndContext>
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('dnd-kit under React 19 (spike)', () => {
  it('mounts DndContext, useDraggable, enabled and disabled useDroppable and DragOverlay without React errors', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<Board />)
    expect(screen.getByTestId('card')).toBeDefined()
    expect(screen.getByTestId('col-enabled').getAttribute('data-over')).toBe('false')
    expect(screen.getByTestId('col-disabled').getAttribute('data-over')).toBe('false')
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('the draggable carries aria-roledescription "draggable"', () => {
    render(<Board />)
    expect(screen.getByTestId('card').getAttribute('aria-roledescription')).toBe('draggable')
  })
})
