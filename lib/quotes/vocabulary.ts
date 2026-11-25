// Quote vocabulary (Phase 92, plan 92-02; QUOTE-01..06). One list per concept, shared by the migration tests, the
// builder, the public page and the API validators. Client-safe: no imports.

export const QUOTE_STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'paid', 'expired', 'voided'] as const
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

/** How the part of the price that is not the deposit is collected (D-15). */
export const REMAINDER_METHODS = ['saved_card', 'payment_link', 'cash', 'invoice'] as const
export type RemainderMethod = (typeof REMAINDER_METHODS)[number]

/** 'none' (migration 098): no deposit; the client saves a card or only confirms, by the remainder method. */
export const DEPOSIT_KINDS = ['percent', 'fixed', 'none'] as const
export type DepositKind = (typeof DEPOSIT_KINDS)[number]

export const QUOTE_CURRENCIES = ['eur', 'czk'] as const
export type QuoteCurrency = (typeof QUOTE_CURRENCIES)[number]

/** Most trips one quote may carry. Matches quote_version_lines.position BETWEEN 1 AND 20. */
export const QUOTE_MAX_LINES = 20

/** Human reference: Q-<Prague date YYYYMMDD>-<6 chars A-Z0-9>. Matches quotes.reference CHECK. */
export const QUOTE_REFERENCE_RE = /^Q-[0-9]{8}-[A-Z0-9]{6}$/

/** The trip types of a quote line. Matches quote_version_lines_trip_type_check (migration 096 adds 'tour'). */
export const QUOTE_TRIP_TYPES = ['transfer', 'hourly', 'daily', 'tour'] as const
export type QuoteLineTripType = (typeof QUOTE_TRIP_TYPES)[number]

/** A tour line's client-visible headline: 1..200 characters (quote_version_lines.title CHECK, bookings.tour_title). */
export const QUOTE_LINE_TITLE_MAX = 200

/** A line's client-visible description (itinerary, what is included): up to 4000 characters, multi-line plain text. */
export const QUOTE_LINE_DESCRIPTION_MAX = 4000
