'use client'
import { use } from 'react'
import TourEditor from '@/components/admin/tours/TourEditor'

// Phase 93 (plan 93-10; TRIP-05; UI-SPEC 7.3): the tour editor page. The (dashboard) layout runs the admin gate and mounts
// the sidebar; TourEditor loads /api/admin/tours/<id> (the server checks the admin session again).

export default function TourEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <TourEditor tourId={id} />
}
