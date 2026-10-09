import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ManualBookingForm from '@/components/admin/ManualBookingForm'

// AddressInput loads Google Places — irrelevant to the payment section.
vi.mock('@/components/booking/AddressInput', () => ({ default: () => null }))

function renderForm() {
  return render(<ManualBookingForm open onClose={() => {}} onCreated={() => {}} />)
}

const LABEL = 'Send confirmation email to client'

describe('ManualBookingForm — send confirmation checkbox', () => {
  it('is shown and ticked by default for a confirmed no-link booking', () => {
    renderForm()
    const box = screen.getByLabelText(LABEL) as HTMLInputElement
    expect(box.checked).toBe(true)
    fireEvent.click(box)
    expect(box.checked).toBe(false)
  })

  it('is hidden when the status is Pending', () => {
    renderForm()
    fireEvent.click(screen.getByLabelText('Pending'))
    expect(screen.queryByLabelText(LABEL)).toBeNull()
  })

  it('is hidden when collecting payment via link', () => {
    renderForm()
    fireEvent.click(screen.getByLabelText('Collect payment via link'))
    expect(screen.queryByLabelText(LABEL)).toBeNull()
  })
})
