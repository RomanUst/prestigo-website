// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { latestCheckValues, loadMigration } from './helpers/latest-migration'
import { locales } from '@/i18n/locales'

// Text-level contract of migration 091 (Phase 92 plan 92-01: quotes). Comments are stripped by loadMigration, so a
// rule mentioned only in a comment does not count. Nothing here touches a database: the orchestrator applies 091 live
// in plan 92-12.

const m091 = loadMigration('091_quotes.sql')
const flat = m091.replace(/\s+/g, ' ')

/** The statement (up to its closing semicolon) that starts at the first occurrence of `needle`. */
function statementFrom(needle: string): string {
  const start = flat.indexOf(needle)
  expect(start, `"${needle}" is in 091`).toBeGreaterThanOrEqual(0)
  const end = flat.indexOf(';', start)
  return flat.slice(start, end + 1)
}

const table = (name: string) => statementFrom(`CREATE TABLE IF NOT EXISTS public.${name} (`)

const DENY_ALL_TABLES = [
  'quotes',
  'quote_versions',
  'quote_version_lines',
  'quote_version_line_stops',
  'quote_links',
] as const

describe('091 numbering', () => {
  it('is the quote schema file; 090 belongs to the consent-locale hotfix and 091 never redefines its CHECK', () => {
    expect(flat).not.toContain('booking_payment_consents_locale_check')
  })
})

describe('091 quotes (QUOTE-01)', () => {
  const quotes = table('quotes')

  it('has the reference format, the D-10 status list and the client fields', () => {
    expect(quotes).toContain("reference text NOT NULL UNIQUE CHECK (reference ~ '^Q-[0-9]{8}-[A-Z0-9]{6}$')")
    expect(quotes).toContain(
      "status text NOT NULL DEFAULT 'draft' CONSTRAINT quotes_status_check CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'paid', 'expired', 'voided'))",
    )
    expect(quotes).toContain('client_first_name text NOT NULL CHECK (char_length(client_first_name) BETWEEN 1 AND 100)')
    expect(quotes).toContain('client_last_name text NOT NULL CHECK (char_length(client_last_name) BETWEEN 1 AND 100)')
    expect(quotes).toContain('client_email text NOT NULL CHECK (char_length(client_email) BETWEEN 3 AND 200)')
    expect(quotes).toContain('client_phone text CHECK (client_phone IS NULL OR char_length(client_phone) <= 50)')
    expect(quotes).toContain(
      "lead_channel text NOT NULL CHECK (lead_channel IN ('whatsapp', 'phone', 'email', 'partner', 'other'))",
    )
  })

  it('carries the payment, remainder, invoice and cancellation columns', () => {
    for (const col of [
      'current_version_id uuid',
      'user_id uuid',
      'source_inquiry_id uuid',
      'expires_at timestamptz',
      'stripe_customer_id text',
      'stripe_payment_method_id text',
      'deposit_payment_intent_id text',
      'accepted_version_id uuid',
      'accepted_at timestamptz',
      'paid_at timestamptz',
      'remainder_payment_intent_id text',
      'remainder_paid_at timestamptz',
      'invoice_requested_at timestamptz',
      'invoice_paid_at timestamptz',
      'voided_at timestamptz',
      'voided_by uuid',
      'cancelled_at timestamptz',
      'anonymised_at timestamptz',
      'created_by uuid',
    ]) {
      expect(quotes, col).toContain(col)
    }
    expect(quotes).toContain('remainder_amount_minor bigint CHECK (remainder_amount_minor IS NULL OR remainder_amount_minor > 0)')
    expect(quotes).toContain('remainder_attempt integer NOT NULL DEFAULT 0 CHECK (remainder_attempt >= 0)')
    expect(quotes).toContain('invoice_number text CHECK (invoice_number IS NULL OR char_length(invoice_number) <= 60)')
    expect(quotes).toContain(
      "cancel_initiator text CHECK (cancel_initiator IS NULL OR cancel_initiator IN ('admin_client', 'admin_prestigo'))",
    )
    expect(quotes).toContain("cancel_outcome text CHECK (cancel_outcome IS NULL OR cancel_outcome IN ('free', 'late'))")
    expect(quotes).toContain('deposit_refunded_minor bigint NOT NULL DEFAULT 0 CHECK (deposit_refunded_minor >= 0)')
    expect(quotes).toContain('remainder_refunded_minor bigint NOT NULL DEFAULT 0 CHECK (remainder_refunded_minor >= 0)')
    expect(quotes).toContain('created_at timestamptz NOT NULL DEFAULT now()')
    expect(quotes).toContain('updated_at timestamptz NOT NULL DEFAULT now()')
  })

  it('has partial unique indexes on both payment intents and an index on the lower-cased email', () => {
    expect(flat).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS quotes_deposit_pi_key ON public\.quotes \(deposit_payment_intent_id\) WHERE deposit_payment_intent_id IS NOT NULL;/,
    )
    expect(flat).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS quotes_remainder_pi_key ON public\.quotes \(remainder_payment_intent_id\) WHERE remainder_payment_intent_id IS NOT NULL;/,
    )
    expect(flat).toMatch(/CREATE INDEX IF NOT EXISTS quotes_client_email_idx ON public\.quotes \(lower\(client_email\)\);/)
  })

  it('points current_version_id and accepted_version_id at quote_versions through deferrable foreign keys', () => {
    for (const [name, col] of [
      ['quotes_current_version_fk', 'current_version_id'],
      ['quotes_accepted_version_fk', 'accepted_version_id'],
    ]) {
      expect(flat).toContain(`DROP CONSTRAINT IF EXISTS ${name}`)
      expect(flat).toContain(
        `ADD CONSTRAINT ${name} FOREIGN KEY (${col}) REFERENCES public.quote_versions(id) DEFERRABLE INITIALLY DEFERRED`,
      )
    }
  })
})

