---
status: testing
phase: 66-driver-trip-portal-permanent-link-trip-sheet
source: [66-VERIFICATION.md]
started: 2026-09-01T00:00:00Z
updated: 2026-09-01T00:00:00Z
---

## Current Test

number: 1
name: Live browser render of a real /driver/trip/{trip_token} link (police-presentable trip sheet)
expected: |
  Trip sheet renders as an official, police-presentable document: wordmark + "Trip Sheet" heading,
  booking reference prominent, all Trip Details / Passenger / Route Map / Vehicle & Driver fields
  present with English labels, the embedded Google map draws and its logo / "Map data / Terms"
  attribution is visibly NOT hidden.
awaiting: user response

## Tests

### 1. Live browser render of a real /driver/trip/{trip_token} link
expected: Trip sheet renders as an official, police-presentable document — wordmark + "Trip Sheet" heading, booking reference prominent, all Trip Details / Passenger / Route Map / Vehicle & Driver fields present with English labels, embedded Google map draws with its logo / "Map data / Terms" attribution visibly NOT hidden.
result: [pending]

### 2. Map-loading placeholder (SDK still loading)
expected: While the Google Maps SDK is still loading client-side on the Route Map section, the map container shows the card-surface color (var(--anthracite-mid)) as background with NO spinner, per the UI-SPEC map-loading row. (PLAN-tagged `verification: backstop` — needs directly observed behavior.)
result: [pending]

### 3. Real email CTA render + real clipboard copy
expected: In a real assignment email (Gmail/Outlook), the VIEW TRIP SHEET button renders as a distinct gold-bordered CTA below the ACCEPT TRIP / DECLINE TRIP row and is clickable; in the live admin UI, clicking "Copy Trip Link" writes the correct {origin}/driver/trip/{trip_token} URL to the OS clipboard and the "Copied!" label swap is visible.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
