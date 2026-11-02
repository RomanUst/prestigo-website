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

function serializePrefCookie(name: string, value: AdminTheme | AdminSidebarState, secure: boolean): string {
  return `${name}=${value}; Path=/admin; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure ? '; Secure' : ''}`
}

export function serializeThemeCookie(theme: AdminTheme, secure: boolean): string {
  return serializePrefCookie(ADMIN_THEME_COOKIE, theme, secure)
}

export function serializeSidebarCookie(state: AdminSidebarState, secure: boolean): string {
  return serializePrefCookie(ADMIN_SIDEBAR_COOKIE, state, secure)
}
