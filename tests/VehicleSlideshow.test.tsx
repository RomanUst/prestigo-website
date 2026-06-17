import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import VehicleSlideshow from '@/components/booking/VehicleSlideshow'

// Mock next/image to avoid jsdom issues
vi.mock('next/image', () => ({
  default: ({ src, alt, fill: _fill, ...rest }: { src: string; alt: string; fill?: boolean; [key: string]: unknown }) =>
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...rest} />,
}))

describe('VehicleSlideshow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('BOOK-05 / D-15: Auto-advance slideshow', () => {
    it('renders the first slide image on mount', () => {
      render(<VehicleSlideshow />)
      // The first slide should be visible — component must render at least one image
      const images = screen.getAllByRole('img')
      expect(images.length).toBeGreaterThanOrEqual(1)
    })

    it('auto-advances to the next slide after 4000 ms', async () => {
      render(<VehicleSlideshow />)

      // Capture what is "active" before advancing (e.g. aria-current or data-active)
      // The component must expose the current slide index via aria-current="true"
      // on the active slide's container or via a visible indicator
      const initialActiveSlides = document.querySelectorAll('[aria-current="true"], [data-active="true"]')
      const initialIndex = initialActiveSlides.length > 0
        ? parseInt((initialActiveSlides[0] as HTMLElement).dataset.index ?? '0', 10)
        : 0

      act(() => {
        vi.advanceTimersByTime(4000)
      })

      // After 4 s, active index must have changed
      const afterActiveSlides = document.querySelectorAll('[aria-current="true"], [data-active="true"]')
      const afterIndex = afterActiveSlides.length > 0
        ? parseInt((afterActiveSlides[0] as HTMLElement).dataset.index ?? '0', 10)
        : 0

      // Either the index changed, or some active attribute toggled
      // The important contract: slide content is different after 4000ms
      expect(afterIndex).not.toBe(initialIndex)
    })
  })

  describe('Prev / Next navigation controls', () => {
    it('renders a "Previous slide" button', () => {
      render(<VehicleSlideshow />)
      expect(screen.getByRole('button', { name: /previous slide/i })).toBeInTheDocument()
    })

    it('renders a "Next slide" button', () => {
      render(<VehicleSlideshow />)
      expect(screen.getByRole('button', { name: /next slide/i })).toBeInTheDocument()
    })

    it('clicking "Next slide" advances the active slide', () => {
      render(<VehicleSlideshow />)

      const nextBtn = screen.getByRole('button', { name: /next slide/i })
      fireEvent.click(nextBtn)

      // After clicking Next, the slide index should have advanced
      const activeSlides = document.querySelectorAll('[aria-current="true"], [data-active="true"]')
      const activeIndex = activeSlides.length > 0
        ? parseInt((activeSlides[0] as HTMLElement).dataset.index ?? '0', 10)
        : 0

      expect(activeIndex).toBeGreaterThan(0)
    })

    it('clicking "Previous slide" wraps to last slide from first', () => {
      render(<VehicleSlideshow />)

      const prevBtn = screen.getByRole('button', { name: /previous slide/i })
      fireEvent.click(prevBtn)

      // Clicking prev from index 0 should wrap to last slide (index > 0)
      const activeSlides = document.querySelectorAll('[aria-current="true"], [data-active="true"]')
      const activeIndex = activeSlides.length > 0
        ? parseInt((activeSlides[0] as HTMLElement).dataset.index ?? '0', 10)
        : 0

      expect(activeIndex).toBeGreaterThan(0)
    })
  })
})
