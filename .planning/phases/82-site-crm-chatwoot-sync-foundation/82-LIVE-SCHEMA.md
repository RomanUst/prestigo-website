# Phase 82 — Live Schema Snapshot

Generated 2026-10-19T19:20:09Z from the live project via Supabase MCP; catalog metadata only, no row values.

Project: `enakcryrtxlnjvjutfpv` (rideprestigo, Postgres 17.6). Sources: `information_schema` and `pg_catalog` only.

## Columns

151 columns across the 12 tables in scope.

| table | column | data_type | nullable | default |
|-------|--------|-----------|----------|---------|
| booking_edit_audit_log | id | uuid | NO | gen_random_uuid() |
| booking_edit_audit_log | booking_id | uuid | NO |  |
| booking_edit_audit_log | field | text | NO |  |
| booking_edit_audit_log | old_value | text | YES |  |
| booking_edit_audit_log | new_value | text | YES |  |
| booking_edit_audit_log | operator_id | uuid | YES |  |
| booking_edit_audit_log | changed_at | timestamp with time zone | NO | now() |
| booking_edit_audit_log | notified | boolean | NO | false |
| bookings | id | uuid | NO | gen_random_uuid() |
| bookings | created_at | timestamp with time zone | NO | now() |
| bookings | booking_reference | text | NO |  |
| bookings | payment_intent_id | text | YES |  |
| bookings | booking_type | text | NO |  |
| bookings | trip_type | text | NO |  |
| bookings | origin_address | text | YES |  |
| bookings | origin_lat | double precision | YES |  |
| bookings | origin_lng | double precision | YES |  |
| bookings | destination_address | text | YES |  |
| bookings | destination_lat | double precision | YES |  |
| bookings | destination_lng | double precision | YES |  |
| bookings | hours | integer | YES |  |
| bookings | passengers | integer | NO |  |
| bookings | luggage | integer | NO |  |
| bookings | pickup_date | text | NO |  |
| bookings | pickup_time | text | NO |  |
| bookings | return_date | text | YES |  |
| bookings | vehicle_class | text | NO |  |
| bookings | distance_km | double precision | YES |  |
| bookings | amount_czk | integer | NO |  |
| bookings | amount_eur | integer | YES |  |
| bookings | extra_child_seat | boolean | NO | false |
| bookings | extra_meet_greet | boolean | NO | false |
| bookings | extra_luggage | boolean | NO | false |
| bookings | client_first_name | text | NO |  |
| bookings | client_last_name | text | NO |  |
| bookings | client_email | text | NO |  |
| bookings | client_phone | text | NO |  |
| bookings | flight_number | text | YES |  |
| bookings | terminal | text | YES |  |
| bookings | special_requests | text | YES |  |
| bookings | status | text | NO | 'pending'::text |
| bookings | operator_notes | text | YES |  |
| bookings | booking_source | text | NO | 'online'::text |
| bookings | leg | text | NO | 'outbound'::text |
| bookings | linked_booking_id | uuid | YES |  |
| bookings | outbound_amount_czk | integer | YES |  |
| bookings | return_amount_czk | integer | YES |  |
| bookings | flight_iata | text | YES |  |
| bookings | flight_status | text | YES |  |
| bookings | flight_estimated_arrival | text | YES |  |
| bookings | flight_delay_minutes | integer | YES |  |
| bookings | flight_departure_airport | text | YES |  |
| bookings | flight_arrival_airport | text | YES |  |
| bookings | flight_terminal | text | YES |  |
| bookings | pickup_utc | timestamp with time zone | YES |  |
| bookings | driver_id | uuid | YES |  |
| bookings | user_id | uuid | YES |  |
| bookings | paid_at | timestamp with time zone | YES |  |
| bookings | invoice_number | text | YES |  |
| bookings | driver_price_czk | integer | YES |  |
| bookings | attempt_id | uuid | YES |  |
| bookings | payment_link_url | text | YES |  |
| bookings | payment_link_id | text | YES |  |
| bookings | locale | text | YES |  |
| bookings | lead_channel | text | YES |  |
| customer_profiles | id | uuid | NO | gen_random_uuid() |
| customer_profiles | user_id | uuid | NO |  |
| customer_profiles | account_type | text | NO | 'personal'::text |
| customer_profiles | company_name | text | YES |  |
| customer_profiles | created_at | timestamp with time zone | NO | now() |
| customer_profiles | updated_at | timestamp with time zone | NO | now() |
| customer_profiles | full_name | text | YES |  |
| customer_profiles | phone | text | YES |  |
| customer_profiles | ico | text | YES |  |
| customer_profiles | vat_id | text | YES |  |
| customer_profiles | billing_address | text | YES |  |
| driver_assignments | id | uuid | NO | gen_random_uuid() |
| driver_assignments | booking_id | uuid | YES |  |
| driver_assignments | driver_id | uuid | NO |  |
| driver_assignments | status | text | NO | 'pending'::text |
| driver_assignments | token | uuid | NO | gen_random_uuid() |
| driver_assignments | token_expires_at | timestamp with time zone | NO | (now() + '48:00:00'::interval) |
| driver_assignments | token_used_at | timestamp with time zone | YES |  |
| driver_assignments | created_at | timestamp with time zone | NO | now() |
| driver_assignments | trip_token | uuid | NO | gen_random_uuid() |
| driver_assignments | trip_progress | text | YES |  |
| driver_assignments | trip_note | text | YES |  |
| driver_assignments | trip_progress_updated_at | timestamp with time zone | YES |  |
| drivers | id | uuid | NO | gen_random_uuid() |
| drivers | name | text | NO |  |
| drivers | email | text | NO |  |
| drivers | phone | text | NO |  |
| drivers | vehicle_info | text | YES |  |
| drivers | created_at | timestamp with time zone | NO | now() |
| email_log | id | uuid | NO | gen_random_uuid() |
| email_log | booking_id | uuid | YES |  |
| email_log | email_type | text | NO |  |
| email_log | recipient | text | NO |  |
| email_log | sent_at | timestamp with time zone | NO | now() |
| gnet_bookings | id | uuid | NO | gen_random_uuid() |
| gnet_bookings | booking_id | uuid | NO |  |
| gnet_bookings | gnet_res_no | text | NO |  |
| gnet_bookings | transaction_id | text | NO |  |
| gnet_bookings | raw_payload | jsonb | NO | '{}'::jsonb |
| gnet_bookings | last_push_status | text | YES |  |
| gnet_bookings | last_push_error | text | YES |  |
| gnet_bookings | last_pushed_at | timestamp with time zone | YES |  |
| gnet_bookings | created_at | timestamp with time zone | NO | now() |
| inquiries | id | uuid | NO | gen_random_uuid() |
| inquiries | kind | text | NO |  |
| inquiries | email | text | NO |  |
| inquiries | email_normalized | text | YES |  |
| inquiries | name | text | YES |  |
| inquiries | phone | text | YES |  |
| inquiries | company | text | YES |  |
| inquiries | payload | jsonb | NO | '{}'::jsonb |
| inquiries | created_at | timestamp with time zone | NO | now() |
| integration_config | key | text | NO |  |
| integration_config | value | text | NO |  |
| integration_config | updated_at | timestamp with time zone | NO | now() |
| integration_outbox | id | uuid | NO | gen_random_uuid() |
| integration_outbox | event_type | text | NO |  |
| integration_outbox | aggregate_type | text | NO |  |
| integration_outbox | aggregate_id | uuid | NO |  |
| integration_outbox | idempotency_key | text | NO |  |
| integration_outbox | status | text | NO | 'pending'::text |
| integration_outbox | attempts | integer | NO | 0 |
| integration_outbox | available_at | timestamp with time zone | NO | now() |
| integration_outbox | lease_until | timestamp with time zone | YES |  |
| integration_outbox | last_error | text | YES |  |
| integration_outbox | created_at | timestamp with time zone | NO | now() |
| integration_outbox | updated_at | timestamp with time zone | NO | now() |
| integration_outbox | sent_at | timestamp with time zone | YES |  |
| quote_leads | id | uuid | NO | gen_random_uuid() |
| quote_leads | email | text | NO |  |
| quote_leads | quote_payload | jsonb | NO | '{}'::jsonb |
| quote_leads | consent_version | text | NO | 'transactional-v1'::text |
| quote_leads | consent_timestamp | timestamp with time zone | NO | now() |
| quote_leads | marketing_opt_in | boolean | NO | false |
| quote_leads | ip | text | YES |  |
| quote_leads | user_agent | text | YES |  |
| quote_leads | created_at | timestamp with time zone | NO | now() |
| saved_passengers | id | uuid | NO | gen_random_uuid() |
| saved_passengers | user_id | uuid | NO |  |
| saved_passengers | full_name | text | NO |  |
| saved_passengers | phone | text | NO |  |
| saved_passengers | email | text | YES |  |
| saved_passengers | notes | text | YES |  |
| saved_passengers | is_default | boolean | NO | false |
| saved_passengers | created_at | timestamp with time zone | NO | now() |
| saved_passengers | updated_at | timestamp with time zone | NO | now() |

