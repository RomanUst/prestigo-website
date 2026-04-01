-- pricing_config: per-vehicle-class rates
-- Seed values sourced from prestigo/lib/pricing.ts constants (RATE_PER_KM, HOURLY_RATE, DAILY_RATE)
CREATE TABLE pricing_config (
  vehicle_class  TEXT          PRIMARY KEY,
  rate_per_km    NUMERIC(10,2) NOT NULL,
  hourly_rate    NUMERIC(10,2) NOT NULL,
  daily_rate     NUMERIC(10,2) NOT NULL
);

ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read" ON pricing_config
  FOR SELECT USING (true);

INSERT INTO pricing_config (vehicle_class, rate_per_km, hourly_rate, daily_rate) VALUES
  ('business',     2.80,  55, 320),
  ('first_class',  4.20,  85, 480),
  ('business_van', 3.50,  70, 400);

-- pricing_globals: singleton row for global pricing parameters
-- Seed values sourced from prestigo/lib/extras.ts constants (EXTRAS_PRICES)
-- airport_fee, night_coefficient, holiday_coefficient default to zero/unity (operator sets via admin UI in Phase 16)
CREATE TABLE pricing_globals (
  id                  INTEGER       PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  airport_fee         NUMERIC(10,2) NOT NULL DEFAULT 0,
  night_coefficient   NUMERIC(5,4)  NOT NULL DEFAULT 1.0,
  holiday_coefficient NUMERIC(5,4)  NOT NULL DEFAULT 1.0,
  extra_child_seat    NUMERIC(10,2) NOT NULL,
  extra_meet_greet    NUMERIC(10,2) NOT NULL,
  extra_luggage       NUMERIC(10,2) NOT NULL
);

ALTER TABLE pricing_globals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read" ON pricing_globals
  FOR SELECT USING (true);

INSERT INTO pricing_globals (
  id, airport_fee, night_coefficient, holiday_coefficient,
  extra_child_seat, extra_meet_greet, extra_luggage
) VALUES (
  1, 0, 1.0, 1.0, 15, 25, 20
);
