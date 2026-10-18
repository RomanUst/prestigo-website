import { getPriceTable, priceOf, type CarClass } from '@/lib/live-prices'

type Props = {
  /** route_prices slug ('prague-vienna') or 'airport'. */
  route: string
  /** Vehicle class: e = E-Class, s = S-Class, v = V-Class. */
  car?: CarClass
  /** Show the fare split per person: per={4} → fare / 4, rounded. */
  per?: number
  /** Show the fare with the night tariff applied. */
  night?: boolean
}

/**
 * Live Prestigo fare as a bare number — the currency sign stays in the
 * article text, so every locale keeps its own format ("€<Price />",
 * "<Price /> €"). Renders nothing when the route has no live price.
 */
export default async function LivePrice({ route, car = 'e', per, night }: Props) {
  const table = await getPriceTable()
  const fare = priceOf(table, route, car)
  if (fare === null) return null
  let value = night ? fare * table.nightCoefficient : fare
  if (per) value = value / per
  return <bdi>{Math.round(value)}</bdi>
}
