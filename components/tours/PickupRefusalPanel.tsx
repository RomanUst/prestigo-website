'use client'

// Phase 93 (plan 93-18; TRIP-04; D-05, D-22; UI-SPEC Surface 4.6): the guidance panel of the tour checkout. Copper, not
// red: a refused pickup (airport, outside the radius) or a trip that cannot be booked online is guidance, not a user
// error. role="status", an Info icon, a 3px copper rule on the inline start. PickupRefusalPanel is the pickup variant
// with the 'Request a custom tour' button; GuidancePanel is the same box with free text and actions for the other
// checkout states (too late, booking off, tour unavailable).

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Info } from 'lucide-react'
import { Link } from '@/i18n/routing'

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper'

export function GuidancePanel({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-[4px] border border-anthracite-light bg-anthracite-mid p-4 [border-inline-start:3px_solid_var(--copper)]"
    >
      <div className="flex items-start gap-3">
        <Info size={20} aria-hidden="true" className="mt-[2px] shrink-0 text-copper-light" />
        <p className="m-0 text-[14px] font-light leading-[1.5] text-offwhite">{children}</p>
      </div>
      {actions ? <div className="mt-4 flex flex-wrap items-center gap-4">{actions}</div> : null}
    </div>
  )
}

export type PickupRefusal = 'airport' | 'out_of_area'

export default function PickupRefusalPanel({ kind, customHref }: { kind: PickupRefusal; customHref: string }) {
  const t = useTranslations('Tours.checkout')
  return (
    <div data-testid="pickup-refusal" data-kind={kind}>
      <GuidancePanel
        actions={
          <Link href={customHref} className={`btn-secondary inline-flex min-h-[44px] items-center ${FOCUS_RING}`}>
            {t('refusalCta')}
          </Link>
        }
      >
        {kind === 'airport' ? t('refusalAirport') : t('refusalOutside')}
      </GuidancePanel>
    </div>
  )
}
