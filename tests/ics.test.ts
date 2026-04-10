import { describe, it, expect } from 'vitest'
import { buildIcs, escapeIcsText, type IcsEvent } from '@/lib/ics'

const OUTBOUND: IcsEvent = {
  uid: 'PRG-20260415-AAAAAA-outbound@prestigo.cz',
  date: '2026-04-15',
  time: '14:00',
  summary: 'PRESTIGO Transfer — PRG-20260415-AAAAAA (Outbound)',
  description: 'Pickup: Prague Airport T2\nDropoff: Hotel Hilton',
  location: 'Prague Airport Terminal 2',
}

const RETURN_LEG: IcsEvent = {
  uid: 'PRG-20260415-AAAAAA-return@prestigo.cz',
  date: '2026-04-17',
  time: '18:30',
  summary: 'PRESTIGO Transfer — PRG-20260415-BBBBBB (Return)',
  description: 'Pickup: Hotel Hilton\nDropoff: Prague Airport T2',
  location: 'Hotel Hilton',
}

describe('buildIcs', () => {
  it('ICS-01: empty events — valid VCALENDAR wrapper with VTIMEZONE', () => {
    const result = buildIcs([])
    // One BEGIN:VCALENDAR
    expect(result.split('BEGIN:VCALENDAR').length - 1).toBe(1)
    // One END:VCALENDAR
    expect(result.split('END:VCALENDAR').length - 1).toBe(1)
    expect(result).toContain('VERSION:2.0')
    expect(result).toContain('PRODID:-//PRESTIGO//Booking//EN')
    expect(result).toContain('CALSCALE:GREGORIAN')
    expect(result).toContain('METHOD:PUBLISH')
    // One VTIMEZONE block
    expect(result.split('BEGIN:VTIMEZONE').length - 1).toBe(1)
    expect(result).toContain('TZID:Europe/Prague')
  })

  it('ICS-02: single event — one VEVENT, DTSTART with TZID no Z', () => {
    const result = buildIcs([OUTBOUND])
    expect(result.split('BEGIN:VEVENT').length - 1).toBe(1)
    expect(result.split('END:VEVENT').length - 1).toBe(1)
    // DTSTART must use TZID=Europe/Prague format (no trailing Z)
    expect(result).toContain('DTSTART;TZID=Europe/Prague:20260415T140000')
    // DTEND = DTSTART + 60 minutes by default
    expect(result).toContain('DTEND;TZID=Europe/Prague:20260415T150000')
  })

  it('ICS-03: two events — two VEVENT blocks in one VCALENDAR', () => {
    const result = buildIcs([OUTBOUND, RETURN_LEG])
    expect(result.split('BEGIN:VEVENT').length - 1).toBe(2)
    expect(result.split('END:VEVENT').length - 1).toBe(2)
    expect(result.split('BEGIN:VCALENDAR').length - 1).toBe(1)
    expect(result.split('END:VCALENDAR').length - 1).toBe(1)
  })

  it('ICS-04: UIDs are unique and both appear in output', () => {
    const result = buildIcs([OUTBOUND, RETURN_LEG])
    expect(result).toContain('UID:PRG-20260415-AAAAAA-outbound@prestigo.cz')
    expect(result).toContain('UID:PRG-20260415-AAAAAA-return@prestigo.cz')
  })

  it('ICS-05: escapeIcsText escapes backslash, semicolon, comma, newline', () => {
    const input = 'Hello; world, "quoted" \\ path\nline2'
    const expected = 'Hello\\; world\\, "quoted" \\\\ path\\nline2'
    expect(escapeIcsText(input)).toBe(expected)
  })

  it('ICS-06: SUMMARY with semicolon is escaped in output', () => {
    const event: IcsEvent = { ...OUTBOUND, summary: 'Transfer; VIP' }
    const result = buildIcs([event])
    expect(result).toContain('SUMMARY:Transfer\\; VIP')
    expect(result).not.toContain('SUMMARY:Transfer; VIP')
  })

  it('ICS-07: DESCRIPTION with newline is escaped to single line', () => {
    const event: IcsEvent = { ...OUTBOUND, description: 'Pickup: PRG\nDropoff: Hilton' }
    const result = buildIcs([event])
    expect(result).toContain('DESCRIPTION:Pickup: PRG\\nDropoff: Hilton')
  })

  it('ICS-08: output uses CRLF line endings', () => {
    const result = buildIcs([])
    expect(result).toContain('BEGIN:VCALENDAR\r\n')
  })

  it('ICS-09: VTIMEZONE block matches Europe/Prague verbatim', () => {
    const result = buildIcs([])
    const expectedVtimezone = [
      'BEGIN:VTIMEZONE',
      'TZID:Europe/Prague',
      'BEGIN:STANDARD',
      'DTSTART:19701025T030000',
      'TZOFFSETFROM:+0200',
      'TZOFFSETTO:+0100',
      'TZNAME:CET',
      'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
      'END:STANDARD',
      'BEGIN:DAYLIGHT',
      'DTSTART:19700329T020000',
      'TZOFFSETFROM:+0100',
      'TZOFFSETTO:+0200',
      'TZNAME:CEST',
      'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
      'END:DAYLIGHT',
      'END:VTIMEZONE',
    ].join('\r\n')
    expect(result).toContain(expectedVtimezone)
  })

  it('ICS-10: Prague wall-clock preservation — DTSTART uses local time, not UTC', () => {
    const event: IcsEvent = { ...OUTBOUND, date: '2026-04-15', time: '14:00' }
    const result = buildIcs([event])
    // Must contain TZID format at 14:00
    expect(result).toContain('DTSTART;TZID=Europe/Prague:20260415T140000')
    // Must NOT contain UTC-Z drift form (e.g., 12:00Z)
    expect(result).not.toContain('DTSTART:20260415T120000Z')
    expect(result).not.toContain('DTSTART:20260415T140000Z')
  })

  it('ICS-11: durationMinutes override — 90 min produces correct DTEND', () => {
    const event: IcsEvent = { ...OUTBOUND, date: '2026-04-15', time: '14:00', durationMinutes: 90 }
    const result = buildIcs([event])
    expect(result).toContain('DTEND;TZID=Europe/Prague:20260415T153000')
  })

  it('ICS-12: DTSTAMP uses UTC Z format', () => {
    const result = buildIcs([OUTBOUND])
    expect(result).toMatch(/DTSTAMP:\d{8}T\d{6}Z/)
  })
})
