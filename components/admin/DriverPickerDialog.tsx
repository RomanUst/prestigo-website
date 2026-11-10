'use client'
import { Modal } from './Modal'
import { DriverAssignmentSection } from './DriverAssignmentSection'

// Phase 90 plan 06 (D-11): a move to "assigned" from the board, the panel select or a mobile card opens this
// dialog. It wraps the same DriverAssignmentSection the detail panel shows, so the assignment goes through the
// existing assign route (writes driver_id, sends the driver the usual offer). Nothing here writes a status:
// closing without choosing changes nothing.

interface DriverPickerDialogProps {
  booking: { id: string; booking_reference: string; status: string } | null
  onClose: () => void
  onAssigned: (id: string) => void
}

export function DriverPickerDialog({ booking, onClose, onAssigned }: DriverPickerDialogProps) {
  if (!booking) return null
  const target = booking
  return (
    <Modal isOpen onClose={onClose} title={`Assign a driver to ${target.booking_reference}`}>
      <DriverAssignmentSection
        bookingId={target.id}
        bookingStatus={target.status}
        onAssigned={() => onAssigned(target.id)}
      />
    </Modal>
  )
}
