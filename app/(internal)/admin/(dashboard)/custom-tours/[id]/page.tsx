'use client'
import { use } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import CustomTourDetail from '@/components/admin/custom-tours/CustomTourDetail'

// Phase 93 (plan 93-33; TRIP-07): one custom-tour request. The (dashboard) layout runs the admin gate and mounts the sidebar;
// CustomTourDetail loads /api/admin/custom-tours/<id> (the server checks the admin session again).

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

export default function CustomTourDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <div>
      <Link href="/admin/custom-tours" style={backLinkStyle}>
        <ArrowLeft size={14} aria-hidden="true" /> All requests
      </Link>
      <CustomTourDetail requestId={id} />
    </div>
  )
}
