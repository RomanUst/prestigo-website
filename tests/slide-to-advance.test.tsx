import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import SlideToAdvance, { type SlideState } from '@/app/(internal)/driver/trip/[token]/SlideToAdvance'

// Track 320 px wide -> travel = 320 - knob 56 - 2 x inset 4 = 256 px; threshold 0.85 x 256 = 217.6 px.
const TRACK_WIDTH = 320
const TRAVEL = 256
const POINTER_ID = 7

let setPointerCapture: ReturnType<typeof vi.fn>
let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  setPointerCapture = vi.fn()
  ;(HTMLElement.prototype as unknown as { setPointerCapture: unknown }).setPointerCapture = setPointerCapture
  ;(HTMLElement.prototype as unknown as { releasePointerCapture: unknown }).releasePointerCapture = vi.fn()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        width: TRACK_WIDTH,
        height: 64,
        top: 0,
        left: 0,
        right: TRACK_WIDTH,
        bottom: 64,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  )
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function setup(state: SlideState = 'ready', extra: { secondaryLine?: string } = {}) {
  const onActivate = vi.fn()
  const utils = render(<SlideToAdvance label="On my way" state={state} onActivate={onActivate} {...extra} />)
  return { onActivate, ...utils }
}

function knob() {
  return screen.getByRole('button')
}

function translateX(el: HTMLElement): number {
  const m = /translateX\((-?[\d.]+)px\)/.exec(el.style.transform)
  return m ? Number(m[1]) : 0
}

function down(x = 0) {
  fireEvent.pointerDown(knob(), { clientX: x, pointerId: POINTER_ID, button: 0, pointerType: 'touch' })
}
function move(x: number) {
  fireEvent.pointerMove(knob(), { clientX: x, pointerId: POINTER_ID, pointerType: 'touch' })
}
function up(x = 0) {
  fireEvent.pointerUp(knob(), { clientX: x, pointerId: POINTER_ID, pointerType: 'touch' })
}

describe('SlideToAdvance: drag gesture (D-12)', () => {
  it('releasing at 86% of travel calls onActivate once and holds the knob at the end', () => {
    const { onActivate } = setup()
    down(10)
    move(10 + 220)
    expect(translateX(knob())).toBe(220)
    up(10 + 220)
    expect(onActivate).toHaveBeenCalledTimes(1)
    expect(translateX(knob())).toBe(TRAVEL)
  })

  it('releasing at 59% of travel snaps back to 0 and calls nothing', () => {
    const { onActivate } = setup()
    down(0)
    move(150)
    expect(translateX(knob())).toBe(150)
    up(150)
    expect(onActivate).not.toHaveBeenCalled()
    expect(translateX(knob())).toBe(0)
  })

  it('clamps the offset to 0..travel', () => {
    setup()
    down(100)
    move(-50)
    expect(translateX(knob())).toBe(0)
    move(1000)
    expect(translateX(knob())).toBe(TRAVEL)
  })

  it('pointercancel mid-drag snaps back and calls nothing', () => {
    const { onActivate } = setup()
    down(0)
    move(240)
    fireEvent.pointerCancel(knob(), { pointerId: POINTER_ID })
    expect(onActivate).not.toHaveBeenCalled()
    expect(translateX(knob())).toBe(0)
    // a late pointerup after the cancel must not activate either
    up(240)
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('captures the pointer with the event pointerId; knob and track have the touch-action / user-select contract', () => {
    setup()
    down(0)
    expect(setPointerCapture).toHaveBeenCalledWith(POINTER_ID)
    expect(knob().style.touchAction).toBe('none')
    expect(knob().style.userSelect).toBe('none')
    const track = knob().parentElement as HTMLElement
    expect(track.style.touchAction).toBe('pan-y')
  })

  it('label opacity follows progress: 1 at 0%, about 0.7 at 50%, 0.4 at 100%', () => {
    setup()
    const label = screen.getByText('On my way')
    expect(Number(label.style.opacity || 1)).toBe(1)
    down(0)
    move(TRAVEL / 2)
    expect(Number(label.style.opacity)).toBeCloseTo(0.7, 5)
    move(TRAVEL)
    expect(Number(label.style.opacity)).toBeCloseTo(0.4, 5)
  })

  it('returns the knob to the start when the parent goes from awaiting-confirm back to ready', () => {
    const onActivate = vi.fn()
    const { rerender } = render(<SlideToAdvance label="On my way" state="ready" onActivate={onActivate} />)
    down(0)
    move(240)
    up(240)
    expect(translateX(knob())).toBe(TRAVEL)
    rerender(<SlideToAdvance label="On my way" state="awaiting-confirm" onActivate={onActivate} />)
    expect(translateX(knob())).toBe(TRAVEL)
    rerender(<SlideToAdvance label="On my way" state="ready" onActivate={onActivate} />)
    expect(translateX(knob())).toBe(0)
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('Enter and Space still call onActivate once each in ready (87-10 path)', () => {
    const { onActivate } = setup()
    fireEvent.keyDown(knob(), { key: 'Enter' })
    expect(onActivate).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(knob(), { key: ' ' })
    expect(onActivate).toHaveBeenCalledTimes(2)
  })

  it.each(['locked-early', 'locked-waiting'] as const)('%s: a full drag neither moves the knob nor calls onActivate', (state) => {
    const { onActivate } = setup(state, { secondaryLine: 'Unlocks at 12:30' })
    down(0)
    move(TRAVEL)
    expect(translateX(knob())).toBe(0)
    up(TRAVEL)
    expect(onActivate).not.toHaveBeenCalled()
    expect(translateX(knob())).toBe(0)
  })

  it('never calls fetch, in any gesture', () => {
    setup()
    down(0)
    move(240)
    up(240)
    fireEvent.keyDown(knob(), { key: 'Enter' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('source never sends a request and adds no dependency', () => {
    const src = readFileSync(path.join(process.cwd(), 'app/(internal)/driver/trip/[token]/SlideToAdvance.tsx'), 'utf8')
    expect(src).not.toMatch(/fetch\(/)
    expect(src).toContain('setPointerCapture')
  })
})