Note: `bookings.payment_link_id` is `text` (nullable). `bookings.user_id` is `uuid` nullable (FK auth.users ON DELETE SET NULL).

## Constraints

40 constraints.

| table | constraint | definition |
|-------|------------|------------|
| booking_edit_audit_log | booking_edit_audit_log_booking_id_fkey | FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE |
| booking_edit_audit_log | booking_edit_audit_log_pkey | PRIMARY KEY (id) |
| bookings | bookings_booking_source_check | CHECK ((booking_source = ANY (ARRAY['online'::text, 'manual'::text, 'gnet'::text]))) |
| bookings | bookings_driver_id_fkey | FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL |
| bookings | bookings_lead_channel_check | CHECK (((lead_channel IS NULL) OR (lead_channel = ANY (ARRAY['whatsapp'::text, 'phone'::text, 'email'::text, 'partner'::text, 'other'::text])))) |
| bookings | bookings_leg_check | CHECK ((leg = ANY (ARRAY['outbound'::text, 'return'::text]))) |
| bookings | bookings_linked_booking_id_fkey | FOREIGN KEY (linked_booking_id) REFERENCES bookings(id) ON DELETE SET NULL |
| bookings | bookings_locale_format_check | CHECK (((locale IS NULL) OR (locale ~ '^[a-z]{2}(-[A-Za-z]{2,4})?$'::text))) |
| bookings | bookings_payment_intent_id_leg_key | UNIQUE (payment_intent_id, leg) |
| bookings | bookings_pkey | PRIMARY KEY (id) |
| bookings | bookings_status_check | CHECK ((status = ANY (ARRAY['unpaid'::text, 'pending'::text, 'confirmed'::text, 'completed'::text, 'cancelled'::text, 'assigned'::text, 'en_route'::text, 'on_location'::text]))) |
| bookings | bookings_user_id_fkey | FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL |
| customer_profiles | customer_profiles_account_type_check | CHECK ((account_type = ANY (ARRAY['personal'::text, 'corporate'::text]))) |
| customer_profiles | customer_profiles_pkey | PRIMARY KEY (id) |
| customer_profiles | customer_profiles_user_id_fkey | FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE |
| customer_profiles | customer_profiles_user_id_key | UNIQUE (user_id) |
| driver_assignments | driver_assignments_booking_id_fkey | FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL |
| driver_assignments | driver_assignments_driver_id_fkey | FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE |
| driver_assignments | driver_assignments_pkey | PRIMARY KEY (id) |
| driver_assignments | driver_assignments_status_check | CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text]))) |
| driver_assignments | driver_assignments_token_key | UNIQUE (token) |
| driver_assignments | driver_assignments_trip_progress_check | CHECK (((trip_progress IS NULL) OR (trip_progress = ANY (ARRAY['en_route'::text, 'arrived'::text, 'on_board'::text, 'completed'::text, 'no_show'::text])))) |
| drivers | drivers_email_key | UNIQUE (email) |
| drivers | drivers_pkey | PRIMARY KEY (id) |
| email_log | email_log_booking_id_fkey | FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL |
| email_log | email_log_pkey | PRIMARY KEY (id) |
| gnet_bookings | gnet_bookings_booking_id_fkey | FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT |
| gnet_bookings | gnet_bookings_gnet_res_no_key | UNIQUE (gnet_res_no) |
| gnet_bookings | gnet_bookings_pkey | PRIMARY KEY (id) |
| gnet_bookings | gnet_bookings_transaction_id_key | UNIQUE (transaction_id) |
| inquiries | inquiries_kind_check | CHECK ((kind = ANY (ARRAY['contact'::text, 'corporate'::text, 'multiday_quote'::text]))) |
| inquiries | inquiries_pkey | PRIMARY KEY (id) |
| integration_config | integration_config_pkey | PRIMARY KEY (key) |
| integration_outbox | integration_outbox_idempotency_key_check | CHECK (((char_length(idempotency_key) >= 1) AND (char_length(idempotency_key) <= 120))) |
| integration_outbox | integration_outbox_last_error_check | CHECK (((last_error IS NULL) OR (last_error ~ '^[a-z0-9_]{1,40}$'::text))) |
| integration_outbox | integration_outbox_pkey | PRIMARY KEY (id) |
| integration_outbox | integration_outbox_status_check | CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'skipped'::text, 'failed'::text]))) |
| quote_leads | quote_leads_pkey | PRIMARY KEY (id) |
| saved_passengers | saved_passengers_pkey | PRIMARY KEY (id) |
| saved_passengers | saved_passengers_user_id_fkey | FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE |

