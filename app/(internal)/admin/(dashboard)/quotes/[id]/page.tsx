'use client'
import { use } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { QuoteBuilder } from '@/components/admin/quotes/QuoteBuilder'

// Phase 92-19 (QUOTE-01, QUOTE-03, QUOTE-04, QUOTE-06): the quote detail page. The (dashboard) layout runs the admin gate
// and mounts the sidebar; QuoteBuilder loads /api/admin/quotes/<id> (the server checks the admin session again) and
// renders the draft editor, or the same quote as read-only text once a version has been sent.

const backLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  marginBottom: '16px',
  color: 'var(--admin-text-muted)',
  textDecoration: 'none',
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-label)',
  textTransform: 'uppercase',
  letterSpacing: '0.2em',
}

export default function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <div>
      <Link href="/admin/quotes" style={backLinkStyle}>
        <ArrowLeft size={14} aria-hidden="true" /> Quotes
      </Link>
      <QuoteBuilder quoteId={id} />
    </div>
  )
}
