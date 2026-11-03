-- 87-02 live smoke for migration 084 (status log, compare-and-set RPC, no-show RPC).
--
-- Run with the Supabase MCP execute_sql AFTER 084 is applied. It is one DO block that ends in a
-- RAISE EXCEPTION, so the whole run rolls back: the booking it touches is left exactly as it was, and
-- pg_net calls and outbox rows queued by the triggers roll back with it.
--
-- Expected result: the call FAILS with the final message of the block (all checks passed).
-- Any message starting with 'SMOKE_FAIL' (or any other error) is a failure of 084.

DO $$
DECLARE
  v_id        uuid;
  v_status    text;
  v_res       jsonb;
  v_completed timestamptz;
  v_caught    boolean;
  v_n         integer;
  v_actor     text;
  v_actor_id  text;
  v_source    text;
BEGIN
  -- Most recent booking that is not yet in the part of the flow this smoke walks through, and that
  -- has no completion fact yet.
  SELECT b.id, b.status INTO v_id, v_status
    FROM public.bookings b
   WHERE b.status NOT IN ('on_location', 'on_board', 'completed')
     AND NOT EXISTS (
       SELECT 1 FROM public.booking_status_log l
        WHERE l.booking_id = b.id AND l.to_status = 'completed'
     )
   ORDER BY b.created_at DESC
   LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL no-eligible-booking';
  END IF;

  -- 1. First compare-and-set wins.
  v_res := public.advance_booking_status(v_id, v_status, 'on_location', 'admin', 'smoke', 'smoke');
  IF (v_res->>'applied')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SMOKE_FAIL advance-to-on_location: %', v_res;
  END IF;
  IF v_res->>'previous_status' IS DISTINCT FROM v_status
     OR v_res->'booking'->>'status' IS DISTINCT FROM 'on_location' THEN
    RAISE EXCEPTION 'SMOKE_FAIL advance-to-on_location-shape: %', v_res;
  END IF;

  -- 2. The same call again loses and reports the current status.
  v_res := public.advance_booking_status(v_id, v_status, 'on_location', 'admin', 'smoke', 'smoke');
  IF (v_res->>'applied')::boolean IS DISTINCT FROM false
     OR v_res->>'current_status' IS DISTINCT FROM 'on_location' THEN
    RAISE EXCEPTION 'SMOKE_FAIL advance-replay: %', v_res;
  END IF;

  -- 3. An unknown booking is reported as not applied with a null current status.
  v_res := public.advance_booking_status(gen_random_uuid(), 'assigned', 'en_route', 'admin', 'smoke', 'smoke');
  IF (v_res->>'applied')::boolean IS DISTINCT FROM false OR v_res->'current_status' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'SMOKE_FAIL advance-unknown-booking: %', v_res;
  END IF;

  -- 4. An actor type outside admin|driver|system is rejected.
  v_caught := false;
  BEGIN
    PERFORM public.advance_booking_status(v_id, 'on_location', 'on_board', 'hacker', 'smoke', 'smoke');
  EXCEPTION WHEN raise_exception THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'SMOKE_FAIL invalid-actor-accepted';
  END IF;

  -- 5. No-show request: applied once, refused while pending, cleared once.
  v_res := public.set_no_show_request(v_id, 'request', 'driver', 'smoke');
  IF (v_res->>'applied')::boolean IS DISTINCT FROM true OR v_res->>'no_show_requested_at' IS NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL no-show-request: %', v_res;
  END IF;
  v_res := public.set_no_show_request(v_id, 'request', 'driver', 'smoke');
  IF (v_res->>'applied')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'SMOKE_FAIL no-show-request-replay: %', v_res;
  END IF;
  v_res := public.set_no_show_request(v_id, 'clear', 'admin', 'smoke');
  IF (v_res->>'applied')::boolean IS DISTINCT FROM true OR v_res->>'no_show_requested_at' IS NOT NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL no-show-clear: %', v_res;
  END IF;
  v_res := public.set_no_show_request(v_id, 'clear', 'admin', 'smoke');
  IF (v_res->>'applied')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'SMOKE_FAIL no-show-clear-replay: %', v_res;
  END IF;

  -- 6. An unknown no-show action is rejected.
  v_caught := false;
  BEGIN
    PERFORM public.set_no_show_request(v_id, 'bogus', 'admin', 'smoke');
  EXCEPTION WHEN raise_exception THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'SMOKE_FAIL no-show-bogus-action-accepted';
  END IF;

  -- 7. on_location -> on_board -> completed; completed_at is set on the move to completed only.
  v_res := public.advance_booking_status(v_id, 'on_location', 'on_board', 'admin', 'smoke', 'smoke');
  IF (v_res->>'applied')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SMOKE_FAIL advance-to-on_board: %', v_res;
  END IF;
  SELECT b.completed_at INTO v_completed FROM public.bookings b WHERE b.id = v_id;
  IF v_completed IS NOT NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL completed_at-set-too-early';
  END IF;

  v_res := public.advance_booking_status(v_id, 'on_board', 'completed', 'admin', 'smoke', 'smoke');
  IF (v_res->>'applied')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SMOKE_FAIL advance-to-completed: %', v_res;
  END IF;
  SELECT b.completed_at INTO v_completed FROM public.bookings b WHERE b.id = v_id;
  IF v_completed IS NULL OR v_res->'booking'->>'completed_at' IS NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL completed_at-missing';
  END IF;

  -- 8. A second completion fact for the same booking is rejected by the partial unique index.
  v_caught := false;
  BEGIN
    INSERT INTO public.booking_status_log (booking_id, event, from_status, to_status, actor_type)
    VALUES (v_id, 'status_change', 'on_board', 'completed', 'system');
  EXCEPTION WHEN unique_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'SMOKE_FAIL second-completed-row-accepted';
  END IF;

  -- 9. Log rows written in this transaction (created_at = now() = the transaction timestamp).
  SELECT count(*) INTO v_n FROM public.booking_status_log l
   WHERE l.booking_id = v_id AND l.created_at = now() AND l.event = 'status_change';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'SMOKE_FAIL status_change-rows-expected-3-got-%', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.booking_status_log l
   WHERE l.booking_id = v_id AND l.created_at = now() AND l.event = 'no_show_requested';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL no_show_requested-rows-expected-1-got-%', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.booking_status_log l
   WHERE l.booking_id = v_id AND l.created_at = now() AND l.event = 'no_show_cleared';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL no_show_cleared-rows-expected-1-got-%', v_n;
  END IF;

  -- 10. The completion row carries the actor the RPC was given.
  SELECT l.actor_type, l.actor_id, l.source INTO v_actor, v_actor_id, v_source
    FROM public.booking_status_log l
   WHERE l.booking_id = v_id AND l.event = 'status_change' AND l.to_status = 'completed';
  IF v_actor IS DISTINCT FROM 'admin' OR v_actor_id IS DISTINCT FROM 'smoke' OR v_source IS DISTINCT FROM 'smoke' THEN
    RAISE EXCEPTION 'SMOKE_FAIL completed-row-actor: % / % / %', v_actor, v_actor_id, v_source;
  END IF;

  -- 11. A legacy direct update (no RPC) is still logged, as 'system', and the RPC actor did not leak.
  UPDATE public.bookings SET status = 'cancelled' WHERE id = v_id;
  SELECT l.actor_type, l.actor_id INTO v_actor, v_actor_id
    FROM public.booking_status_log l
   WHERE l.booking_id = v_id AND l.event = 'status_change' AND l.to_status = 'cancelled' AND l.created_at = now();
  IF v_actor IS DISTINCT FROM 'system' OR v_actor_id IS NOT NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL legacy-writer-actor: % / %', v_actor, v_actor_id;
  END IF;

  RAISE EXCEPTION 'SMOKE_OK all checks passed';
END
$$;
