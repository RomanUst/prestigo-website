-- 097: a quote draft keeps whatever the operator knows so far (owner request 2026-11-24).
--
-- A quote is first created so that no data is lost, then filled in as the client confirms the details. Until now every
-- line had to carry a pickup date, a time, a pickup address and an amount before the draft could be saved at all. From
-- here a DRAFT line may leave any of them empty (the builder shows those fields as TBC). Completeness moves to the
-- freeze: a version can only be frozen (sent to the client) when every line is complete, enforced here by the version
-- guard so no code path can send an incomplete quote. A frozen version therefore keeps exactly the guarantees it had
-- before (the conversion function, the PDF, the client page and the emails read only frozen versions).
--
-- Additive and reversible: no data changes. Rollback = re-add NOT NULL (only possible while no draft line is empty)
-- and restore quote_versions_guard from migration 091.

ALTER TABLE public.quote_version_lines ALTER COLUMN pickup_date DROP NOT NULL;
ALTER TABLE public.quote_version_lines ALTER COLUMN pickup_time DROP NOT NULL;
ALTER TABLE public.quote_version_lines ALTER COLUMN origin_address DROP NOT NULL;
ALTER TABLE public.quote_version_lines ALTER COLUMN amount_minor DROP NOT NULL;

-- The value checks stay; NULL passes a CHECK, so they need no change. The tour rule (title and hours) is a send rule
-- now: a tour line being drafted may still miss either.
ALTER TABLE public.quote_version_lines DROP CONSTRAINT IF EXISTS quote_version_lines_tour_complete_check;

CREATE OR REPLACE FUNCTION public.quote_versions_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_incomplete integer;
BEGIN
  IF current_setting('prestigo.quote_erasure', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'quote_version_frozen';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- 097: freezing (sending) needs every line complete.
  IF NEW.frozen_at IS NOT NULL THEN
    SELECT count(*) INTO v_incomplete
      FROM public.quote_version_lines l
     WHERE l.version_id = NEW.id
       AND (   l.pickup_date IS NULL
            OR l.pickup_time IS NULL
            OR l.origin_address IS NULL
            OR l.amount_minor IS NULL
            OR (l.trip_type = 'transfer' AND l.destination_address IS NULL)
            OR (l.trip_type = 'hourly' AND l.hours IS NULL)
            OR (l.trip_type = 'daily' AND l.return_date IS NULL)
            OR (l.trip_type = 'tour' AND (l.title IS NULL OR l.hours IS NULL)));
    IF v_incomplete > 0 THEN
      RAISE EXCEPTION 'quote_lines_incomplete';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
