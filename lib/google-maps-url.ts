// Canonical Google Maps place URL built from the public Place ID (a Place ID
// is public data — every Maps link exposes it — so it is safe to embed in
// JSON-LD and links). Falls back to the share link only when GOOGLE_PLACE_ID
// is unset (local dev); on Vercel the env var is always present at build.
// trim(): the Vercel env value once carried a trailing newline, which leaked
// into JSON-LD sameAs and llms.txt as a broken URL.
const PLACE_ID = process.env.GOOGLE_PLACE_ID?.trim()

export const GOOGLE_MAPS_URL = PLACE_ID
  ? `https://www.google.com/maps/place/?q=place_id:${PLACE_ID}`
  : 'https://share.google/dPIa4HI97jeLPidw9'
