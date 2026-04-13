// Single source of truth for IATA flight-number validation.
// Importable from both server (lib/flight-status.ts) and client components.
//
// IATA carrier codes: 2-3 alphanumeric chars where mixed alphanumeric carriers
// are always exactly 2 chars (S7, 9W, B6). Pure-alpha carriers are 2-3 chars (OK, BA, EZY).
// \d{1,4} after carrier = strictly 1-4 digit flight number.
// Explicit alternation avoids ambiguity in /^[A-Z0-9]{2,3}\d{1,4}$/i where
// e.g. "OK12345" incorrectly matches as carrier="OK1" + flight="2345".
export const IATA_RE = /^([A-Z]{2,3}|[A-Z][0-9]|[0-9][A-Z])\d{1,4}$/i
