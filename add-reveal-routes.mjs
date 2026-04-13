/**
 * Applies Reveal scroll-reveal animations to all 30 prague-* route pages.
 * Run: node add-reveal-routes.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const base = path.join(__dirname, 'app/routes')
const dirs = fs.readdirSync(base).filter(d => d.startsWith('prague-')).sort()

let processed = 0, skipped = 0

for (const dir of dirs) {
  const file = path.join(base, dir, 'page.tsx')
  let src = fs.readFileSync(file, 'utf8')

  if (src.includes("import Reveal from '@/components/Reveal'")) {
    console.log(`  skip: ${dir}`)
    skipped++
    continue
  }

  const orig = src

  // ── 1. Import ──────────────────────────────────────────────────────────────
  src = src.replace(
    `import Footer from '@/components/Footer'`,
    `import Footer from '@/components/Footer'\nimport Reveal from '@/components/Reveal'`
  )

  // ── 2. Highlights bar — stagger each highlight tile (line-based) ───────────
  {
    const lines = src.split('\n')
    for (let li = 0; li < lines.length; li++) {
      if (lines[li].includes(`highlights.map((h) => (<div key={h.label}>`)) {
        lines[li] = lines[li].replace(
          `highlights.map((h) => (<div key={h.label}>`,
          `highlights.map((h, i) => (<Reveal key={h.label} variant="up" delay={i * 100}><div>`
        )
        const last = lines[li].lastIndexOf('</div>))}')
        if (last !== -1)
          lines[li] = lines[li].slice(0, last) + '</div></Reveal>))}' + lines[li].slice(last + 9)
        break
      }
    }
    src = lines.join('\n')
  }

  // ── 3. Opening paragraph — wrap content ───────────────────────────────────
  src = src.replace(
    `{/* Opening paragraph */}\n      <section className="bg-anthracite py-16 md:py-20 border-b border-anthracite-light">\n        <div className="max-w-3xl mx-auto px-6 md:px-12">\n          <p className="body-text text-[14px]"`,
    `{/* Opening paragraph */}\n      <section className="bg-anthracite py-16 md:py-20 border-b border-anthracite-light">\n        <div className="max-w-3xl mx-auto px-6 md:px-12">\n          <Reveal variant="up"><p className="body-text text-[14px]"`
  )
  src = src.replace(
    `</p>\n        </div>\n      </section>\n\n      {/* The Route narrative */}`,
    `</p></Reveal>\n        </div>\n      </section>\n\n      {/* The Route narrative */}`
  )

  // ── 4. Route narrative — left + right cols ────────────────────────────────
  src = src.replace(
    `{/* The Route narrative */}\n      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">\n        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">\n          <div>`,
    `{/* The Route narrative */}\n      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">\n        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">\n          <Reveal variant="up"><div>`
  )
  // Close left col Reveal + open right col Reveal (right col always has gap-5 in this section)
  // Unique: Route narrative right col is followed by What's included comment
  src = src.replace(
    `</h2>\n          </div>\n          <div className="flex flex-col gap-5">\n            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>`,
    `</h2>\n          </div></Reveal>\n          <Reveal variant="up" delay={150}><div className="flex flex-col gap-5">\n            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>`
  )
  // Close right col Reveal before section end → unique: What's included follows
  src = src.replace(
    `</div>\n        </div>\n      </section>\n\n      {/* What's included */}`,
    `</div></Reveal>\n        </div>\n      </section>\n\n      {/* What's included */}`
  )

  // ── 5. What's included — left + right ────────────────────────────────────
  src = src.replace(
    `{/* What's included */}\n      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">\n        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">\n          <div>`,
    `{/* What's included */}\n      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">\n        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">\n          <Reveal variant="up"><div>`
  )
  // Right col: unique class "flex flex-col gap-4 justify-center"
  src = src.replace(
    `</div>\n          <div className="flex flex-col gap-4 justify-center">`,
    `</div></Reveal>\n          <Reveal variant="up" delay={150}><div className="flex flex-col gap-4 justify-center">`
  )
  // Close right col: Fleet section follows
  src = src.replace(
    `</div>))}}\n        </div>\n      </section>\n\n      {/* Fleet */}`,
    `</div>))}</Reveal>\n        </div>\n      </section>\n\n      {/* Fleet */}`
  )
  // Alternative close if inclusions.map is on one long line ending differently
  src = src.replace(
    `</div>))}</div>\n        </div>\n      </section>\n\n      {/* Fleet */}`,
    `</div>))}</div></Reveal>\n        </div>\n      </section>\n\n      {/* Fleet */}`
  )
  // Multi-line inclusions.map close (inclusions rendered across multiple lines)
  src = src.replace(
    `            ))}\n          </div>\n        </div>\n      </section>\n\n      {/* Fleet */}`,
    `            ))}\n          </div></Reveal>\n        </div>\n      </section>\n\n      {/* Fleet */}`
  )

  // ── 6. Fleet — header + staggered vehicle cards (line-based) ─────────────
  src = src.replace(
    `<p className="label mb-6">Fleet</p>\n          <h2 className="display text-[28px] md:text-[38px] mb-14">Choose your vehicle</h2>`,
    `<Reveal variant="up"><p className="label mb-6">Fleet</p>\n          <h2 className="display text-[28px] md:text-[38px] mb-14">Choose your vehicle</h2></Reveal>`
  )
  {
    const lines = src.split('\n')
    for (let li = 0; li < lines.length; li++) {
      if (lines[li].includes(`vehicles.map((v) => (<div key={v.name}`)) {
        lines[li] = lines[li].replace(
          `vehicles.map((v) => (<div key={v.name}`,
          `vehicles.map((v, i) => (<Reveal key={v.name} variant="up" delay={i * 120}><div`
        )
        const last = lines[li].lastIndexOf('</div>))}')
        if (last !== -1)
          lines[li] = lines[li].slice(0, last) + '</div></Reveal>))}' + lines[li].slice(last + 9)
        break
      }
    }
    src = lines.join('\n')
  }

  // ── 7. Journey timeline — left + right ───────────────────────────────────
  src = src.replace(
    `{/* Journey timeline + Good to know */}\n      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">\n        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">\n          <div>`,
    `{/* Journey timeline + Good to know */}\n      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">\n        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">\n          <Reveal variant="up"><div>`
  )
  // Right col: unique class "flex flex-col gap-6 justify-start pt-[60px]"
  src = src.replace(
    `</div>\n          <div className="flex flex-col gap-6 justify-start pt-[60px]">`,
    `</div></Reveal>\n          <Reveal variant="up" delay={150}><div className="flex flex-col gap-6 justify-start pt-[60px]">`
  )
  // Close right col: Popular day-trip follows
  src = src.replace(
    `</div>\n        </div>\n      </section>\n\n      {/* Popular day-trip configurations */}`,
    `</div></Reveal>\n        </div>\n      </section>\n\n      {/* Popular day-trip configurations */}`
  )
  // Variant: no day-trip section — chauffeur follows directly
  src = src.replace(
    `</div>\n        </div>\n      </section>\n\n      {/* What to expect from your chauffeur */}`,
    `</div></Reveal>\n        </div>\n      </section>\n\n      {/* What to expect from your chauffeur */}`
  )

  // ── 8. Day-trip configurations — header + staggered cards ────────────────
  src = src.replace(
    `<p className="label mb-6">Day Trips from Prague</p>`,
    `<Reveal variant="up"><p className="label mb-6">Day Trips from Prague</p>`
  )
  // Berlin uses "Trip Configurations" label instead of "Day Trips from Prague"
  src = src.replace(
    `<p className="label mb-6">Trip Configurations</p>`,
    `<Reveal variant="up"><p className="label mb-6">Trip Configurations</p>`
  )
  src = src.replace(
    `</p>\n          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">\n            {dayTripConfigurations.map`,
    `</p></Reveal>\n          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">\n            {dayTripConfigurations.map`
  )
  src = src.replace(
    `dayTripConfigurations.map((c) => (`,
    `dayTripConfigurations.map((c, i) => (`
  )
  src = src.replace(
    `<div key={c.title} className="border border-anthracite-light p-8 flex flex-col gap-4">`,
    `<Reveal key={c.title} variant="up" delay={i * 120}><div className="border border-anthracite-light p-8 flex flex-col gap-4">`
  )
  // Close: unique — followed by the indicative prices footnote
  src = src.replace(
    `            </div>\n            ))}\n          </div>\n          <p className="body-text text-[11px] mt-8 max-w-3xl"`,
    `            </div></Reveal>\n            ))}\n          </div>\n          <p className="body-text text-[11px] mt-8 max-w-3xl"`
  )

  // ── 9. Chauffeur — left + right ───────────────────────────────────────────
  src = src.replace(
    `{/* What to expect from your chauffeur */}\n      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">\n        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">\n          <div>`,
    `{/* What to expect from your chauffeur */}\n      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">\n        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">\n          <Reveal variant="up"><div>`
  )
  // Variant: bg-anthracite-mid chauffeur section (ceske-budejovice, graz, hradec-kralove, etc.)
  src = src.replace(
    `{/* What to expect from your chauffeur */}\n      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">\n        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">\n          <div>`,
    `{/* What to expect from your chauffeur */}\n      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">\n        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">\n          <Reveal variant="up"><div>`
  )
  // Chauffeur right col: "flex flex-col gap-5" — but close with Why Prestigo following
  // The left col in Chauffeur ends with: </h2>\n          </div>\n          <div className="flex flex-col gap-5">
  // But this is the same as Route narrative! Need unique context.
  // Chauffeur section is bg-anthracite, Route narrative is bg-anthracite-mid.
  // So the combo of bg-anthracite + gap-5 right col after Chauffeur label is unique.
  // Actually after the changes we made, Route narrative's left Reveal already closes with </div></Reveal>
  // So in the source at this point, the remaining `<div className="flex flex-col gap-5">`
  // in a bg-anthracite section following Chauffeur's left col is the Chauffeur right col.
  // This is safe to replace now because Route narrative's pattern is already transformed above.
  src = src.replace(
    `</h2>\n          </div>\n          <div className="flex flex-col gap-5">`,
    `</h2>\n          </div></Reveal>\n          <Reveal variant="up" delay={150}><div className="flex flex-col gap-5">`
  )
  // Close chauffeur right — followed by Why book
  src = src.replace(
    `</div>\n        </div>\n      </section>\n\n      {/* Why book with Prestigo */}`,
    `</div></Reveal>\n        </div>\n      </section>\n\n      {/* Why book with Prestigo */}`
  )

  // ── 10. Why book — header + staggered cards ───────────────────────────────
  src = src.replace(
    `<p className="label mb-6">Why Prestigo</p>\n          <h2 className="display text-[28px] md:text-[38px] mb-14 max-w-2xl">`,
    `<Reveal variant="up"><p className="label mb-6">Why Prestigo</p>\n          <h2 className="display text-[28px] md:text-[38px] mb-14 max-w-2xl">`
  )
  src = src.replace(
    `</h2>\n          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">\n            {whyBook.map`,
    `</h2></Reveal>\n          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">\n            {whyBook.map`
  )
  src = src.replace(
    `whyBook.map((w) => (`,
    `whyBook.map((w, i) => (`
  )
  src = src.replace(
    `<div key={w.title} className="border border-anthracite-light p-8 flex flex-col gap-4">`,
    `<Reveal key={w.title} variant="up" delay={i * 120}><div className="border border-anthracite-light p-8 flex flex-col gap-4">`
  )
  // Close: unique — followed by FAQ section
  src = src.replace(
    `            </div>\n            ))}\n          </div>\n        </div>\n      </section>\n\n      {/* FAQ */}`,
    `            </div></Reveal>\n            ))}\n          </div>\n        </div>\n      </section>\n\n      {/* FAQ */}`
  )

  // ── 11. FAQ — header + staggered items (line-based) ──────────────────────
  src = src.replace(
    `<h2 className="display text-[28px] md:text-[34px] mb-12">Frequently asked questions</h2>`,
    `<Reveal variant="up"><h2 className="display text-[28px] md:text-[34px] mb-12">Frequently asked questions</h2></Reveal>`
  )
  {
    const lines = src.split('\n')
    for (let li = 0; li < lines.length; li++) {
      if (lines[li].includes(`faqs.map((faq, i) => (<div key={faq.q}`)) {
        lines[li] = lines[li].replace(
          `faqs.map((faq, i) => (<div key={faq.q}`,
          `faqs.map((faq, i) => (<Reveal key={faq.q} variant="up" delay={i * 70}><div`
        )
        // Close: the map ends with </div>))}</div> on this line
        const last = lines[li].lastIndexOf('</div>))}')
        if (last !== -1)
          lines[li] = lines[li].slice(0, last) + '</div></Reveal>))}' + lines[li].slice(last + 9)
        break
      }
    }
    src = lines.join('\n')
  }

  // ── 12. Related routes — header + staggered links ────────────────────────
  src = src.replace(
    `<p className="label mb-6">Related Routes</p>`,
    `<Reveal variant="up"><p className="label mb-6">Related Routes</p>`
  )
  src = src.replace(
    `</p>\n          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">\n            {relatedRoutes.map`,
    `</p></Reveal>\n          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">\n            {relatedRoutes.map`
  )
  src = src.replace(
    `relatedRoutes.map((r) => (`,
    `relatedRoutes.map((r, i) => (`
  )
  src = src.replace(
    `<a key={r.slug} href={`,
    `<Reveal key={r.slug} variant="up" delay={i * 100}><a href={`
  )
  // Close relatedRoutes links — unique: followed by Final CTA
  src = src.replace(
    `              </a>\n            ))}\n          </div>\n        </div>\n      </section>\n\n      {/* Final CTA */}`,
    `              </a></Reveal>\n            ))}\n          </div>\n        </div>\n      </section>\n\n      {/* Final CTA */}`
  )
  // Variant: followed by {/* CTA */} (karlovy-vary, kutna-hora)
  src = src.replace(
    `              </a>\n            ))}\n          </div>\n        </div>\n      </section>\n\n      {/* CTA */}`,
    `              </a></Reveal>\n            ))}\n          </div>\n        </div>\n      </section>\n\n      {/* CTA */}`
  )

  // ── 13. Final CTA — left content + right buttons ─────────────────────────
  src = src.replace(
    `{/* Final CTA */}\n      <section className="bg-anthracite py-20 border-t border-anthracite-light">\n        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">\n          <div>`,
    `{/* Final CTA */}\n      <section className="bg-anthracite py-20 border-t border-anthracite-light">\n        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">\n          <Reveal variant="up"><div>`
  )
  // Variant: {/* CTA */} comment (karlovy-vary, kutna-hora)
  src = src.replace(
    `{/* CTA */}\n      <section className="bg-anthracite py-20 border-t border-anthracite-light">\n        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">\n          <div>`,
    `{/* CTA */}\n      <section className="bg-anthracite py-20 border-t border-anthracite-light">\n        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">\n          <Reveal variant="up"><div>`
  )
  // Single-line buttons close (most pages)
  src = src.replace(
    `</div>\n          <div className="flex flex-col sm:flex-row gap-4"><a href="/book" className="btn-primary">Book Now</a><a href="/routes" className="btn-ghost">All Routes</a></div>`,
    `</div></Reveal>\n          <Reveal variant="fade" delay={150}><div className="flex flex-col sm:flex-row gap-4"><a href="/book" className="btn-primary">Book Now</a><a href="/routes" className="btn-ghost">All Routes</a></div></Reveal>`
  )
  // Multi-line buttons close (karlovy-vary, kutna-hora)
  src = src.replace(
    `</div>\n          <div className="flex flex-col sm:flex-row gap-4">\n            <a href="/book" className="btn-primary">Book Now</a>\n            <a href="/routes" className="btn-ghost">All Routes</a>\n          </div>`,
    `</div></Reveal>\n          <Reveal variant="fade" delay={150}><div className="flex flex-col sm:flex-row gap-4">\n            <a href="/book" className="btn-primary">Book Now</a>\n            <a href="/routes" className="btn-ghost">All Routes</a>\n          </div></Reveal>`
  )

  if (src === orig) {
    console.log(`  WARN: no changes for ${dir}`)
  } else {
    fs.writeFileSync(file, src, 'utf8')
    console.log(`  done: ${dir}`)
    processed++
  }
}

console.log(`\nDone. Processed: ${processed}, Skipped: ${skipped}`)
