import type { PricingGlobals } from '@/lib/pricing-config'
import { getEffectiveAirportPrice } from '@/lib/airport-promo'
import PromoBadge from './PromoBadge'

type Props = {
  config: PricingGlobals
  sClassPrice: number
  vClassPrice: number
}

export default function TierLadder({ config, sClassPrice, vClassPrice }: Props) {
  const ePrice = getEffectiveAirportPrice('business', config, sClassPrice, vClassPrice)
  const sPrice = getEffectiveAirportPrice('first_class', config, sClassPrice, vClassPrice)
  const vPrice = getEffectiveAirportPrice('business_van', config, sClassPrice, vClassPrice)
  const showPromo = config.airportPromoActive

  return (
    <div className="tier-ladder-grid">
      <div className="tier-card" id="tier-business">
        {showPromo && <PromoBadge />}
        <h3 className="tier-title">Business</h3>
        <p className="tier-capacity">Mercedes E-Class · 1–3 pax</p>
        <p className="tier-price">€{ePrice}</p>
        {showPromo && (
          <p className="tier-was-price"><s>€{config.airportRegularPriceEur}</s></p>
        )}
        <a href="/book?type=airport&class=business" className="tier-cta">Book now</a>
      </div>
      <div className="tier-card tier-card-copper" id="tier-first">
        <h3 className="tier-title">First Class</h3>
        <p className="tier-capacity">Mercedes S-Class · 1–3 pax</p>
        <p className="tier-price">€{sPrice}</p>
        <a href="/book?type=airport&class=first_class" className="tier-cta">Book now</a>
      </div>
      <div className="tier-card" id="tier-van">
        <h3 className="tier-title">Business Van</h3>
        <p className="tier-capacity">Mercedes V-Class · 1–6 pax</p>
        <p className="tier-price">€{vPrice}</p>
        <a href="/book?type=airport&class=business_van" className="tier-cta">Book now</a>
      </div>
      <nav className="tier-dots" aria-label="Tier carousel navigation">
        <a href="#tier-business">Business</a>
        <a href="#tier-first">First Class</a>
        <a href="#tier-van">Business Van</a>
      </nav>
    </div>
  )
}
