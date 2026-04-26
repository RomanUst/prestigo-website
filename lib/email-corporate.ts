/**
 * Corporate contact email template module.
 *
 * Provides buildCorporateOperatorHtml() and buildCorporateClientAckHtml() for
 * rendering dark-theme corporate enquiry emails, and sendCorporateContactEmails()
 * for dispatching operator copy + client acknowledgement via Resend.
 *
 * No DB calls — this module is purely email/template concerned.
 */
import { Resend } from 'resend'

// ── Types ─────────────────────────────────────────────────────────────────────

export type CorporateContactPayload = {
  company: string
  name: string
  email: string
  trips: string | null
  notes: string | null
  source: 'corporate'
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

// ── Templates ─────────────────────────────────────────────────────────────────

/**
 * Build operator email HTML for a corporate account enquiry.
 * XSS-safe: all user strings are escaped before insertion.
 */
export function buildCorporateOperatorHtml(p: CorporateContactPayload): string {
  const safeCompany = escapeHtml(p.company)
  const safeName = escapeHtml(p.name)
  const safeEmail = escapeHtml(p.email)
  const safeTrips = p.trips ? escapeHtml(p.trips) : '—'
  const safeNotes = p.notes ? escapeHtml(p.notes) : '—'

  const metaRows = `
    <tr>
      <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9A958F;border-top:1px solid #3A3A3F">
        Company
      </td>
      <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9A958F;border-top:1px solid #3A3A3F;text-align:right">
        ${safeCompany}
      </td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9A958F;border-top:1px solid #3A3A3F">
        Contact
      </td>
      <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9A958F;border-top:1px solid #3A3A3F;text-align:right">
        ${safeName}
      </td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9A958F;border-top:1px solid #3A3A3F">
        Email
      </td>
      <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9A958F;border-top:1px solid #3A3A3F;text-align:right">
        <a href="mailto:${safeEmail}" style="color:#B87333;text-decoration:none">${safeEmail}</a>
      </td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9A958F;border-top:1px solid #3A3A3F">
        Estimated monthly trips
      </td>
      <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9A958F;border-top:1px solid #3A3A3F;text-align:right">
        ${safeTrips}
      </td>
    </tr>
  `

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Corporate Account Enquiry</title>
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
                Corporate Account Enquiry
              </h1>

              <!-- Meta rows -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
                ${metaRows}
              </table>

              <!-- Notes block -->
              <div style="margin-bottom:24px">
                <p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9A958F;text-transform:uppercase;letter-spacing:0.1em">
                  Notes
                </p>
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#9A958F;background:#1C1C1E;padding:12px;border-radius:2px;white-space:pre-wrap;line-height:1.6">
                  ${safeNotes}
                </div>
              </div>

              <!-- Reply link -->
              <div style="margin-bottom:24px">
                <a href="mailto:${safeEmail}"
                   style="display:inline-block;background:transparent;border:1px solid #B87333;color:#F5F2EE;padding:14px 32px;font-size:11px;letter-spacing:0.35em;text-transform:uppercase;text-decoration:none;font-family:Arial,Helvetica,sans-serif">
                  REPLY TO CLIENT &rarr;
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

/**
 * Build client acknowledgement HTML for a corporate account enquiry.
 * Does NOT echo notes verbatim.
 */
export function buildCorporateClientAckHtml(p: CorporateContactPayload): string {
  const safeCompany = escapeHtml(p.company)
  const safeName = escapeHtml(p.name)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your enquiry is received</title>
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
                Your enquiry is received
              </h1>

              <!-- Body -->
              <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#9A958F;line-height:1.6;margin:0 0 16px 0">
                Dear ${safeName},
              </p>
              <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#9A958F;line-height:1.6;margin:0 0 16px 0">
                Thank you for reaching out to PRESTIGO regarding a corporate account for <strong style="color:#F5F2EE">${safeCompany}</strong>. We have received your enquiry and our team will respond within 24 hours with next steps for setting up your account.
              </p>
              <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#9A958F;line-height:1.6;margin:0 0 16px 0">
                Most corporate accounts are live and taking bookings within 48 hours of the initial enquiry.
              </p>

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
 * Send corporate enquiry emails: client acknowledgement + operator copy.
 * Errors propagate — caller decides whether to await/log.
 */
export async function sendCorporateContactEmails(p: CorporateContactPayload): Promise<void> {
  const clientSubject = `Your Prestigo corporate enquiry — we'll respond within 24 hours`
  const operatorSubject = `[CORPORATE] Corporate enquiry from ${escapeHtml(p.company)}`

  const clientHtml = buildCorporateClientAckHtml(p)
  const operatorHtml = buildCorporateOperatorHtml(p)

  await getResend().emails.send({
    from: 'Prestigo <bookings@rideprestigo.com>',
    to: p.email,
    subject: clientSubject,
    html: clientHtml,
  })

  await getResend().emails.send({
    from: 'Prestigo <bookings@rideprestigo.com>',
    to: process.env.MANAGER_EMAIL ?? 'ustyugov.roman@gmail.com',
    subject: operatorSubject,
    html: operatorHtml,
  })
}
