-- coverage_zones: geographic zones for service area coverage
-- No seed data -- empty table, operator draws zones via admin UI in Phase 16
CREATE TABLE coverage_zones (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT        NOT NULL,
  geojson    JSONB       NOT NULL,
  active     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE coverage_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read" ON coverage_zones
  FOR SELECT USING (true);