describe('091 quote_versions (QUOTE-06, D-07, D-09)', () => {
  const versions = table('quote_versions')

  it('is keyed (quote_id, version_no) and cascades from the quote', () => {
    expect(versions).toContain('quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE')
    expect(versions).toContain('version_no integer NOT NULL CHECK (version_no >= 1)')
    expect(versions).toContain('UNIQUE (quote_id, version_no)')
    expect(versions).toContain('frozen_at timestamptz')
  })

  it('checks the locale against the named constraint, and the list equals `locales` of i18n/locales.ts (D-09)', () => {
    expect(versions).toContain('CONSTRAINT quote_versions_locale_check CHECK (locale IN (')
    const values = latestCheckValues('quote_versions_locale_check', 'locale')
    expect(values).toEqual([...locales])
    expect(values).toContain('zh-hant')
  })

  it('restricts currency, deposit kind and value, and the remainder method', () => {
    expect(versions).toContain("currency text NOT NULL CHECK (currency IN ('eur', 'czk'))")
    expect(versions).toContain('total_minor bigint NOT NULL DEFAULT 0 CHECK (total_minor >= 0)')
    expect(versions).toContain("deposit_kind text CHECK (deposit_kind IS NULL OR deposit_kind IN ('percent', 'fixed'))")
    expect(versions).toContain('deposit_value bigint CHECK (deposit_value IS NULL OR deposit_value > 0)')
    expect(versions).toContain("CHECK (deposit_kind IS DISTINCT FROM 'percent' OR deposit_value BETWEEN 1 AND 100)")
    expect(versions).toContain('deposit_minor bigint CHECK (deposit_minor IS NULL OR deposit_minor > 0)')
    expect(versions).toContain(
      "CONSTRAINT quote_versions_remainder_method_check CHECK (remainder_method IN ('saved_card', 'payment_link', 'cash', 'invoice'))",
    )
    expect(latestCheckValues('quote_versions_remainder_method_check', 'remainder_method')).toEqual([
      'saved_card',
      'payment_link',
      'cash',
      'invoice',
    ])
  })

  it('allows free cancellation up to 720 hours (D-13) and a fee of 1..100 percent', () => {
    expect(versions).toContain(
      'cancel_free_hours integer CHECK (cancel_free_hours IS NULL OR cancel_free_hours BETWEEN 0 AND 720)',
    )
    expect(versions).toContain(
      'cancel_fee_percent integer CHECK (cancel_fee_percent IS NULL OR cancel_fee_percent BETWEEN 1 AND 100)',
    )
    expect(versions).toContain('cancel_policy jsonb')
    expect(versions).toContain('cancel_policy_version text')
    expect(versions).toContain('terms_version text')
  })

  it('has the billing fields with their length caps', () => {
    expect(versions).toContain('billing_name text CHECK (billing_name IS NULL OR char_length(billing_name) <= 200)')
    expect(versions).toContain('billing_address text CHECK (billing_address IS NULL OR char_length(billing_address) <= 500)')
    expect(versions).toContain('billing_company_id text CHECK (billing_company_id IS NULL OR char_length(billing_company_id) <= 40)')
    expect(versions).toContain('billing_vat_id text CHECK (billing_vat_id IS NULL OR char_length(billing_vat_id) <= 40)')
    expect(versions).toContain('billing_note text CHECK (billing_note IS NULL OR char_length(billing_note) <= 300)')
  })

  it('D-07: deposit_kind, deposit_value and remainder_method have no DEFAULT', () => {
    expect(versions).not.toMatch(/deposit_kind text[^,]*DEFAULT/)
    expect(versions).not.toMatch(/deposit_value bigint[^,]*DEFAULT/)
    expect(versions).not.toMatch(/remainder_method text[^,]*DEFAULT/)
    expect(versions).not.toMatch(/deposit_minor bigint[^,]*DEFAULT/)
  })

  it('a frozen version is complete: deposit, remainder method, 0 < deposit <= total, cancel policy, terms', () => {
    expect(versions).toContain(
      'CONSTRAINT quote_versions_frozen_complete CHECK ( frozen_at IS NULL OR ( deposit_kind IS NOT NULL AND deposit_value IS NOT NULL AND deposit_minor IS NOT NULL AND remainder_method IS NOT NULL AND total_minor > 0 AND deposit_minor <= total_minor AND cancel_policy IS NOT NULL AND terms_version IS NOT NULL ) )',
    )
  })
})

