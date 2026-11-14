// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { latestCheckValues, latestFunctionBody, loadMigration } from './helpers/latest-migration'
import { createFakePaymentsDb, FAKE_PAYMENT_VOCABULARY } from './helpers/fake-payments-db'
import { LEDGER_KINDS } from '@/lib/payments/state'
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

const SECTION5_TABLES = ['quote_acceptances', 'quote_events', 'quote_documents'] as const

describe('091 quote_acceptances (QUOTE-05, D-08)', () => {
  const acc = table('quote_acceptances')

  it('logs who accepted what: version, link, ip, user agent, the terms text and its hash, the deposit', () => {
    expect(acc).toContain('quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE')
    expect(acc).toContain('version_id uuid NOT NULL REFERENCES public.quote_versions(id) ON DELETE CASCADE')
    expect(acc).toContain('link_id uuid REFERENCES public.quote_links(id) ON DELETE SET NULL')
    expect(acc).toContain('accepted_at timestamptz NOT NULL DEFAULT now()')
    expect(acc).toContain('ip text CHECK (ip IS NULL OR char_length(ip) <= 64)')
    expect(acc).toContain('user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 300)')
    expect(acc).toContain('locale text NOT NULL')
    expect(acc).toContain('terms_version text NOT NULL')
    expect(acc).toContain("terms_sha256 text NOT NULL CHECK (terms_sha256 ~ '^[0-9a-f]{64}$')")
    expect(acc).toContain('terms_rendered text NOT NULL CHECK (char_length(terms_rendered) BETWEEN 1 AND 4000)')
    expect(acc).toContain('deposit_minor bigint NOT NULL CHECK (deposit_minor > 0)')
    expect(acc).toContain("currency text NOT NULL CHECK (currency IN ('eur', 'czk'))")
    expect(acc).toContain('hold_lead_hours smallint CHECK (hold_lead_hours IS NULL OR hold_lead_hours BETWEEN 6 AND 96)')
    expect(acc).toContain('payment_intent_id text')
    expect(acc).toContain('confirmed_at timestamptz')
  })
})

