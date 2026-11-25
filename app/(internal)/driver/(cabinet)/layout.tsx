import '@/app/(internal)/admin/admin-theme.css'
import '@/app/(internal)/driver/trip/driver-trip.css'
import './driver-cabinet.css'

// Phase 94 (D-02, D-14): every driver cabinet route is English and always light. The wrapper reuses the Phase 86
// admin theme tokens with a fixed data-admin-theme="light": no cookie is read and there is no toggle.
// This layout holds NO authentication: layouts do not re-run on client navigation (research Pitfall 4), so every
// cabinet page gates itself. The PWA theme colour lives in the manifest (plan 94-08), not here.
export const metadata = {
  robots: { index: false, follow: false },
}

export default function DriverCabinetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell driver-shell" data-admin-theme="light">
      <div className="driver-cabinet-column">{children}</div>
    </div>
  )
}