describe('091 quote_version_lines (QUOTE-01)', () => {
  const lines = table('quote_version_lines')

  it('is keyed (version_id, position), position 1..20, cascading from the version', () => {
    expect(lines).toContain('version_id uuid NOT NULL REFERENCES public.quote_versions(id) ON DELETE CASCADE')
    expect(lines).toContain('position smallint NOT NULL CHECK (position BETWEEN 1 AND 20)')
    expect(lines).toContain('UNIQUE (version_id, position)')
  })

  it('has the trip fields of a booking with their CHECKs', () => {
    expect(lines).toContain("trip_type text NOT NULL CHECK (trip_type IN ('transfer', 'hourly', 'daily'))")
    expect(lines).toContain("pickup_date text NOT NULL CHECK (pickup_date ~ '^\\d{4}-\\d{2}-\\d{2}$')")
    expect(lines).toContain("pickup_time text NOT NULL CHECK (pickup_time ~ '^\\d{2}:\\d{2}$')")
    expect(lines).toContain("landing_date text CHECK (landing_date IS NULL OR landing_date ~ '^\\d{4}-\\d{2}-\\d{2}$')")
    expect(lines).toContain("landing_time text CHECK (landing_time IS NULL OR landing_time ~ '^\\d{2}:\\d{2}$')")
    expect(lines).toContain('pickup_offset_min smallint CHECK (pickup_offset_min IS NULL OR pickup_offset_min IN (0, 15, 30, 45, 60, 90))')
    expect(lines).toContain(
      'CONSTRAINT quote_version_lines_landing_complete_check CHECK ( (landing_date IS NULL) = (landing_time IS NULL) AND (landing_time IS NULL) = (pickup_offset_min IS NULL) )',
    )
    expect(lines).toContain('origin_address text NOT NULL CHECK (char_length(origin_address) BETWEEN 1 AND 500)')
    expect(lines).toContain('destination_address text CHECK (destination_address IS NULL OR char_length(destination_address) <= 500)')
    expect(lines).toContain("vehicle_class text NOT NULL CHECK (vehicle_class IN ('business', 'first_class', 'business_van'))")
    expect(lines).toContain('passengers smallint NOT NULL CHECK (passengers BETWEEN 1 AND 20)')
    expect(lines).toContain('luggage smallint NOT NULL DEFAULT 0 CHECK (luggage BETWEEN 0 AND 20)')
    expect(lines).toContain('hours smallint CHECK (hours IS NULL OR hours BETWEEN 1 AND 24)')
    expect(lines).toContain('distance_km numeric CHECK (distance_km IS NULL OR distance_km >= 0)')
    expect(lines).toContain('extra_child_seat boolean NOT NULL DEFAULT false')
    expect(lines).toContain('extra_meet_greet boolean NOT NULL DEFAULT false')
    expect(lines).toContain('extra_luggage boolean NOT NULL DEFAULT false')
  })

  it('range-checks the coordinates', () => {
    for (const c of ['origin_lat', 'destination_lat']) {
      expect(lines).toContain(`${c} double precision CHECK (${c} IS NULL OR ${c} BETWEEN -90 AND 90)`)
    }
    for (const c of ['origin_lng', 'destination_lng']) {
      expect(lines).toContain(`${c} double precision CHECK (${c} IS NULL OR ${c} BETWEEN -180 AND 180)`)
    }
  })

  it('stores the price: positive amount, optional suggestion, deposit share plus remainder equals the amount', () => {
    expect(lines).toContain('suggested_amount_minor bigint CHECK (suggested_amount_minor IS NULL OR suggested_amount_minor > 0)')
    expect(lines).toContain('amount_minor bigint NOT NULL CHECK (amount_minor > 0)')
    expect(lines).toContain('price_overridden boolean NOT NULL DEFAULT false')
    expect(lines).toContain('deposit_share_minor bigint CHECK (deposit_share_minor IS NULL OR deposit_share_minor >= 0)')
    expect(lines).toContain('remainder_minor bigint CHECK (remainder_minor IS NULL OR remainder_minor >= 0)')
    expect(lines).toContain(
      'CHECK (deposit_share_minor IS NULL OR remainder_minor IS NULL OR deposit_share_minor + remainder_minor = amount_minor)',
    )
  })
})

