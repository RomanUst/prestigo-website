import type { Metadata } from 'next'

// Minimal 404 for the (internal) route group (/admin, /driver). Added for
// parity + noindex hygiene across all three not-found surfaces (per-locale,
// internal, top-level fallback) — see RESEARCH.md Open Question #3 and
// PLAN 68-02 Task 2. No Nav/Footer here: the internal surface has its own
// chrome (AdminSidebar / driver layout), unlike the public site.
export const metadata: Metadata = {
  title: 'Page Not Found — PRESTIGO Admin',
  robots: { index: false, follow: false },
}

export default function InternalNotFound() {
  return (
    <main
      id="main-content"
      style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '4rem 1.5rem',
      }}
    >
      <div>
        <p style={{ marginBottom: '1rem' }}>404</p>
        <h1 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>Page not found</h1>
        <a href="/admin">Back to Admin</a>
      </div>
    </main>
  )
}
