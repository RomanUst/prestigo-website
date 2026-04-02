---
status: complete
phase: 16-admin-ui-pages
source: [16-01-SUMMARY.md, 16-02-SUMMARY.md, 16-03-SUMMARY.md, 16-04-SUMMARY.md, 16-05-SUMMARY.md]
started: 2026-04-02T12:00:00Z
updated: 2026-04-02T12:20:00Z
---

## Current Test

[testing complete]

## Tests

### 1. AdminSidebar Active Nav State
expected: Open any admin page (e.g. /admin/pricing). The nav item for the current page has a copper left border and lighter (off-white) text. All other nav items are greyed out with no border.
result: pass

### 2. Pricing Page Loads with Data
expected: Visit /admin/pricing. A form appears with a "Vehicle Class Rates" section showing a grid of rows (Business, First Class, Business Van) with their rate fields pre-filled from the API, and a "Global Parameters" section with airport fee, night/holiday coefficients etc. No blank/zero values unless the actual DB values are zero.
result: pass

### 3. Pricing Save with Inline Feedback
expected: Change any rate value and click "Save pricing". A green "Pricing saved." message appears inline near the button. It disappears automatically after ~3 seconds. If the API is unreachable, a red "Save failed. Try again." message appears instead.
result: pass

### 4. Zones Page Loads
expected: Visit /admin/zones. A Google Maps canvas fills most of the page with a zone list panel on the side. If no zones exist, an empty state ("No zones yet" or similar) is shown in the panel. The map does not crash or show a blank grey box.
result: issue
reported: "Runtime TypeError: Cannot read properties of null (reading 'addEventListener') at draw.start() — ZoneMapInner.tsx:65 DrawLayer.useEffect"
severity: major

### 5. Zone Drawing Mode
expected: On /admin/zones, click "DRAW ZONE". The button label changes to "STOP DRAWING". Clicking on the map places polygon vertices. Completing the polygon triggers a name prompt. Clicking "STOP DRAWING" cancels drawing mode.
result: skipped
reason: Zones page crashes before drawing can be tested (blocked by test 4 issue)

### 6. Bookings Page KPI Cards
expected: Visit /admin/bookings. Two KPI cards appear at the top: "TODAY" showing a booking count (number), and "THIS WEEK" showing a CZK revenue figure formatted with Czech locale spacing (e.g. "42 800 Kč"). Cards load without a crash even if values are 0.
result: pass

### 7. Bookings Table Renders
expected: Below the KPI cards, a table appears with columns: REF (copper monospace), PICKUP, CLIENT, TYPE, VEHICLE, AMOUNT (right-aligned), and an expand toggle column. Rows populate from the API. Pagination controls show "Showing X–Y of Z" and Previous/Next buttons.
result: pass

### 8. Bookings Search and Filter
expected: Type in the search input — after ~300ms the table updates to show only matching bookings (by name/ref). Click a trip type chip (e.g. "Transfer") — table filters to that type only. Clicking "All" resets. Date range From/To pickers also filter results when set.
result: pass

### 9. Bookings Expandable Row
expected: Click the chevron/expand toggle on any booking row. A detail section appears directly below that row showing a 2-column grid with extra fields, extras displayed as StatusBadge pills, and a PAYMENT ID (truncated to ~24 chars). Clicking again collapses it.
result: pass

### 10. Stats Dashboard Page
expected: Visit /admin/stats. Four KPI cards appear (bookings today, this week, this month, previous month revenue). Below them, three bar charts render with copper-toned bars: a monthly revenue trend chart, a vehicle class revenue breakdown, and a trip type breakdown. Charts are not blank/empty and have axis labels.
result: pass

## Summary

total: 10
passed: 8
issues: 1
pending: 0
skipped: 1

## Gaps

- truth: "Zones page loads with Google Maps canvas and zone list panel without crashing"
  status: failed
  reason: "User reported: Runtime TypeError: Cannot read properties of null (reading 'addEventListener') at draw.start() — ZoneMapInner.tsx:65 DrawLayer.useEffect"
  severity: major
  test: 4
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
