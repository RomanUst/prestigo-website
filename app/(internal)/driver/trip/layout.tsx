import '@/app/(internal)/admin/admin-theme.css'
import './driver-trip.css'

// Phase 87 D-19: the driver trip screen is always light. The wrapper reuses the Phase 86 admin
// theme tokens with a fixed data-admin-theme="light": no cookie is read, there is no toggle and no
// authentication here (the trip link token is the credential, checked by the page). Scoped to
// /driver/trip so /driver/response keeps its own look (D-21).
export default function DriverTripLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell driver-shell" data-admin-theme="light">
      {children}
    </div>
  )
}
