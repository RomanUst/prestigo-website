import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
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

// ---------------------------------------------------------------------------
// Task 2: hold, tap hint, assistive activation, offline, submitting, reduced motion
// ---------------------------------------------------------------------------

function mockReducedMotion(reduce: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('prefers-reduced-motion') ? reduce : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  )
}

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value })
}

afterEach(() => {
  // remove the own-property override so jsdom's prototype getter (true) is back
  delete (window.navigator as unknown as { onLine?: boolean }).onLine
})

describe('SlideToAdvance: press and hold (D-12 fallback)', () => {
  it('holding 600 ms without moving calls onActivate once', () => {
    vi.useFakeTimers()
    const { onActivate } = setup()
    down(0)
    act(() => {
      vi.advanceTimersByTime(599)
    })
    expect(onActivate).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onActivate).toHaveBeenCalledTimes(1)
    // releasing afterwards and the click that follows add nothing
    up(0)
    fireEvent.click(knob())
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('releasing at 400 ms does not activate', () => {
    vi.useFakeTimers()
    const { onActivate } = setup()
    down(0)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    up(0)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('moving more than 8 px before 600 ms cancels the hold and continues as a drag', () => {
    vi.useFakeTimers()
    const { onActivate } = setup()
    down(0)
    move(9)
    act(() => {
      vi.advanceTimersByTime(900)
    })
    expect(onActivate).not.toHaveBeenCalled()
    // still a drag: carry on to the end
    move(240)
    up(240)
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('moving 8 px or less keeps the hold running', () => {
    vi.useFakeTimers()
    const { onActivate } = setup()
    down(0)
    move(8)
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('draws a 4 px accent ring while holding', () => {
    vi.useFakeTimers()
    const { container } = setup()
    const ring = container.querySelector('[data-hold-ring]') as SVGCircleElement
    expect(ring).not.toBeNull()
    expect(ring.getAttribute('stroke-width')).toBe('4')
    expect(ring.getAttribute('stroke')).toBe('var(--admin-accent)')
    const before = ring.style.strokeDashoffset
    down(0)
    expect(ring.style.strokeDashoffset).not.toBe(before)
    expect(ring.style.strokeDashoffset).toBe('0')
    expect(ring.style.transition).toContain('600ms')
    up(0)
    expect(ring.style.strokeDashoffset).toBe(before)
  })
})

describe('SlideToAdvance: tap hint', () => {
  it('a tap without drag calls nothing and shows "Slide to continue" for 2 s', () => {
    vi.useFakeTimers()
    const { onActivate } = setup()
    expect(screen.queryByText('Slide to continue')).toBeNull()
    down(0)
    up(0)
    fireEvent.click(knob())
    expect(onActivate).not.toHaveBeenCalled()
    expect(screen.getByText('Slide to continue')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1999)
    })
    expect(screen.getByText('Slide to continue')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByText('Slide to continue')).toBeNull()
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('a drag that is released short of the threshold does not show the hint', () => {
    setup()
    down(0)
    move(100)
    up(100)
    expect(screen.queryByText('Slide to continue')).toBeNull()
  })

  it('clears its timer on unmount (no state update after unmount)', () => {
    vi.useFakeTimers()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = setup()
    down(0)
    up(0)
    unmount()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

describe('SlideToAdvance: assistive-technology activation', () => {
  it('a click that no pointerdown preceded calls onActivate once', () => {
    const { onActivate } = setup()
    fireEvent.click(knob())
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('a click that follows a pointer tap does not call it', () => {
    const { onActivate } = setup()
    down(0)
    up(0)
    fireEvent.click(knob())
    expect(onActivate).not.toHaveBeenCalled()
    // the pointer click was consumed: a later bare click is assistive technology again
    fireEvent.click(knob())
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('a pointer click flag that was never consumed expires, so a later assistive click works', () => {
    vi.useFakeTimers()
    const { onActivate } = setup()
    down(0)
    up(0) // no click delivered
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    fireEvent.click(knob())
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('keeps the tap-hint wording and the aria-label of the contract', () => {
    setup()
    expect(knob()).toHaveAccessibleName('Next step: On my way. Double tap to confirm.')
  })
})

describe('SlideToAdvance: offline lock', () => {
  it('offline at mount shows WifiOff, the two offline lines and aria-disabled; all input is ignored', () => {
    vi.useFakeTimers()
    setOnLine(false)
    const { onActivate, container } = setup()
    expect(screen.getByText('No connection')).toBeInTheDocument()
    expect(screen.getByText('Steps cannot be saved offline.')).toBeInTheDocument()
    expect(knob()).toHaveAttribute('aria-disabled', 'true')
    expect(container.querySelector('.lucide-wifi-off')).not.toBeNull()
    expect(screen.queryByText('On my way')).toBeNull()

    down(0)
    move(TRAVEL)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    up(TRAVEL)
    expect(translateX(knob())).toBe(0)
    fireEvent.keyDown(knob(), { key: 'Enter' })
    fireEvent.keyDown(knob(), { key: ' ' })
    fireEvent.click(knob())
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('the online event restores the prop state and the ready behaviour; offline locks it again', () => {
    setOnLine(false)
    const { onActivate } = setup()
    expect(knob()).toHaveAttribute('aria-disabled', 'true')

    act(() => {
      setOnLine(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.getByText('On my way')).toBeInTheDocument()
    expect(knob()).not.toHaveAttribute('aria-disabled')
    fireEvent.keyDown(knob(), { key: 'Enter' })
    expect(onActivate).toHaveBeenCalledTimes(1)

    act(() => {
      setOnLine(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByText('No connection')).toBeInTheDocument()
    expect(knob()).toHaveAttribute('aria-disabled', 'true')
    fireEvent.keyDown(knob(), { key: 'Enter' })
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('offline over a locked state shows the offline copy, then returns to the locked copy online', () => {
    setOnLine(false)
    setup('locked-early', { secondaryLine: 'Unlocks at 12:30' })
    expect(screen.getByText('No connection')).toBeInTheDocument()
    expect(screen.queryByText('Unlocks at 12:30')).toBeNull()
    act(() => {
      setOnLine(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.getByText('On my way')).toBeInTheDocument()
    expect(screen.getByText('Unlocks at 12:30')).toBeInTheDocument()
  })
})

describe('SlideToAdvance: submitting', () => {
  it('shows aria-busy and "Saving…" and ignores drag, hold, Enter, Space and click', () => {
    vi.useFakeTimers()
    const { onActivate } = setup('submitting')
    expect(knob()).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    down(0)
    move(TRAVEL)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    up(TRAVEL)
    fireEvent.keyDown(knob(), { key: 'Enter' })
    fireEvent.keyDown(knob(), { key: ' ' })
    fireEvent.click(knob())
    expect(onActivate).not.toHaveBeenCalled()
    expect(translateX(knob())).toBe(TRAVEL)
  })

  it('a hold that started while ready is dropped when the state becomes submitting', () => {
    vi.useFakeTimers()
    const onActivate = vi.fn()
    const { rerender } = render(<SlideToAdvance label="On my way" state="ready" onActivate={onActivate} />)
    down(0)
    rerender(<SlideToAdvance label="On my way" state="submitting" onActivate={onActivate} />)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(onActivate).not.toHaveBeenCalled()
  })
})

describe('SlideToAdvance: reduced motion', () => {
  it('reduce: no snap-back transition, no spinner rotation class, no ring transition', () => {
    mockReducedMotion(true)
    const { container, rerender, onActivate } = setup()
    down(0)
    move(100)
    up(100)
    expect(onActivate).not.toHaveBeenCalled()
    expect(translateX(knob())).toBe(0)
    expect(knob().style.transition).toBe('none')

    down(0)
    const ring = container.querySelector('[data-hold-ring]') as SVGCircleElement
    expect(ring.style.transition === '' || ring.style.transition === 'none').toBe(true)
    // static, fully drawn ring
    expect(ring.style.strokeDashoffset).toBe('0')
    up(0)

    rerender(<SlideToAdvance label="On my way" state="submitting" onActivate={onActivate} />)
    const spinner = container.querySelector('.lucide-loader-circle') as SVGElement
    expect(spinner).not.toBeNull()
    expect(spinner.getAttribute('class')).not.toMatch(/animate-spin|driver-spin/)
  })

  it('no preference: 150 ms ease-out snap-back and a motion-safe spinner', () => {
    mockReducedMotion(false)
    const { container, rerender, onActivate } = setup()
    down(0)
    move(100)
    expect(knob().style.transition).toBe('none') // follows the pointer without lag
    up(100)
    expect(knob().style.transition).toBe('transform 150ms ease-out')

    rerender(<SlideToAdvance label="On my way" state="submitting" onActivate={onActivate} />)
    const spinner = container.querySelector('.lucide-loader-circle') as SVGElement
    expect(spinner.getAttribute('class')).toContain('motion-safe:animate-spin')
  })
})

describe('SlideToAdvance: source contract', () => {
  it('has no colour literal, no fetch and no new dependency', () => {
    const src = readFileSync(path.join(process.cwd(), 'app/(internal)/driver/trip/[token]/SlideToAdvance.tsx'), 'utf8')
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(src).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch)\(/)
    expect(src).not.toMatch(/fetch\(/)
    const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1])
    expect(imports.every((i) => ['react', 'lucide-react'].includes(i))).toBe(true)
  })
})