Note: `integration_outbox` has no CHECK on `event_type` or `aggregate_type` (free text); uniqueness of `idempotency_key` is enforced by an index, not a constraint (see migration 064).

## Triggers

2 non-internal triggers on `public.bookings`; 0 on `public.customer_profiles`.

| table | trigger | definition |
|-------|---------|------------|
| bookings | bookings_gcal_sync | `CREATE TRIGGER bookings_gcal_sync AFTER INSERT OR UPDATE OF status, pickup_utc, pickup_date, pickup_time, hours, distance_km, origin_address, destination_address, vehicle_class, passengers, luggage, client_first_name, client_last_name, client_phone, client_email, flight_number, terminal, special_requests, operator_notes, extra_child_seat, extra_meet_greet, driver_id ON public.bookings FOR EACH ROW EXECUTE FUNCTION notify_booking_gcal_sync()` |
| bookings | bookings_lead_outbox | `CREATE TRIGGER bookings_lead_outbox AFTER INSERT OR UPDATE OF status ON public.bookings FOR EACH ROW EXECUTE FUNCTION enqueue_booking_lead()` |

## Functions

1 overload of `public.admin_search_bookings` (8 args). Equals the 059 text: yes — same signature, defaults, SECURITY DEFINER, search_path and body; only the parameter-list whitespace differs (pg_get_functiondef normalizes formatting). Search covers `client_first_name`, `client_last_name`, `booking_reference` only (no email).

