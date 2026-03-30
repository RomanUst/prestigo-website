-- Bookings table schema for rideprestige.com
-- Extracted from prestigo/lib/supabase.ts
-- Run once in Supabase Dashboard > SQL Editor

CREATE TABLE bookings (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at          timestamptz DEFAULT now() NOT NULL,
  booking_reference   text NOT NULL,
  payment_intent_id   text UNIQUE,
  booking_type        text NOT NULL,
  trip_type           text NOT NULL,
  origin_address      text,
  origin_lat          float8,
  origin_lng          float8,
  destination_address text,
  destination_lat     float8,
  destination_lng     float8,
  hours               integer,
  passengers          integer NOT NULL,
  luggage             integer NOT NULL,
  pickup_date         text NOT NULL,
  pickup_time         text NOT NULL,
  return_date         text,
  vehicle_class       text NOT NULL,
  distance_km         float8,
  amount_czk          integer NOT NULL,
  amount_eur          integer,
  extra_child_seat    boolean DEFAULT false NOT NULL,
  extra_meet_greet    boolean DEFAULT false NOT NULL,
  extra_luggage       boolean DEFAULT false NOT NULL,
  client_first_name   text NOT NULL,
  client_last_name    text NOT NULL,
  client_email        text NOT NULL,
  client_phone        text NOT NULL,
  flight_number       text,
  terminal            text,
  special_requests    text
);
