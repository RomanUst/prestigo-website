import SiteChrome, { siteMetadata } from '@/components/SiteChrome'

// /admin and /driver — non-localized internal areas. This root layout is
// intentionally NOT split by locale (hard-coded lang="en") and shares
// SiteChrome with app/[locale]/layout.tsx so chrome stays provably
// byte-for-byte identical (RESEARCH.md Pitfall 3).
export const metadata = siteMetadata

export default function InternalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <SiteChrome>{children}</SiteChrome>
    </html>
  )
}
