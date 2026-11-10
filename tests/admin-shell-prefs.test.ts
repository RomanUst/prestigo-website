// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  ADMIN_THEME_COOKIE,
  ADMIN_SIDEBAR_COOKIE,
  DEFAULT_ADMIN_THEME,
  DEFAULT_ADMIN_SIDEBAR,
  parseAdminTheme,
  parseAdminSidebar,
  serializeThemeCookie,
  serializeSidebarCookie,
  ADMIN_BOOKINGS_VIEW_COOKIE,
  ADMIN_CALENDAR_VIEW_COOKIE,
  DEFAULT_ADMIN_BOOKINGS_VIEW,
  DEFAULT_ADMIN_CALENDAR_VIEW,
  parseAdminBookingsView,
  parseAdminCalendarView,
  resolveBookingsView,
  serializeBookingsViewCookie,
  serializeCalendarViewCookie,
} from '@/lib/admin-shell-prefs'

/**
 * Phase 86 D-01 / D-06: the admin theme and sidebar preferences live in two
 * cookies. The server layout reads them, so the parsers must map any
 * user-controlled value onto a two-value union by strict equality (T-86-01).
 */
describe('admin shell prefs: cookie names and defaults', () => {
  it('uses the documented cookie names and defaults', () => {
    expect(ADMIN_THEME_COOKIE).toBe('admin_theme')
    expect(ADMIN_SIDEBAR_COOKIE).toBe('admin_sidebar')
    expect(DEFAULT_ADMIN_THEME).toBe('light')
    expect(DEFAULT_ADMIN_SIDEBAR).toBe('expanded')
  })
})

describe('parseAdminTheme', () => {
  it('maps exactly "dark" to dark', () => {
    expect(parseAdminTheme('dark')).toBe('dark')
  })

  it.each([
    ['light'],
    [undefined],
    [null],
    [''],
    ['DARK'],
    [' dark'],
    ['dark '],
    ['"><script>alert(1)</script>'],
    ['dark; Path=/'],
  ])('falls back to light for %j', (value) => {
    expect(parseAdminTheme(value as string | null | undefined)).toBe('light')
  })
})

describe('parseAdminSidebar', () => {
  it('maps exactly "collapsed" to collapsed', () => {
    expect(parseAdminSidebar('collapsed')).toBe('collapsed')
  })

  it.each([
    ['expanded'],
    [undefined],
    [null],
    [''],
    ['COLLAPSED'],
    ['collapsed;x'],
    [' collapsed'],
    ['"><img src=x>'],
  ])('falls back to expanded for %j', (value) => {
    expect(parseAdminSidebar(value as string | null | undefined)).toBe('expanded')
  })
})

describe('cookie serialisers', () => {
  it('serializeThemeCookie builds the exact header value', () => {
    expect(serializeThemeCookie('dark', false)).toBe(
      'admin_theme=dark; Path=/admin; Max-Age=31536000; SameSite=Lax',
    )
    expect(serializeThemeCookie('light', true)).toBe(
      'admin_theme=light; Path=/admin; Max-Age=31536000; SameSite=Lax; Secure',
    )
  })

  it('serializeSidebarCookie builds the exact header value', () => {
    expect(serializeSidebarCookie('collapsed', true)).toBe(
      'admin_sidebar=collapsed; Path=/admin; Max-Age=31536000; SameSite=Lax; Secure',
    )
    expect(serializeSidebarCookie('expanded', false)).toBe(
      'admin_sidebar=expanded; Path=/admin; Max-Age=31536000; SameSite=Lax',
    )
  })

  it('round-trips through the parsers', () => {
    const themeValue = serializeThemeCookie('dark', false).split(';')[0].split('=')[1]
    const sidebarValue = serializeSidebarCookie('collapsed', false).split(';')[0].split('=')[1]
    expect(parseAdminTheme(themeValue)).toBe('dark')
    expect(parseAdminSidebar(sidebarValue)).toBe('collapsed')
  })
})

/**
 * Phase 90 D-04 / D-15: the bookings view (list | board | calendar) and the calendar view
 * (day | week | month) are remembered in two more cookies. Same discipline as T-86-01 /
 * T-90-02: strict equality onto a closed union, never trim or lowercase.
 */
