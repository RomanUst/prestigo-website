import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Corporate Chauffeur Accounts Prague — PRESTIGO',
  description:
    'Corporate chauffeur accounts for Prague-based and international companies. Monthly invoicing, dedicated account manager, priority dispatch, Mercedes fleet. Set up in 24 hours.',
  alternates: {
    canonical: '/corporate',
  },
  openGraph: {
    url: 'https://rideprestigo.com/corporate',
    title: 'Corporate Chauffeur Accounts Prague — PRESTIGO',
    description:
      'Corporate chauffeur accounts for Prague-based and international companies. Monthly invoicing, dedicated account manager, priority dispatch, Mercedes fleet.',
  },
}

export default function CorporateLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
