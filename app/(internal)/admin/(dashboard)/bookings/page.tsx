import { cookies } from 'next/headers'
import BookingsWorkspace from '@/components/admin/BookingsWorkspace'
import {
  ADMIN_BOOKINGS_VIEW_COOKIE,
  ADMIN_CALENDAR_VIEW_COOKIE,
  parseAdminCalendarView,
  resolveBookingsView,
} from '@/lib/admin-shell-prefs'

// Phase 90 (D-04): a server page so the first paint already shows the right tab. It stays inside the (dashboard)
// route group, whose layout still runs the admin gate. The view comes from a valid ?view=, else the list when a
// ?search= deep link is present, else the admin_bookings_view cookie, else the list; all of them are mapped onto
// closed unions by strict equality (T-90-20), so a hostile value only ever selects a tab.

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const jar = await cookies()

  return (
    <BookingsWorkspace
      initialView={resolveBookingsView({
        viewParam: first(params.view),
        searchParam: first(params.search),
        cookie: jar.get(ADMIN_BOOKINGS_VIEW_COOKIE)?.value,
      })}
      initialCalendarView={parseAdminCalendarView(jar.get(ADMIN_CALENDAR_VIEW_COOKIE)?.value)}
    />
  )
}
