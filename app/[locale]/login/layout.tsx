import type { Metadata } from 'next'

// /login is a utility auth screen with no search value. The page itself is a
// client component and cannot export metadata, so the noindex directive lives
// here in a server-component layout wrapper.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