```sql
CREATE OR REPLACE FUNCTION public.admin_search_bookings(p_query text DEFAULT NULL::text, p_start_date text DEFAULT NULL::text, p_end_date text DEFAULT NULL::text, p_trip_type text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_sort text DEFAULT 'created_desc'::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 20)
 RETURNS TABLE(rows jsonb, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_like TEXT;
BEGIN
  IF p_limit  IS NULL OR p_limit  < 1   THEN p_limit  := 20;  END IF;
  IF p_limit  > 100                     THEN p_limit  := 100; END IF;
  IF p_offset IS NULL OR p_offset < 0   THEN p_offset := 0;   END IF;

  IF p_query IS NULL OR length(trim(p_query)) = 0 THEN
    v_like := NULL;
  ELSE
    v_like := '%' || trim(p_query) || '%';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT b.*
    FROM public.bookings b
    WHERE (p_start_date IS NULL OR b.pickup_date >= p_start_date)
      AND (p_end_date   IS NULL OR b.pickup_date <= p_end_date)
      AND (p_trip_type  IS NULL OR b.trip_type = p_trip_type)
      AND (p_status     IS NULL OR b.status = p_status)
      AND (
        v_like IS NULL
        OR b.client_first_name ILIKE v_like
        OR b.client_last_name  ILIKE v_like
        OR b.booking_reference ILIKE v_like
      )
  ),
  counted AS (
    SELECT count(*)::bigint AS c FROM filtered
  ),
  paged AS (
    SELECT *
    FROM filtered
    ORDER BY
      CASE WHEN p_sort = 'pickup_asc'  THEN pickup_date END ASC,
      CASE WHEN p_sort = 'pickup_desc' THEN pickup_date END DESC,
      created_at DESC
    OFFSET p_offset
    LIMIT  p_limit
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(paged.*) ORDER BY
      CASE WHEN p_sort = 'pickup_asc'  THEN paged.pickup_date END ASC,
      CASE WHEN p_sort = 'pickup_desc' THEN paged.pickup_date END DESC,
      paged.created_at DESC
    ), '[]'::jsonb) AS rows,
    (SELECT c FROM counted) AS total_count
  FROM paged;
END;
$function$
```

