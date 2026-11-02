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