describe('091 quote_events (QUOTE-05)', () => {
  const ev = table('quote_events')

  it('is unique per (quote, event_key) with a named kind CHECK and the four actor types', () => {
    expect(ev).toContain('event_key text NOT NULL CHECK (char_length(event_key) BETWEEN 1 AND 200)')
    expect(ev).toContain('CONSTRAINT quote_events_quote_key_unique UNIQUE (quote_id, event_key)')
    expect(ev).toContain('CONSTRAINT quote_events_kind_check CHECK (kind IN (')
    expect(ev).toContain("actor_type text NOT NULL CHECK (actor_type IN ('admin', 'webhook', 'system', 'client'))")
    expect(ev).toContain('error_code text CHECK (error_code IS NULL OR char_length(error_code) <= 60)')
  })

  it('lists exactly the contract kinds, in order', () => {
    expect(latestCheckValues('quote_events_kind_check', 'kind')).toEqual([
      'created', 'sent', 'link_minted', 'viewed', 'revised', 'voided', 'accepted', 'deposit_started', 'deposit_paid',
      'deposit_failed', 'deposit_canceled', 'converted', 'convert_failed', 'orphan_refunded', 'dispute_opened',
      'email_sent', 'email_failed', 'alert_sent', 'reminder_scheduled', 'invoice_requested', 'invoice_paid',
      'remainder_requested', 'remainder_started', 'remainder_paid', 'remainder_failed', 'cancelled',
      'deposit_refunded', 'remainder_refunded', 'refund_failed', 'refund_observed', 'admin_action',
    ])
  })

  it('stores ids, amounts and codes only: no name, email, phone, address or ip column', () => {
    const forbidden = /(name|email|phone|address)|(^|_)ip($|_)/
    const cols = [...ev.matchAll(/(?:^|[(,] )([a-z_]+) (?:uuid|text|bigint|timestamptz)\b/g)].map((m) => m[1])
    expect(cols).toEqual(expect.arrayContaining(['quote_id', 'event_key', 'kind', 'amount_minor', 'actor_type']))
    for (const c of cols) expect(c, `column ${c}`).not.toMatch(forbidden)
  })
})

describe('091 quote_documents (D-14)', () => {
  const doc = table('quote_documents')

  it('keeps one PDF per version with its hash and size', () => {
    expect(doc).toContain('version_id uuid PRIMARY KEY REFERENCES public.quote_versions(id) ON DELETE CASCADE')
    expect(doc).toContain('locale text NOT NULL')
    expect(doc).toContain('pdf bytea NOT NULL')
    expect(doc).toContain("sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$')")
    expect(doc).toContain('byte_size integer NOT NULL CHECK (byte_size > 0)')
  })
})

describe('091 deny-all for the acceptance log, the event ledger and the stored PDF (T-92-01)', () => {
  it.each(SECTION5_TABLES)('%s: no anon / authenticated grants, RLS on, SELECT and INSERT denied', (name) => {
    expect(flat).toContain(`REVOKE ALL ON public.${name} FROM anon, authenticated;`)
    expect(flat).toContain(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY;`)
    expect(flat).toContain(`CREATE POLICY ${name}_no_public_read ON public.${name} FOR SELECT USING (false);`)
    expect(flat).toContain(`CREATE POLICY ${name}_no_public_insert ON public.${name} FOR INSERT WITH CHECK (false);`)
    expect(flat).not.toMatch(new RegExp(`GRANT [A-Z, ]+ ON (TABLE )?public\\.${name}\\b`, 'i'))
    expect(table(name)).not.toMatch(/(^|[ (,])(token|raw_token|link_token|secret) (text|uuid|bytea)/)
  })
})

describe('091 bookings link to the quote (D-18)', () => {
  it('adds quote_id, quote_line_id and quote_deposit_minor idempotently', () => {
    expect(flat).toContain('ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES public.quotes(id) ON DELETE RESTRICT')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS quote_line_id uuid REFERENCES public.quote_version_lines(id) ON DELETE RESTRICT')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS quote_deposit_minor bigint CHECK (quote_deposit_minor IS NULL OR quote_deposit_minor >= 0)')
  })

  it('has the unique partial index that makes the conversion exactly-once, and an index by quote', () => {
    expect(flat).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS bookings_quote_line_id_key ON public.bookings (quote_line_id) WHERE quote_line_id IS NOT NULL;',
    )
    expect(flat).toContain(
      'CREATE INDEX IF NOT EXISTS bookings_quote_id_idx ON public.bookings (quote_id) WHERE quote_id IS NOT NULL;',
    )
  })
})

describe('091 widened CHECKs', () => {
  const m089 = loadMigration('089_stops_landing_extra_charges.sql')
  const kinds = latestCheckValues('booking_payment_events_kind_check', 'kind')

  function kinds089(): string[] {
    const m = /booking_payment_events_kind_check\s+CHECK\s*\(\s*kind\s+IN\s*\(([\s\S]*?)\)\s*\)/.exec(m089)
    expect(m, '089 kind CHECK').not.toBeNull()
    return [...(m as RegExpExecArray)[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
  }

  it('the ledger kind CHECK is the full 089 list followed by quote_deposit and quote_remainder', () => {
    expect(kinds).toEqual([...kinds089(), 'quote_deposit', 'quote_remainder'])
  })

  it('LEDGER_KINDS and the fake DB vocabulary list the same kinds in the same order', () => {
    expect(kinds).toEqual([...LEDGER_KINDS])
    expect([...FAKE_PAYMENT_VOCABULARY.kinds]).toEqual([...LEDGER_KINDS])
    expect(LEDGER_KINDS.slice(-2)).toEqual(['quote_deposit', 'quote_remainder'])
  })

  it("the consent mode CHECK adds 'quote' to setup, hold_now, cash_setup", () => {
    expect(latestCheckValues('booking_payment_consents_mode_check', 'mode')).toEqual(['setup', 'hold_now', 'cash_setup', 'quote'])
  })

  it('touches only the mode constraint of the consents table (the locale one belongs to 090)', () => {
    expect(flat).not.toContain('booking_payment_consents_locale_check')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS booking_payment_consents_mode_check')
  })
})

describe('091 guard triggers (QUOTE-06, D-08, T-92-02, T-92-04)', () => {
  const erasure = "current_setting('prestigo.quote_erasure', true) = 'on'"

  it.each(['quote_versions_guard', 'quote_children_guard', 'quote_log_guard'])(
    '%s is plpgsql with an empty search_path, honours only the erasure setting, and is revoked from the API roles',
    (fn) => {
      const body = latestFunctionBody(fn)
      expect(body).toContain('LANGUAGE plpgsql')
      expect(body).toContain("SET search_path = ''")
      expect(body).toContain(erasure)
      expect(flat).toContain(`REVOKE EXECUTE ON FUNCTION public.${fn}() FROM PUBLIC, anon, authenticated;`)
    },
  )

  it('a frozen version, its lines and its stops raise quote_version_frozen', () => {
    expect(latestFunctionBody('quote_versions_guard')).toContain("RAISE EXCEPTION 'quote_version_frozen'")
    const children = latestFunctionBody('quote_children_guard')
    expect(children).toContain("RAISE EXCEPTION 'quote_version_frozen'")
    expect(children).toContain('frozen_at')
  })

  it('the acceptance log and the event ledger are append-only, except payment_intent_id / confirmed_at set once', () => {
    const log = latestFunctionBody('quote_log_guard')
    expect(log).toContain("RAISE EXCEPTION 'quote_log_append_only'")
    expect(log).toContain("'payment_intent_id'")
    expect(log).toContain("'confirmed_at'")
    expect(log).toContain('OLD.payment_intent_id IS NOT NULL')
    expect(log).toContain('OLD.confirmed_at IS NOT NULL')
  })

  it('attaches the guards as BEFORE triggers on every guarded table', () => {
    expect(flat).toContain('CREATE TRIGGER quote_versions_guard BEFORE UPDATE OR DELETE ON public.quote_versions FOR EACH ROW EXECUTE FUNCTION public.quote_versions_guard();')
    expect(flat).toContain('CREATE TRIGGER quote_version_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON public.quote_version_lines FOR EACH ROW EXECUTE FUNCTION public.quote_children_guard();')
    expect(flat).toContain('CREATE TRIGGER quote_version_line_stops_guard BEFORE INSERT OR UPDATE OR DELETE ON public.quote_version_line_stops FOR EACH ROW EXECUTE FUNCTION public.quote_children_guard();')
    expect(flat).toContain('CREATE TRIGGER quote_acceptances_guard BEFORE UPDATE OR DELETE ON public.quote_acceptances FOR EACH ROW EXECUTE FUNCTION public.quote_log_guard();')
    expect(flat).toContain('CREATE TRIGGER quote_events_guard BEFORE UPDATE OR DELETE ON public.quote_events FOR EACH ROW EXECUTE FUNCTION public.quote_log_guard();')
  })
})

describe('fake DB mirrors the quote tables', () => {
  type Client = ReturnType<typeof createFakePaymentsDb>['client']
  const HASH_A = 'a'.repeat(64)
  const HASH_B = 'b'.repeat(64)

  const quoteRow = (over: Record<string, unknown> = {}) => ({
    reference: 'Q-20261114-ABC123',
    client_first_name: 'Ada',
    client_last_name: 'Lovelace',
    client_email: 'ada@example.com',
    lead_channel: 'email',
    ...over,
  })
  const versionRow = (quoteId: string, over: Record<string, unknown> = {}) => ({
    quote_id: quoteId,
    version_no: 1,
    locale: 'en',
    currency: 'eur',
    ...over,
  })
  const lineRow = (versionId: string, over: Record<string, unknown> = {}) => ({
    version_id: versionId,
    position: 1,
    trip_type: 'transfer',
    pickup_date: '2026-12-01',
    pickup_time: '10:00',
    origin_address: 'Vaclav Havel Airport Prague',
    vehicle_class: 'business',
    passengers: 2,
    amount_minor: 9000,
    ...over,
  })
  const frozenFields = {
    total_minor: 9000,
    deposit_kind: 'percent',
    deposit_value: 30,
    deposit_minor: 2700,
    remainder_method: 'saved_card',
    cancel_policy: { freeHours: 24, feePercent: 100 },
    terms_version: 'quote-terms-v1',
  }

  async function id(c: Client, table: string, row: Record<string, unknown>): Promise<string> {
    const res = await c.from(table).insert(row).select('*').single()
    expect(res.error, `${table} insert`).toBeNull()
    return (res.data as { id: string }).id
  }

  async function draft(c: Client) {
    const quoteId = await id(c, 'quotes', quoteRow())
    const versionId = await id(c, 'quote_versions', versionRow(quoteId))
    const lineId = await id(c, 'quote_version_lines', lineRow(versionId))
    return { quoteId, versionId, lineId }
  }

  const freeze = (c: Client, versionId: string) =>
    c.from('quote_versions').update({ ...frozenFields, frozen_at: '2026-11-14T10:00:00.000Z' }).eq('id', versionId)

  it('applies the column defaults of a new quote and a new version', async () => {
    const c = createFakePaymentsDb().client
    const q = await c.from('quotes').insert(quoteRow()).select('*').single()
    expect(q.data).toMatchObject({ status: 'draft', remainder_attempt: 0, deposit_refunded_minor: 0, remainder_refunded_minor: 0, current_version_id: null })
    const v = await c.from('quote_versions').insert(versionRow((q.data as { id: string }).id)).select('*').single()
    expect(v.data).toMatchObject({ frozen_at: null, total_minor: 0, deposit_kind: null, deposit_value: null, remainder_method: null })
  })

  it('accepts every site locale and rejects one that is not a site locale (quote_versions_locale_check)', async () => {
    const c = createFakePaymentsDb().client
    const quoteId = await id(c, 'quotes', quoteRow())
    let n = 0
    for (const locale of locales) {
      n += 1
      expect((await c.from('quote_versions').insert(versionRow(quoteId, { version_no: n, locale }))).error, locale).toBeNull()
    }
    const bad = await c.from('quote_versions').insert(versionRow(quoteId, { version_no: 99, locale: 'de' }))
    expect(bad.error?.message).toContain('quote_versions_locale_check')
  })

  it('rejects a bad quote status, reference, lead channel and remainder method with the constraint name', async () => {
    const c = createFakePaymentsDb().client
    expect((await c.from('quotes').insert(quoteRow({ status: 'frozen' }))).error?.message).toContain('quotes_status_check')
    expect((await c.from('quotes').insert(quoteRow({ reference: 'Q-1' }))).error?.message).toContain('quotes_reference_check')
    expect((await c.from('quotes').insert(quoteRow({ lead_channel: 'carrier-pigeon' }))).error?.message).toContain('quotes_lead_channel_check')
    const quoteId = await id(c, 'quotes', quoteRow())
    const bad = await c.from('quote_versions').insert(versionRow(quoteId, { remainder_method: 'barter' }))
    expect(bad.error?.message).toContain('quote_versions_remainder_method_check')
  })

  it('a second quote_links row with the same token_hash is 23505', async () => {
    const c = createFakePaymentsDb().client
    const { quoteId, versionId } = await draft(c)
    const link = (token_hash: string) => ({ quote_id: quoteId, version_id: versionId, token_hash })
    expect((await c.from('quote_links').insert(link(HASH_A))).error).toBeNull()
    expect((await c.from('quote_links').insert(link(HASH_A))).error?.code).toBe('23505')
    expect((await c.from('quote_links').insert(link(HASH_B))).error).toBeNull()
    expect((await c.from('quote_links').insert(link('not-a-hash'))).error?.message).toContain('quote_links_token_hash_check')
  })

  it('a second quote_events row with the same (quote_id, event_key) is 23505, another key is accepted', async () => {
    const c = createFakePaymentsDb().client
    const { quoteId } = await draft(c)
    const ev = (event_key: string) => ({ quote_id: quoteId, event_key, kind: 'sent', actor_type: 'admin' })
    expect((await c.from('quote_events').insert(ev('sent:1'))).error).toBeNull()
    expect((await c.from('quote_events').insert(ev('sent:1'))).error?.code).toBe('23505')
    expect((await c.from('quote_events').insert(ev('sent:2'))).error).toBeNull()
  })

  it('an unknown event kind returns quote_events_kind_check', async () => {
    const c = createFakePaymentsDb().client
    const { quoteId } = await draft(c)
    const res = await c.from('quote_events').insert({ quote_id: quoteId, event_key: 'k', kind: 'teleported', actor_type: 'admin' })
    expect(res.error?.message).toContain('quote_events_kind_check')
    const actor = await c.from('quote_events').insert({ quote_id: quoteId, event_key: 'k2', kind: 'sent', actor_type: 'ghost' })
    expect(actor.error?.message).toContain('quote_events_actor_type_check')
  })

  it('a second bookings row with the same quote_line_id is 23505; rows without a quote line never clash', async () => {
    const c = createFakePaymentsDb().client
    const { lineId } = await draft(c)
    expect((await c.from('bookings').insert({ quote_line_id: lineId })).error).toBeNull()
    expect((await c.from('bookings').insert({ quote_line_id: lineId })).error?.code).toBe('23505')
    expect((await c.from('bookings').insert({})).error).toBeNull()
    expect((await c.from('bookings').insert({})).error).toBeNull()
  })

  it('freezing needs the full set (quote_versions_frozen_complete); a complete version freezes', async () => {
    const c = createFakePaymentsDb().client
    const { versionId } = await draft(c)
    const early = await c.from('quote_versions').update({ frozen_at: '2026-11-14T10:00:00.000Z' }).eq('id', versionId)
    expect(early.error?.message).toContain('quote_versions_frozen_complete')
    const tooBig = await c.from('quote_versions').update({ ...frozenFields, deposit_minor: 9500, frozen_at: '2026-11-14T10:00:00.000Z' }).eq('id', versionId)
    expect(tooBig.error?.message).toContain('quote_versions_frozen_complete')
    expect((await freeze(c, versionId)).error).toBeNull()
  })

  it('a deposit percent above 100 is rejected', async () => {
    const c = createFakePaymentsDb().client
    const { versionId } = await draft(c)
    const res = await c.from('quote_versions').update({ deposit_kind: 'percent', deposit_value: 150 }).eq('id', versionId)
    expect(res.error?.message).toContain('quote_versions_deposit_percent_check')
  })

  it('a draft version, its lines and its stops stay editable', async () => {
    const c = createFakePaymentsDb().client
    const { versionId, lineId } = await draft(c)
    expect((await c.from('quote_versions').update({ total_minor: 9000 }).eq('id', versionId)).error).toBeNull()
    expect((await c.from('quote_version_lines').update({ amount_minor: 9500 }).eq('id', lineId)).error).toBeNull()
    const stop = await c.from('quote_version_line_stops').insert({ line_id: lineId, position: 1, address: 'Karlovo namesti 1, Praha', free_minutes: 15 })
    expect(stop.error).toBeNull()
  })

  it('a frozen version rejects update and delete with quote_version_frozen', async () => {
    const c = createFakePaymentsDb().client
    const { versionId } = await draft(c)
    expect((await freeze(c, versionId)).error).toBeNull()
    const upd = await c.from('quote_versions').update({ total_minor: 1 }).eq('id', versionId)
    expect(upd.error?.message).toBe('quote_version_frozen')
    const del = await c.from('quote_versions').delete().eq('id', versionId)
    expect(del.error?.message).toBe('quote_version_frozen')
  })

  it('a frozen version rejects a new line, a line change, a line delete and a stop write', async () => {
    const c = createFakePaymentsDb().client
    const { versionId, lineId } = await draft(c)
    const stopId = await id(c, 'quote_version_line_stops', { line_id: lineId, position: 1, address: 'A', free_minutes: 15 })
    expect((await freeze(c, versionId)).error).toBeNull()
    expect((await c.from('quote_version_lines').insert(lineRow(versionId, { position: 2 }))).error?.message).toBe('quote_version_frozen')
    expect((await c.from('quote_version_lines').update({ amount_minor: 1 }).eq('id', lineId)).error?.message).toBe('quote_version_frozen')
    expect((await c.from('quote_version_lines').delete().eq('id', lineId)).error?.message).toBe('quote_version_frozen')
    expect((await c.from('quote_version_line_stops').insert({ line_id: lineId, position: 2, address: 'B', free_minutes: 15 })).error?.message).toBe('quote_version_frozen')
    expect((await c.from('quote_version_line_stops').update({ wait_minutes: 30 }).eq('id', stopId)).error?.message).toBe('quote_version_frozen')
    expect((await c.from('quote_version_line_stops').delete().eq('id', stopId)).error?.message).toBe('quote_version_frozen')
  })

  it('a new version of the same quote is unaffected by the frozen one', async () => {
    const c = createFakePaymentsDb().client
    const { quoteId, versionId } = await draft(c)
    expect((await freeze(c, versionId)).error).toBeNull()
    const v2 = await c.from('quote_versions').insert(versionRow(quoteId, { version_no: 2 })).select('*').single()
    expect(v2.error).toBeNull()
    expect((await c.from('quote_version_lines').insert(lineRow((v2.data as { id: string }).id))).error).toBeNull()
    expect((await c.from('quote_versions').insert(versionRow(quoteId, { version_no: 2 }))).error?.code).toBe('23505')
  })

  it('the deposit and remainder of a line must add up to its amount', async () => {
    const c = createFakePaymentsDb().client
    const { versionId } = await draft(c)
    const bad = await c.from('quote_version_lines').insert(lineRow(versionId, { position: 2, deposit_share_minor: 100, remainder_minor: 100 }))
    expect(bad.error?.message).toContain('quote_version_lines_deposit_split_check')
    const ok = await c.from('quote_version_lines').insert(lineRow(versionId, { position: 2, deposit_share_minor: 2700, remainder_minor: 6300 }))
    expect(ok.error).toBeNull()
  })

  it('the acceptance log refuses deletes and edits, but allows payment_intent_id and confirmed_at once', async () => {
    const c = createFakePaymentsDb().client
    const { quoteId, versionId } = await draft(c)
    const accId = await id(c, 'quote_acceptances', {
      quote_id: quoteId, version_id: versionId, locale: 'en', terms_version: 'quote-terms-v1',
      terms_sha256: HASH_A, terms_rendered: 'terms', deposit_minor: 2700, currency: 'eur',
    })
    expect((await c.from('quote_acceptances').update({ terms_rendered: 'changed' }).eq('id', accId)).error?.message).toBe('quote_log_append_only')
    expect((await c.from('quote_acceptances').delete().eq('id', accId)).error?.message).toBe('quote_log_append_only')
    expect((await c.from('quote_acceptances').update({ payment_intent_id: 'pi_1' }).eq('id', accId)).error).toBeNull()
    expect((await c.from('quote_acceptances').update({ payment_intent_id: 'pi_2' }).eq('id', accId)).error?.message).toBe('quote_log_append_only')
    expect((await c.from('quote_acceptances').update({ confirmed_at: '2026-11-14T10:00:00.000Z' }).eq('id', accId)).error).toBeNull()
    expect((await c.from('quote_acceptances').update({ confirmed_at: '2026-11-15T10:00:00.000Z' }).eq('id', accId)).error?.message).toBe('quote_log_append_only')
  })

  it('the event ledger refuses updates and deletes', async () => {
    const c = createFakePaymentsDb().client
    const { quoteId } = await draft(c)
    const evId = await id(c, 'quote_events', { quote_id: quoteId, event_key: 'k', kind: 'sent', actor_type: 'admin' })
    expect((await c.from('quote_events').update({ kind: 'viewed' }).eq('id', evId)).error?.message).toBe('quote_log_append_only')
    expect((await c.from('quote_events').delete().eq('id', evId)).error?.message).toBe('quote_log_append_only')
  })

  it('rejects a child row whose parent does not exist (foreign key 23503)', async () => {
    const c = createFakePaymentsDb().client
    expect((await c.from('quote_versions').insert(versionRow('missing'))).error?.code).toBe('23503')
    expect((await c.from('quote_links').insert({ quote_id: 'missing', version_id: 'missing', token_hash: HASH_A })).error?.code).toBe('23503')
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
