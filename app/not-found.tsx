import type { Metadata } from 'next'

// Belt-and-braces fallback: this file sits OUTSIDE both app/[locale]/ and
// app/(internal)/ route groups, so it is the ONLY not-found renderer for a
// request that doesn't match either root layout's segment tree at all.
// Because there is no longer a single top-level app/layout.tsx (it was
// split into two root layouts — RESEARCH.md Pattern 3), this file must
// supply its own <html>/<body> — it is the top-most error boundary and has
// no wrapping layout to inherit them from.
export const metadata: Metadata = {
  title: 'Page Not Found — PRESTIGO',
  robots: { index: false, follow: false },
}

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body>
        <main style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '4rem 1.5rem' }}>
          <div>
            <p style={{ marginBottom: '1rem' }}>404</p>
            <h1 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>Page not found</h1>
            <a href="/">Back to Home</a>
          </div>
        </main>
      </body>
    </html>
  )
}
