type Props = { hourlyRate: Record<string, number> }

export default function HourlyDailyStrip({ hourlyRate }: Props) {
  const rows = [
    { label: 'Business', veh: 'Mercedes E-Class', price: hourlyRate['business'] },
    { label: 'First Class', veh: 'Mercedes S-Class', price: hourlyRate['first_class'] },
    { label: 'Business Van', veh: 'Mercedes V-Class', price: hourlyRate['business_van'] },
  ]
  return (
    <section className="hourly-strip">
      <h2 className="hourly-strip-title">Hourly hire in Prague</h2>
      <ul className="hourly-strip-rows">
        {rows.map(r => (
          <li key={r.label} className="hourly-strip-row">
            <span className="hourly-strip-label">{r.label}</span>
            <span className="hourly-strip-veh">{r.veh}</span>
            <span className="hourly-strip-price">€{r.price}/h</span>
          </li>
        ))}
      </ul>
      <a href="/book?type=hourly" className="hourly-strip-cta">Configure your hourly trip</a>
    </section>
  )
}