describe('bookings view and calendar view: cookie names and defaults', () => {
  it('uses the documented cookie names and defaults', () => {
    expect(ADMIN_BOOKINGS_VIEW_COOKIE).toBe('admin_bookings_view')
    expect(ADMIN_CALENDAR_VIEW_COOKIE).toBe('admin_calendar_view')
    expect(DEFAULT_ADMIN_BOOKINGS_VIEW).toBe('list')
    expect(DEFAULT_ADMIN_CALENDAR_VIEW).toBe('week')
  })
})

describe('parseAdminBookingsView', () => {
  it.each([['list'], ['board'], ['calendar']])('maps exactly %j to itself', (value) => {
    expect(parseAdminBookingsView(value)).toBe(value)
  })

  it.each([
    [' board'],
    ['BOARD'],
    ['board '],
    [''],
    [null],
    [undefined],
    ['board;x'],
    ['kanban'],
    ['"><script>alert(1)</script>'],
    ['Calendar'],
  ])('falls back to list for %j', (value) => {
    expect(parseAdminBookingsView(value as string | null | undefined)).toBe('list')
  })
})

describe('parseAdminCalendarView', () => {
  it.each([['day'], ['week'], ['month']])('maps exactly %j to itself', (value) => {
    expect(parseAdminCalendarView(value)).toBe(value)
  })

  it.each([['Month'], [' day'], ['year'], [''], [null], [undefined], ['week;x'], ['WEEK']])(
    'falls back to week for %j',
    (value) => {
      expect(parseAdminCalendarView(value as string | null | undefined)).toBe('week')
    },
  )
})

describe('view cookie serialisers', () => {
  it('serializeBookingsViewCookie builds the exact header value', () => {
    expect(serializeBookingsViewCookie('board', true)).toBe(
      'admin_bookings_view=board; Path=/admin; Max-Age=31536000; SameSite=Lax; Secure',
    )
    expect(serializeBookingsViewCookie('board', false)).toBe(
      'admin_bookings_view=board; Path=/admin; Max-Age=31536000; SameSite=Lax',
    )
  })

  it('serializeCalendarViewCookie builds the exact header value', () => {
    expect(serializeCalendarViewCookie('month', true)).toBe(
      'admin_calendar_view=month; Path=/admin; Max-Age=31536000; SameSite=Lax; Secure',
    )
    expect(serializeCalendarViewCookie('day', false)).toBe(
      'admin_calendar_view=day; Path=/admin; Max-Age=31536000; SameSite=Lax',
    )
  })

  it('round-trips through the parsers', () => {
    const view = serializeBookingsViewCookie('calendar', false).split(';')[0].split('=')[1]
    const cal = serializeCalendarViewCookie('month', false).split(';')[0].split('=')[1]
    expect(parseAdminBookingsView(view)).toBe('calendar')
    expect(parseAdminCalendarView(cal)).toBe('month')
  })
})

describe('resolveBookingsView precedence', () => {
  it('a valid ?view= wins over ?search= and the cookie', () => {
    expect(resolveBookingsView({ viewParam: 'board', searchParam: 'PRG-1', cookie: 'calendar' })).toBe('board')
  })

  it('an invalid ?view= is not honoured; a present ?search= then selects the list', () => {
    expect(resolveBookingsView({ viewParam: 'bogus', searchParam: 'PRG-1', cookie: 'calendar' })).toBe('list')
  })

  it('an empty ?search= does not force the list, so the cookie decides', () => {
    expect(resolveBookingsView({ viewParam: null, searchParam: '', cookie: 'calendar' })).toBe('calendar')
  })

  it('an invalid cookie falls back to the list', () => {
    expect(resolveBookingsView({ viewParam: null, searchParam: null, cookie: 'nope' })).toBe('list')
  })

  it('a valid cookie is used when there is no ?view= and no ?search=', () => {
    expect(resolveBookingsView({ viewParam: undefined, searchParam: undefined, cookie: 'board' })).toBe('board')
  })

  it('no inputs at all yields the default', () => {
    expect(resolveBookingsView({ viewParam: undefined, searchParam: undefined, cookie: undefined })).toBe('list')
  })

  it('does not trim or lowercase ?view=', () => {
    expect(resolveBookingsView({ viewParam: ' board', searchParam: null, cookie: 'calendar' })).toBe('calendar')
    expect(resolveBookingsView({ viewParam: 'BOARD', searchParam: null, cookie: 'calendar' })).toBe('calendar')
  })
})
