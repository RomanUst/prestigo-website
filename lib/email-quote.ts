/**
 * Email quote template module.
 *
 * Provides buildQuoteHtml() for rendering a fare summary email,
 * and sendQuoteEmail() for dispatching client + operator copies via Resend.
 *
 * No DB calls — this module is purely email/template concerned.
 */
import { Resend } from 'resend'

// ── Types ─────────────────────────────────────────────────────────────────────

export type QuotePayload = {
  from: string
  to: string
  serviceType: 'transfer' | 'hourly' | 'daily'
  date: string | null
  time: string | null
  vehicleClass: 'business' | 'first_class' | 'business_van'
  passengers: number
  price: number
  routeSlug: string | null
  distanceKm: number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Escape user-supplied strings before embedding in HTML */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildBookHref(q: QuotePayload): string {
  return (
    `https://rideprestigo.com/book` +
    `?type=${encodeURIComponent(q.serviceType)}` +
    `&from=${encodeURIComponent(q.from)}` +
    `&to=${encodeURIComponent(q.to)}` +
    `&date=${encodeURIComponent(q.date ?? '')}` +
    `&class=${encodeURIComponent(q.vehicleClass)}`
  )
}

function formatVehicleClass(vc: QuotePayload['vehicleClass']): string {
  if (vc === 'first_class') return 'First Class'
  if (vc === 'business_van') return 'Business Van'
  return 'Business'
}

function formatServiceType(st: QuotePayload['serviceType']): string {
  if (st === 'hourly') return 'Hourly hire'
  if (st === 'daily') return 'Daily hire'
  return 'Transfer'
}

// ── Template ──────────────────────────────────────────────────────────────────

/**
 * Build a full HTML email document for a quote fare summary.
 * XSS-safe: from, to, routeSlug are escaped before insertion.
 */
export function buildQuoteHtml(q: QuotePayload): string {
  const safeFrom = escapeHtml(q.from)
  const safeTo = escapeHtml(q.to)
  const bookHref = buildBookHref(q)

  const metaRows: string[] = [
    `<tr>
       <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9A958F;border-top:1px solid #3A3A3F">
         Vehicle
       </td>
       <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9A958F;border-top:1px solid #3A3A3F;text-align:right">
         ${formatVehicleClass(q.vehicleClass)}
       </td>
     </tr>`,
    `<tr>
       <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9A958F;border-top:1px solid #3A3A3F">
         Service
       </td>
       <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9A958F;border-top:1px solid #3A3A3F;text-align:right">
         ${formatServiceType(q.serviceType)}
       </td>
     </tr>`,
  ]

  if (q.date) {
    metaRows.push(`<tr>
       <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9A958F;border-top:1px solid #3A3A3F">
         Date
       </td>
       <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9A958F;border-top:1px solid #3A3A3F;text-align:right">
         ${escapeHtml(q.date)}
       </td>
     </tr>`)
  }

  if (q.time) {
    metaRows.push(`<tr>
       <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9A958F;border-top:1px solid #3A3A3F">
         Time
       </td>
       <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9A958F;border-top:1px solid #3A3A3F;text-align:right">
         ${escapeHtml(q.time)}
       </td>
     </tr>`)
  }

  metaRows.push(`<tr>
       <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9A958F;border-top:1px solid #3A3A3F">
         Passengers
       </td>
       <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9A958F;border-top:1px solid #3A3A3F;text-align:right">
         ${q.passengers}
       </td>
     </tr>`)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Prestigo fare</title>
</head>
<body style="margin:0;padding:0;background:#1C1C1E;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1C1C1E;padding:32px 16px">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#2A2A2D;border-radius:4px;padding:24px">
          <tr>
            <td>
              <!-- Header -->
              <p style="margin:0 0 8px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:14px;color:#9A958F;letter-spacing:0.15em;text-transform:uppercase">
                PRESTIGO
              </p>
              <h1 style="margin:0 0 24px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;color:#B87333;font-weight:300;line-height:1.1">
                Your Prestigo fare
              </h1>

              <!-- Fare figure -->
              <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;color:#B87333;font-weight:300;margin-bottom:8px">
                €${q.price}
              </div>

              <!-- Route line -->
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#9A958F;margin-bottom:24px">
                ${safeFrom} &rarr; ${safeTo}
              </div>

              <!-- Meta rows -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
                ${metaRows.join('\n')}
              </table>

              <!-- CTA button -->
              <div style="margin-bottom:24px">
                <a href="${bookHref}"
                   style="display:inline-block;background:transparent;border:1px solid #B87333;color:#F5F2EE;padding:14px 32px;font-size:11px;letter-spacing:0.35em;text-transform:uppercase;text-decoration:none;font-family:Arial,Helvetica,sans-serif">
                  CONTINUE BOOKING &rarr;
                </a>
              </div>

              <!-- Footer -->
              <p style="color:#9A958F;font-size:12px;font-family:Arial,Helvetica,sans-serif;margin:0">
                Prestigo &mdash; Premium Transfers &middot; bookings@rideprestigo.com
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ── Resend lazy init ───────────────────────────────────────────────────────────

let _resend: Resend | null = null

function getResend(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is not configured')
    }
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

// ── Send ──────────────────────────────────────────────────────────────────────

/**
 * Send a quote fare summary email to the client and an operator copy.
 * Errors propagate — caller decides whether to await/log.
 */
export async function sendQuoteEmail({
  email,
  quote,
}: {
  email: string
  quote: QuotePayload
}): Promise<void> {
  const html = buildQuoteHtml(quote)
  const subject = `Your Prestigo fare: €${quote.price} — ${quote.from} → ${quote.to}`

  await getResend().emails.send({
    from: 'Prestigo <bookings@rideprestigo.com>',
    to: email,
    subject,
    html,
  })

  await getResend().emails.send({
    from: 'Prestigo <bookings@rideprestigo.com>',
    to: 'ustyugov.roman@gmail.com',
    subject: `[QUOTE LEAD] ${subject}`,
    html,
  })
}
