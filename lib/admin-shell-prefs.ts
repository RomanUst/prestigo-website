// Pure helpers for the admin shell preferences (Phase 86, D-01 / D-06).
//
// Two functional preference cookies drive the admin wrapper: `admin_theme`
// (light | dark) and `admin_sidebar` (expanded | collapsed). The server layout
// reads them, the client wrapper writes them on an explicit toggle. No Next
// imports and no 'use client', so both tiers can import this module.
//
// Values are user-controlled, so every parser maps onto a two-value union by
// strict equality only. Never trim or lowercase: a hostile or malformed value
// must fall back to the default (T-86-01).

export const ADMIN_THEME_COOKIE = 'admin_theme'
export const ADMIN_SIDEBAR_COOKIE = 'admin_sidebar'

export type AdminTheme = 'light' | 'dark'
export type AdminSidebarState = 'expanded' | 'collapsed'

export const DEFAULT_ADMIN_THEME: AdminTheme = 'light'
export const DEFAULT_ADMIN_SIDEBAR: AdminSidebarState = 'expanded'

const ONE_YEAR_SECONDS = 31536000

export function parseAdminTheme(v: string | null | undefined): AdminTheme {
  return v === 'dark' ? 'dark' : 'light'
}

export function parseAdminSidebar(v: string | null | undefined): AdminSidebarState {
  return v === 'collapsed' ? 'collapsed' : 'expanded'
}

function serializePrefCookie(name: string, value: string, secure: boolean): string {
  return `${name}=${value}; Path=/admin; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure ? '; Secure' : ''}`
}

export function serializeThemeCookie(theme: AdminTheme, secure: boolean): string {
  return serializePrefCookie(ADMIN_THEME_COOKIE, theme, secure)
}

export function serializeSidebarCookie(state: AdminSidebarState, secure: boolean): string {
  return serializePrefCookie(ADMIN_SIDEBAR_COOKIE, state, secure)
}

// ── Phase 90: remembered bookings view and calendar view (D-04, D-15) ───────
//
// `admin_bookings_view` remembers list | board | calendar on /admin/bookings;
// `admin_calendar_view` remembers day | week | month inside the calendar. Both are
// read by the server page, so the parsers use strict equality onto a closed union
// and fall back to the default for anything else (T-90-02, mirror of T-86-01).
// The value is never echoed into HTML or SQL.

export const ADMIN_BOOKINGS_VIEW_COOKIE = 'admin_bookings_view'
export const ADMIN_CALENDAR_VIEW_COOKIE = 'admin_calendar_view'

export type AdminBookingsView = 'list' | 'board' | 'calendar'
export type AdminCalendarView = 'day' | 'week' | 'month'

export const DEFAULT_ADMIN_BOOKINGS_VIEW: AdminBookingsView = 'list'
export const DEFAULT_ADMIN_CALENDAR_VIEW: AdminCalendarView = 'week'

function isBookingsView(v: string | null | undefined): v is AdminBookingsView {
  return v === 'list' || v === 'board' || v === 'calendar'
}

export function parseAdminBookingsView(v: string | null | undefined): AdminBookingsView {
  return isBookingsView(v) ? v : DEFAULT_ADMIN_BOOKINGS_VIEW
}

export function parseAdminCalendarView(v: string | null | undefined): AdminCalendarView {
  return v === 'day' || v === 'week' || v === 'month' ? v : DEFAULT_ADMIN_CALENDAR_VIEW
}

export function serializeBookingsViewCookie(view: AdminBookingsView, secure: boolean): string {
  return serializePrefCookie(ADMIN_BOOKINGS_VIEW_COOKIE, view, secure)
}

export function serializeCalendarViewCookie(view: AdminCalendarView, secure: boolean): string {
  return serializePrefCookie(ADMIN_CALENDAR_VIEW_COOKIE, view, secure)
}

/**
 * Which bookings view to render: a valid ?view= first, then the list when ?search= is present
 * (a deep link is about finding a row), then the remembered cookie, then the list.
 */
export function resolveBookingsView(input: {
  viewParam: string | null | undefined
  searchParam: string | null | undefined
  cookie: string | null | undefined
}): AdminBookingsView {
  if (isBookingsView(input.viewParam)) return input.viewParam
  if (typeof input.searchParam === 'string' && input.searchParam.length > 0) return 'list'
  return parseAdminBookingsView(input.cookie)
}
