// Row shapes of the quote tables (migration 091, plan 92-01). Snake_case column names, bigint money as number
// (minor units stay far below 2^53), timestamps as ISO strings. Types only; client-safe.

import type { DepositKind, QuoteCurrency, QuoteStatus, RemainderMethod } from '@/lib/quotes/vocabulary'

export interface QuoteRow {
  id: string
  reference: string
  status: QuoteStatus
  current_version_id: string | null
  client_first_name: string
  client_last_name: string
  client_email: string
  client_phone: string | null
  lead_channel: string
  user_id: string | null
  source_inquiry_id: string | null
  expires_at: string | null
  stripe_customer_id: string | null
  stripe_payment_method_id: string | null
  deposit_payment_intent_id: string | null
  accepted_version_id: string | null
  accepted_at: string | null
  paid_at: string | null
  remainder_payment_intent_id: string | null
  remainder_amount_minor: number | null
  remainder_attempt: number
  remainder_paid_at: string | null
  invoice_requested_at: string | null
  invoice_number: string | null
  invoice_paid_at: string | null
  voided_at: string | null
  voided_by: string | null
  cancelled_at: string | null
  cancel_initiator: 'admin_client' | 'admin_prestigo' | null
  cancel_outcome: 'free' | 'late' | null
  deposit_refunded_minor: number
  remainder_refunded_minor: number
  anonymised_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface QuoteVersionRow {
  id: string
  quote_id: string
  version_no: number
  frozen_at: string | null
  locale: string
  currency: QuoteCurrency
  total_minor: number
  deposit_kind: DepositKind | null
  deposit_value: number | null
  deposit_minor: number | null
  remainder_method: RemainderMethod | null
  cancel_free_hours: number | null
  cancel_fee_percent: number | null
  cancel_policy: Record<string, string | number> | null
  cancel_policy_version: string | null
  terms_version: string | null
  billing_name: string | null
  billing_address: string | null
  billing_company_id: string | null
  billing_vat_id: string | null
  billing_note: string | null
  created_by: string | null
  created_at: string
}

export interface QuoteLineRow {
  id: string
  version_id: string
  position: number
  trip_type: 'transfer' | 'hourly' | 'daily'
  pickup_date: string
  pickup_time: string
  landing_date: string | null
  landing_time: string | null
  pickup_offset_min: number | null
  origin_address: string
  origin_lat: number | null
  origin_lng: number | null
  destination_address: string | null
  destination_lat: number | null
  destination_lng: number | null
  vehicle_class: 'business' | 'first_class' | 'business_van'
  passengers: number
  luggage: number
  hours: number | null
  return_date: string | null
  distance_km: number | null
  flight_number: string | null
  terminal: string | null
  special_requests: string | null
  extra_child_seat: boolean
  extra_meet_greet: boolean
  extra_luggage: boolean
  suggested_amount_minor: number | null
  amount_minor: number
  price_overridden: boolean
  deposit_share_minor: number | null
  remainder_minor: number | null
  amount_eur: number | null
  amount_czk: number | null
}

export interface QuoteStopRow {
  id: string
  line_id: string
  position: number
  address: string
  lat: number | null
  lng: number | null
  wait_minutes: number
  free_minutes: number
  blocks: number
  fee_per_block_eur: number
  fee_eur: number
  created_at: string
}

export interface QuoteLinkRow {
  id: string
  quote_id: string
  version_id: string
  token_hash: string
  created_at: string
  created_by: string | null
  revoked_at: string | null
}

export interface QuoteAcceptanceRow {
  id: string
  quote_id: string
  version_id: string
  link_id: string | null
  accepted_at: string
  ip: string | null
  user_agent: string | null
  locale: string
  terms_version: string
  terms_sha256: string
  terms_rendered: string
  deposit_minor: number
  currency: QuoteCurrency
  hold_lead_hours: number | null
  payment_intent_id: string | null
  confirmed_at: string | null
}
