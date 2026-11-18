// Phase 93 (plan 93-11; TRIP-02; UI-SPEC 1.4): the five key facts of a tour page.
// Every number comes from the tour row, tour_settings or VEHICLE_CONFIG; no literal is typed here.
// Only text from the catalog is rendered (React text, never HTML).

import { Clock, Hourglass, Car, ShieldCheck, CreditCard } from 'lucide-react'
import { VEHICLE_CONFIG } from '@/types/booking'
import { totalTripHours } from '@/lib/tours/pricing'
import type { TourRow, TourSettingsRow } from '@/lib/tours/types'
import type { TourT } from '@/components/tours/tour-t'

/** The largest cabin of the three car classes (V-Class): the "up to N people per car" figure. */
export function maxPassengersPerCar(): number {
  return Math.max(...VEHICLE_CONFIG.map((v) => v.maxPassengers))
}

export default function TourKeyFacts({
  tour,
  settings,
  t,
}: {
  tour: Pick<TourRow, 'hours_included' | 'drive_minutes_each_way'>
  settings: Pick<TourSettingsRow, 'free_cancel_hours'>
  t: TourT
}) {
  const total = totalTripHours(tour)
  const facts: Array<{ key: string; icon: typeof Clock; line: string; sub?: string }> = []
  if (total !== null) {
    facts.push({ key: 'total', icon: Clock, line: t('facts.total', { hours: total }) })
  }
  facts.push(
    {
      key: 'atDestination',
      icon: Hourglass,
      line: t('facts.atDestination', { hours: tour.hours_included }),
      sub: t('facts.addTime'),
    },
    {
      key: 'private',
      icon: Car,
      line: t('facts.private'),
      sub: t('facts.upTo', { count: maxPassengersPerCar() }),
    },
    {
      key: 'freeCancel',
      icon: ShieldCheck,
      line: t('facts.freeCancel', { hours: settings.free_cancel_hours }),
    },
    {
      key: 'payLater',
      icon: CreditCard,
      line: t('facts.payLater'),
      sub: t('facts.payModes'),
    },
  )

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-6" data-testid="tour-key-facts">
      {facts.map(({ key, icon: Icon, line, sub }) => (
        <li key={key} className="flex items-start gap-2">
          <Icon size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-copper-light" />
          <div>
            <p className="font-body text-[14px] font-normal leading-[1.5] text-offwhite">{line}</p>
            {sub && <p className="font-body text-[14px] font-light leading-[1.5] text-warmgrey">{sub}</p>}
          </div>
        </li>
      ))}
    </ul>
  )
}
