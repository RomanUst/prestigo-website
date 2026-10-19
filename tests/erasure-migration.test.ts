// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Text-level contract tests for migration 075 (Phase 82, plan 82-12, GDPR-01). The live behaviour is
// proven by the rolled-back smoke 82-12-smoke.sql; these tests pin the guards that must never be
// edited out.

const m075 = readFileSync(join(process.cwd(), 'supabase', 'migrations', '075_erasure.sql'), 'utf8')
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n')

/** Body of one function: from its CREATE line to the next CREATE OR REPLACE / REVOKE block. */
function fnBody(name: string): string {
  const start = m075.indexOf(`FUNCTION public.${name}(`)
  expect(start, `function ${name} not found`).toBeGreaterThan(-1)
  const rest = m075.slice(start + 10)
  const next = rest.search(/CREATE OR REPLACE FUNCTION|REVOKE EXECUTE/)
  return m075.slice(start, next === -1 ? undefined : start + 10 + next)
}

const PUBLIC_FUNCTIONS = [
  'erasure_scope(text, text)',
  'erasure_preview_create(uuid, text, jsonb, integer)',
  'erasure_confirm(uuid, uuid)',
  'erasure_load(uuid)',
  'erasure_record_step(uuid, text, jsonb)',
  'erasure_anonymise_person(uuid)',
  'erasure_complete(uuid, boolean, jsonb, text)',
  'erasure_log(integer)',
]
const INTERNAL_FUNCTIONS = ['erasure_booking_ids(uuid, uuid, text[])', 'erasure_inquiry_ids(text[])']

describe('075 erasure_requests table', () => {
  const table = m075.slice(m075.indexOf('CREATE TABLE IF NOT EXISTS public.erasure_requests'))
  const def = table.slice(0, table.indexOf(');'))

  it('keeps only a 64-hex HMAC as the lasting identifier and checks the status', () => {
    expect(def).toMatch(/email_hmac\s+text\s+NOT NULL CHECK \(email_hmac ~ '\^\[0-9a-f\]\{64\}\$'\)/)
    expect(def).toMatch(/status\s+text\s+NOT NULL CHECK \(status IN \('previewed', 'confirmed', 'running', 'completed', 'failed'\)\)/)
    expect(def).toMatch(/steps\s+jsonb\s+NOT NULL DEFAULT '\{\}'/)
    expect(def).toMatch(/counts\s+jsonb\s+NOT NULL DEFAULT '\{\}'/)
    expect(def).toMatch(/verified\s+boolean/)
  })

  it('has no foreign key: the audit row must outlive the identity, the bookings and the account', () => {
    expect(def).not.toMatch(/REFERENCES/i)
  })

  it('allows one active request per identity and per email hash (partial unique indexes)', () => {
    expect(m075).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS erasure_requests_active_identity_idx\s+ON public\.erasure_requests \(identity_id\)\s+WHERE status IN \('confirmed', 'running'\) AND identity_id IS NOT NULL/,
    )
    expect(m075).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS erasure_requests_active_hmac_idx\s+ON public\.erasure_requests \(email_hmac\)\s+WHERE status IN \('confirmed', 'running'\)/,
    )
  })

  it('is deny-all: RLS on, no privileges for anon / authenticated, four deny policies', () => {
    expect(m075).toMatch(/REVOKE ALL ON public\.erasure_requests FROM anon, authenticated/)
    expect(m075).toMatch(/ALTER TABLE public\.erasure_requests ENABLE ROW LEVEL SECURITY/)
    for (const op of ['read', 'insert', 'update', 'delete']) expect(m075).toContain(`_no_public_${op}`)
  })
})