describe('091 quote_version_line_stops (QUOTE-01, Phase 91 stops)', () => {
  const stops = table('quote_version_line_stops')

  it('has the booking_stops columns keyed to the line', () => {
    expect(stops).toContain('line_id uuid NOT NULL REFERENCES public.quote_version_lines(id) ON DELETE CASCADE')
    expect(stops).toContain('position smallint NOT NULL CHECK (position BETWEEN 1 AND 5)')
    expect(stops).toContain('address text CHECK (address IS NULL OR char_length(address) BETWEEN 1 AND 500)')
    expect(stops).toContain('lat double precision CHECK (lat IS NULL OR lat BETWEEN -90 AND 90)')
    expect(stops).toContain('lng double precision CHECK (lng IS NULL OR lng BETWEEN -180 AND 180)')
    expect(stops).toContain(
      'wait_minutes smallint NOT NULL DEFAULT 0 CHECK (wait_minutes BETWEEN 0 AND 120 AND wait_minutes % 15 = 0)',
    )
    expect(stops).toContain('free_minutes smallint NOT NULL CHECK (free_minutes >= 0)')
    expect(stops).toContain('blocks smallint NOT NULL DEFAULT 0 CHECK (blocks >= 0)')
    expect(stops).toContain('fee_per_block_eur numeric CHECK (fee_per_block_eur IS NULL OR fee_per_block_eur > 0)')
    expect(stops).toContain('fee_eur numeric NOT NULL DEFAULT 0 CHECK (fee_eur >= 0)')
    expect(stops).toContain('created_at timestamptz NOT NULL DEFAULT now()')
    expect(stops).toContain('UNIQUE (line_id, position)')
    expect(stops).not.toContain('booking_id')
  })
})

describe('091 quote_links (QUOTE-02, T-92-03)', () => {
  const links = table('quote_links')

  it('stores only the SHA-256 hex of the token, unique', () => {
    expect(links).toContain("token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$')")
    expect(links).toContain('quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE')
    expect(links).toContain('version_id uuid NOT NULL REFERENCES public.quote_versions(id) ON DELETE CASCADE')
    expect(links).toContain('revoked_at timestamptz')
    expect(links).toContain('created_by uuid')
  })

  it('no quote table has a column that could hold a raw token', () => {
    for (const name of DENY_ALL_TABLES) {
      expect(table(name), name).not.toMatch(/(^|[ (,])(token|raw_token|link_token|secret) (text|uuid|bytea)/)
    }
  })
})

describe('091 deny-all (QUOTE-06, T-92-01)', () => {
  it.each(DENY_ALL_TABLES)('%s: no anon / authenticated grants, RLS on, SELECT and INSERT denied', (name) => {
    expect(flat).toContain(`REVOKE ALL ON public.${name} FROM anon, authenticated;`)
    expect(flat).toContain(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY;`)
    expect(flat).toContain(`CREATE POLICY ${name}_no_public_read ON public.${name} FOR SELECT USING (false);`)
    expect(flat).toContain(`CREATE POLICY ${name}_no_public_insert ON public.${name} FOR INSERT WITH CHECK (false);`)
    expect(flat).toContain(`DROP POLICY IF EXISTS ${name}_no_public_read ON public.${name};`)
    expect(flat).not.toMatch(new RegExp(`GRANT [A-Z, ]+ ON (TABLE )?public\\.${name}\\b`, 'i'))
  })
})
