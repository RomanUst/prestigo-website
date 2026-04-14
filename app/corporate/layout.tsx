import type { Metadata } from 'next'

const CORPORATE_DESCRIPTION = 'Corporate chauffeur accounts in Prague: monthly invoicing, a dedicated account manager, priority dispatch, and a Mercedes fleet on call. Set up in 24 hours.'

export const metadata: Metadata = {
  title: 'Corporate Chauffeur Accounts Prague',
  description: CORPORATE_DESCRIPTION,
  alternates: {
    canonical: '/corporate',
  },
  openGraph: {
    url: 'https://rideprestigo.com/corporate',
    title: 'Corporate Chauffeur Accounts Prague | PRESTIGO',
    description: CORPORATE_DESCRIPTION,
  },
}

export default function CorporateLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