## PII Inventory

36 columns in public base tables whose name matches `email|phone|name|note|address|payload|recipient|passenger|request` (some matches, e.g. `passengers` integer, `email_type`, `workflow_name`, `coverage_zones.name`, are not personal data but are listed for completeness).

| table | column | data_type | nullable |
|-------|--------|-----------|----------|
| bookings | client_email | text | NO |
| bookings | client_first_name | text | NO |
| bookings | client_last_name | text | NO |
| bookings | client_phone | text | NO |
| bookings | destination_address | text | YES |
| bookings | operator_notes | text | YES |
| bookings | origin_address | text | YES |
| bookings | passengers | integer | NO |
| bookings | special_requests | text | YES |
| coverage_zones | name | text | NO |
| customer_profiles | billing_address | text | YES |
| customer_profiles | company_name | text | YES |
| customer_profiles | full_name | text | YES |
| customer_profiles | phone | text | YES |
| driver_assignments | trip_note | text | YES |
| drivers | email | text | NO |
| drivers | name | text | NO |
| drivers | phone | text | NO |
| email_log | email_type | text | NO |
| email_log | recipient | text | NO |
| fb_welcomed_users | first_name | text | YES |
| gnet_bookings | raw_payload | jsonb | NO |
| inquiries | email | text | NO |
| inquiries | email_normalized | text | YES |
| inquiries | name | text | YES |
| inquiries | payload | jsonb | NO |
| inquiries | phone | text | YES |
| quote_leads | email | text | NO |
| quote_leads | quote_payload | jsonb | NO |
| saved_passengers | email | text | YES |
| saved_passengers | full_name | text | NO |
| saved_passengers | notes | text | YES |
| saved_passengers | phone | text | NO |
| welcomed_followers | username | text | YES |
| workflow_logs | payload | jsonb | YES |
| workflow_logs | workflow_name | text | NO |

Erasure-relevant: `bookings.client_first_name/last_name/email/phone` are NOT NULL (erasure must overwrite with markers, not NULL). `drivers.*` are staff, not customers.

## Foreign Keys

18 foreign keys referencing `public.bookings` or `auth.users`.

| table | constraint | references | on delete |
|-------|------------|------------|-----------|
| auth.identities | identities_user_id_fkey | auth.users | CASCADE |
| auth.mfa_factors | mfa_factors_user_id_fkey | auth.users | CASCADE |
| auth.mfa_recovery_code_sets | mfa_recovery_code_sets_user_id_fkey | auth.users | CASCADE |
| auth.oauth_authorizations | oauth_authorizations_user_id_fkey | auth.users | CASCADE |
| auth.oauth_consents | oauth_consents_user_id_fkey | auth.users | CASCADE |
| auth.one_time_tokens | one_time_tokens_user_id_fkey | auth.users | CASCADE |
| auth.scim_users | scim_users_user_id_fkey | auth.users | SET NULL |
| auth.sessions | sessions_user_id_fkey | auth.users | CASCADE |
| auth.webauthn_challenges | webauthn_challenges_user_id_fkey | auth.users | CASCADE |
| auth.webauthn_credentials | webauthn_credentials_user_id_fkey | auth.users | CASCADE |
| booking_edit_audit_log | booking_edit_audit_log_booking_id_fkey | bookings | CASCADE |
| bookings | bookings_user_id_fkey | auth.users | SET NULL |
| bookings | bookings_linked_booking_id_fkey | bookings | SET NULL |
| customer_profiles | customer_profiles_user_id_fkey | auth.users | CASCADE |
| driver_assignments | driver_assignments_booking_id_fkey | bookings | SET NULL |
| email_log | email_log_booking_id_fkey | bookings | SET NULL |
| gnet_bookings | gnet_bookings_booking_id_fkey | bookings | RESTRICT |
| saved_passengers | saved_passengers_user_id_fkey | auth.users | CASCADE |

## auth.users access

- `has_table_privilege('postgres','auth.users','SELECT')` = **true**
- auth.users columns that are NOT NULL without a default (the 82-01 smoke step (g) must fill them):

| column | data_type |
|--------|-----------|
| id | uuid |

Reminder (project memory): rows inserted into auth.users via raw SQL should set the token columns (`confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change`) to `''` — only relevant for rows that persist; the rolled-back smoke does not persist.
