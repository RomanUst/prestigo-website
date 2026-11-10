'use client'
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { BookingSidePanel } from './BookingSidePanel'
import { BookingDetailPanel } from './BookingDetailPanel'
import { useBookingMoves, type BookingMovesApi } from './useBookingMoves'
import type { AdminBooking } from './bookingTypes'

// Phase 90 plan 05 (RESEARCH Pattern 1, step B): one host above the list, the board and the calendar.
// It holds the single selected booking, ONE useBookingMoves instance (so each money dialog is mounted
// exactly once on the page) and the right-hand side panel. Views never talk to each other: a row change
// made in the panel or by a move is published as a BookingEvent and every mounted view merges it.

export type BookingEvent =
  | { type: 'patched'; id: string; patch: Partial<AdminBooking> }
  | { type: 'stale'; id: string }

type BookingEventListener = (e: BookingEvent) => void

export interface BookingPanelValue {
  /** The booking shown in the side panel (a snapshot), or null when the panel is closed. */
  selected: AdminBooking | null
  /** Open the panel on a booking; opening another one switches it. `opener` gets focus back on close. */
  openBooking(b: AdminBooking, opener?: HTMLElement | null): void
  closePanel(): void
  /** A view hands over its freshly loaded rows so the open panel does not go stale. */
  syncRows(rows: AdminBooking[]): void
  subscribe(listener: BookingEventListener): () => void
  moves: BookingMovesApi
  /**
   * The list registers how the "Paired outbound" chip filters it by a reference; views without such a
   * filter (board, calendar) register nothing and the panel prints the reference as plain text.
   */
  setReferenceSearchHandler(handler: ((reference: string) => void) | null): void
  /** True while a move dialog is open or the panel holds unsaved input: views must not refetch then. */
  pausePolling: boolean
}

const BookingPanelContext = createContext<BookingPanelValue | null>(null)

export function BookingPanelProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<AdminBooking | null>(null)
  // Read from callbacks that must see the latest snapshot without being re-created.
  const selectedRef = useRef<AdminBooking | null>(null)
  const listenersRef = useRef<Set<BookingEventListener>>(new Set())
  // The row or card that opened the panel; it gets focus back when the panel closes.
  const openerRef = useRef<HTMLElement | null>(null)
  // Bumped when a fresher row shows a status or payment change: an open PaymentPanel refetches (Pitfall 4).
  const [refreshSignal, setRefreshSignal] = useState(0)
  // True while the panel holds unsaved input (notes, driver price, an open trip-edit form).
  const [panelDirty, setPanelDirty] = useState(false)
  const [referenceSearchHandler, setReferenceSearchHandlerState] = useState<((reference: string) => void) | null>(null)
  const setReferenceSearchHandler = useCallback((handler: ((reference: string) => void) | null) => {
    // a function stored in state must be wrapped, or React would call it as an updater
    setReferenceSearchHandlerState(() => handler)
  }, [])

  const commitSelected = useCallback((next: AdminBooking | null) => {
    selectedRef.current = next
    setSelected(next)
  }, [])

  const subscribe = useCallback((listener: BookingEventListener) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  const publish = useCallback((e: BookingEvent) => {
    listenersRef.current.forEach(listener => listener(e))
  }, [])

  // The single row-patch sink: the move hook and the panel both report row changes here.
  const handlePatched = useCallback((id: string, patch: Partial<AdminBooking>) => {
    const cur = selectedRef.current
    if (cur && cur.id === id) commitSelected({ ...cur, ...patch })
    publish({ type: 'patched', id, patch })
  }, [commitSelected, publish])

  const handleStale = useCallback((id: string) => {
    publish({ type: 'stale', id })
  }, [publish])

  const moves = useBookingMoves({ onPatched: handlePatched, onStale: handleStale })

  const openBooking = useCallback((b: AdminBooking, opener?: HTMLElement | null) => {
    const active = document.activeElement
    openerRef.current = opener ?? (active instanceof HTMLElement && active !== document.body ? active : null)
    // Same booking again keeps the panel as it is: no close-reopen flicker, no lost input.
    if (selectedRef.current?.id === b.id) return
    commitSelected(b)
  }, [commitSelected])

  const closePanel = useCallback(() => {
    commitSelected(null)
    setPanelDirty(false)
    const opener = openerRef.current
    openerRef.current = null
    if (opener && opener.isConnected) opener.focus()
  }, [commitSelected])

  const syncRows = useCallback((rows: AdminBooking[]) => {
    const cur = selectedRef.current
    if (!cur) return
    const fresh = rows.find(r => r.id === cur.id)
    // Not in this view's rows (other page, other filter): the panel stays on its snapshot.
    if (!fresh) return
    if (fresh.status !== cur.status || fresh.payment_state !== cur.payment_state) {
      setRefreshSignal(n => n + 1)
    }
    // The panel keeps its local input (keyed by booking id only); only the shown row data is replaced.
    commitSelected(fresh)
  }, [commitSelected])

  const pausePolling = moves.anyDialogOpen || panelDirty

  const value: BookingPanelValue = {
    selected,
    openBooking,
    closePanel,
    syncRows,
    subscribe,
    moves,
    setReferenceSearchHandler,
    pausePolling,
  }

  return (
    <BookingPanelContext.Provider value={value}>
      {children}
      {/* Confirm no-show and cancel dialogs (Phase 87 / 89): mounted once for the whole page */}
      {moves.dialogs}
      {selected && (
        <BookingSidePanel reference={selected.booking_reference} onClose={closePanel}>
          <BookingDetailPanel
            key={selected.id}
            booking={selected}
            moves={moves}
            onPatched={handlePatched}
            onSearchReference={referenceSearchHandler ?? undefined}
            refreshSignal={refreshSignal}
            onDirtyChange={setPanelDirty}
          />
        </BookingSidePanel>
      )}
    </BookingPanelContext.Provider>
  )
}

export function useBookingPanel(): BookingPanelValue {
  const ctx = useContext(BookingPanelContext)
  if (!ctx) throw new Error('useBookingPanel must be used inside BookingPanelProvider')
  return ctx
}

/** Subscribe to row events for the life of the component; the latest listener is always the one called. */
export function useBookingEvents(listener: BookingEventListener): void {
  const { subscribe } = useBookingPanel()
  const listenerRef = useRef(listener)
  useEffect(() => {
    listenerRef.current = listener
  })
  useEffect(() => subscribe(e => listenerRef.current(e)), [subscribe])
}