describe('075 grants', () => {
  it('every function is SECURITY DEFINER with an empty search_path', () => {
    for (const sig of [...PUBLIC_FUNCTIONS, ...INTERNAL_FUNCTIONS]) {
      const body = fnBody(sig.slice(0, sig.indexOf('(')))
      expect(body, sig).toMatch(/SECURITY DEFINER/)
      expect(body, sig).toMatch(/SET search_path = ''/)
    }
  })

  it('has exactly one REVOKE line per function, and only the public ones are granted to service_role', () => {
    for (const sig of [...PUBLIC_FUNCTIONS, ...INTERNAL_FUNCTIONS]) {
      const revoke = `REVOKE EXECUTE ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`
      expect(m075.split(revoke).length - 1, sig).toBe(1)
    }
    for (const sig of PUBLIC_FUNCTIONS) {
      expect(m075, sig).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO service_role;`)
    }
    for (const sig of INTERNAL_FUNCTIONS) expect(m075, sig).not.toContain(`GRANT EXECUTE ON FUNCTION public.${sig}`)
    expect(m075).not.toMatch(/GRANT[^;]*\b(anon|authenticated|PUBLIC)\b/)
  })
})

describe('075 erasure_confirm', () => {
  const body = fnBody('erasure_confirm')

  it('freezes the identity and enqueues erase.person in the same transaction', () => {
    expect(body).toMatch(/SET erasing_at = COALESCE\(c\.erasing_at, now\(\)\)/)
    expect(body).toContain("'erase.person'")
    expect(body).toMatch(/'erase\.person:' \|\| p_request_id::text/)
    expect(body).toMatch(/COALESCE\(v_identity, p_request_id\)/)
    expect(body).toContain("'person'")
    expect(body.indexOf('erasing_at')).toBeLessThan(body.indexOf('outbox_enqueue'))
  })

  it('takes the identity lock before it locks the request row', () => {
    expect(body).toContain("pg_advisory_xact_lock(hashtextextended('identity', 0))")
    expect(body.indexOf('pg_advisory_xact_lock')).toBeLessThan(body.indexOf('FOR UPDATE'))
  })

  it('answers every refusal and turns a unique-index violation into already_in_progress', () => {
    for (const outcome of ['not_found', 'already_in_progress', 'not_previewed', 'expired', 'actor_mismatch', 'confirmed']) {
      expect(body, outcome).toContain(`'${outcome}'`)
    }
    expect(body).toMatch(/EXCEPTION WHEN unique_violation THEN\s+RETURN 'already_in_progress'/)
    expect(body).toMatch(/r\.requested_by <> p_actor/)
    expect(body).toMatch(/r\.expires_at <= now\(\)/)
  })

  it('never puts a shared phone into the scope (a desk number must not pull in another person)', () => {
    expect(body).toMatch(/f\.shared = false/)
  })
})

describe('075 erasure_anonymise_person', () => {
  const body = fnBody('erasure_anonymise_person')

  it('takes the global identity lock first and only runs for an active request', () => {
    expect(body.indexOf("pg_advisory_xact_lock(hashtextextended('identity', 0))")).toBeGreaterThan(-1)
    expect(body.indexOf('pg_advisory_xact_lock')).toBeLessThan(body.indexOf('FROM public.erasure_requests'))
    expect(body).toMatch(/r\.status NOT IN \('confirmed', 'running'\)/)
  })

  it('refuses to run before the CRM steps and a verified verify pass are recorded (Supabase is last)', () => {
    expect(body).toMatch(/r\.steps -> 'chatwoot' IS NULL/)
    expect(body).toMatch(/r\.steps -> 'espocrm' IS NULL/)
    expect(body).toMatch(/r\.steps -> 'verify' ->> 'verified'/)
    expect(body.indexOf("'CRM steps are not finished'")).toBeLessThan(body.indexOf('UPDATE public.bookings'))
  })

  it('anonymises bookings with the live-schema placeholders and sets anonymised_at', () => {
    expect(body).toMatch(/client_first_name\s+= ''/)
    expect(body).toMatch(/client_last_name\s+= ''/)
    expect(body).toMatch(/client_phone\s+= ''/)
    expect(body).toMatch(/client_email\s+= 'erased-' \|\| b\.id::text \|\| '@erased\.invalid'/)
    for (const col of [
      'special_requests',
      'operator_notes',
      'origin_address',
      'origin_lat',
      'destination_address',
      'destination_lng',
      'flight_number',
      'user_id',
    ]) {
      expect(body, col).toMatch(new RegExp(`${col}\\s+= NULL`))
    }
    expect(body).toMatch(/anonymised_at\s+= now\(\)/)
    expect(body).toMatch(/b\.anonymised_at IS NULL/)
  })

  it('never deletes or touches accounting columns of a booking', () => {
    expect(body).not.toMatch(/DELETE FROM public\.bookings/)
    for (const col of ['booking_reference', 'amount_czk', 'amount_eur', 'vehicle_class', 'invoice_number', 'pickup_date']) {
      expect(body.slice(body.indexOf('UPDATE public.bookings'), body.indexOf('booking_edit_audit_log')), col).not.toMatch(
        new RegExp(`\\b${col}\\s+=`),
      )
    }
  })

  it('scrubs the residual tables listed in the live PII inventory', () => {
    expect(body).toMatch(/UPDATE public\.booking_edit_audit_log/)
    expect(body).toMatch(/old_value = NULL, new_value = NULL/)
    expect(body).toMatch(/UPDATE public\.email_log/)
    expect(body).toMatch(/recipient = 'erased@erased\.invalid'/)
    expect(body).toMatch(/UPDATE public\.gnet_bookings/)
    expect(body).toMatch(/raw_payload = '\{\}'::jsonb/)
    expect(body).toMatch(/UPDATE public\.driver_assignments/)
    expect(body).toMatch(/trip_note = NULL/)
    expect(body).toMatch(/DELETE FROM public\.inquiries/)
    expect(body).toMatch(/DELETE FROM public\.quote_leads/)
  })

  it('deletes the identity row and the automatic shared flags nobody else holds', () => {
    expect(body).toMatch(/DELETE FROM public\.contact_identities c WHERE c\.id = r\.identity_id/)
    expect(body).toMatch(/DELETE FROM public\.phone_flags/)
    expect(body).toMatch(/f\.source = 'auto'/)
    expect(body).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.identity_phones p WHERE p\.phone = f\.phone\)/)
  })

  it('records the supabase step in the same transaction and is repeat-safe', () => {
    expect(body).toMatch(/jsonb_build_object\('supabase', v_counts/)
    expect(body).toMatch(/IF r\.steps -> 'supabase' IS NOT NULL THEN\s+RETURN/)
    for (const key of [
      'bookings_anonymised',
      'inquiries_deleted',
      'quote_leads_deleted',
      'audit_values_scrubbed',
      'email_log_scrubbed',
      'gnet_payloads_scrubbed',
      'trip_notes_scrubbed',
      'identity_deleted',
    ]) {
      expect(body, key).toContain(`'${key}'`)
    }
  })
})

describe('075 erasure_complete', () => {
  const body = fnBody('erasure_complete')

  it('clears every plaintext scope column and keeps the hash, the dates, steps, counts and verified', () => {
    expect(body).toMatch(/identity_id\s+= NULL/)
    expect(body).toMatch(/user_id\s+= NULL/)
    for (const col of ['booking_ids', 'inquiry_ids', 'subject_emails', 'subject_phones']) {
      expect(body, col).toMatch(new RegExp(`${col}\\s+= '\\{\\}'`))
    }
    expect(body).toMatch(/completed_at\s+= now\(\)/)
    expect(body).toMatch(/verified\s+= p_verified/)
    expect(body).not.toMatch(/email_hmac\s+=/)
    expect(body).not.toMatch(/steps\s+=/)
  })

  it('accepts only completed / failed and demands a verified, Supabase-complete request for completed', () => {
    expect(body).toMatch(/p_status NOT IN \('completed', 'failed'\)/)
    expect(body).toMatch(/p_status = 'completed' AND \(p_verified IS NOT TRUE OR r\.steps -> 'supabase' IS NULL\)/)
    expect(body).toMatch(/e\.status IN \('confirmed', 'running'\)|r\.status NOT IN \('confirmed', 'running'\)/)
  })
})

describe('075 erasure_record_step and erasure_load', () => {
  it('records only the five steps, only on an active request, and moves confirmed to running', () => {
    const body = fnBody('erasure_record_step')
    expect(body).toMatch(/p_step NOT IN \('chatwoot', 'espocrm', 'verify', 'supabase', 'auth'\)/)
    expect(body).toMatch(/e\.status IN \('confirmed', 'running'\)/)
    expect(body).toMatch(/THEN 'running'/)
    expect(body).toMatch(/'done_at', now\(\)/)
  })

  it('erasure_load returns the identity cache ids and the steps the saga resumes from', () => {
    const body = fnBody('erasure_load')
    for (const key of ['espo_contact_id', 'chatwoot_contact_id', 'user_id', 'booking_ids', 'inquiry_ids', 'steps', 'email_hmac', 'expires_at']) {
      expect(body, key).toContain(`'${key}'`)
    }
  })
})

describe('075 erasure_scope', () => {
  const body = fnBody('erasure_scope')

  it('answers every outcome', () => {
    for (const outcome of ['invalid', 'shared_phone', 'not_found', 'already_in_progress', 'ok']) {
      expect(body, outcome).toContain(`'${outcome}'`)
    }
  })

  it('returns shared_phone for a flagged or doubly held number, with the identities count', () => {
    expect(body).toMatch(/f\.phone = v_phone AND f\.shared/)
    expect(body).toMatch(/cardinality\(v_owners\) > 1/)
    expect(body).toMatch(/'identities', cardinality\(v_owners\)/)
  })

  it('returns already_in_progress when an active request holds the identity or an email', () => {
    expect(body).toMatch(/e\.status IN \('confirmed', 'running'\)/)
    expect(body).toMatch(/e\.identity_id = v_identity/)
    expect(body).toMatch(/e\.subject_emails && v_emails/)
  })

  it('lists only non-shared phones, counts upcoming non-cancelled trips and is read-only', () => {
    expect(body).toMatch(/f\.phone IS NULL OR f\.shared = false/)
    expect(body).toMatch(/b\.pickup_utc >= now\(\)/)
    expect(body).toMatch(/b\.status <> 'cancelled'/)
    expect(body).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/)
  })

  it('reuses the scope helpers (bookings by identity, email and account; inquiries and quote requests by email)', () => {
    expect(body).toContain('public.erasure_booking_ids(')
    expect(body).toContain('public.erasure_inquiry_ids(')
    expect(body).toMatch(/FROM public\.quote_leads/)
    for (const key of ['bookings', 'upcoming', 'inquiries', 'quote_leads', 'has_account']) expect(body).toContain(`'${key}'`)
  })
})

describe('075 erasure_preview_create', () => {
  const body = fnBody('erasure_preview_create')

  it('caps the TTL between 60 s and 3600 s', () => {
    expect(body).toMatch(/least\(greatest\(COALESCE\(p_ttl_seconds, 60\), 60\), 3600\)/)
  })

  it('stores a previewed row from an ok scope only, with the preview counts', () => {
    expect(body).toMatch(/p_scope ->> 'outcome' IS DISTINCT FROM 'ok'/)
    expect(body).toContain("'previewed'")
    expect(body).toMatch(/p_scope -> 'counts'/)
  })

  it('drops expired unconfirmed previews so plaintext scope does not linger', () => {
    expect(body).toMatch(/DELETE FROM public\.erasure_requests e\s+WHERE e\.status = 'previewed' AND e\.expires_at < now\(\)/)
  })
})

describe('075 erasure_log', () => {
  const body = fnBody('erasure_log')

  it('exposes only the first 10 hex characters of the hash, newest first, capped at 100', () => {
    expect(body).toMatch(/left\(e\.email_hmac, 10\)/)
    expect(body).toMatch(/ORDER BY e\.requested_at DESC/)
    expect(body).toMatch(/least\(greatest\(COALESCE\(p_limit, 20\), 1\), 100\)/)
    expect(body).not.toMatch(/subject_emails|subject_phones|identity_id|user_id|booking_ids/)
  })
})
