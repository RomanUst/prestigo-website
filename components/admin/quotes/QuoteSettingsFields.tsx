'use client'

import { useId, type CSSProperties, type ReactNode } from 'react'
import { errorStyle, focusRingHandlers, inputBaseStyle, labelStyle } from '@/components/admin/adminFieldStyles'
import { money } from '@/components/admin/paymentShared'
import {
  depositProblem,
  draftTotals,
  parseDeposit,
  sendWarning,
  termsProblems,
  type QuoteDraft,
} from '@/components/admin/quotes/quoteDraft'
import { LOCALE_ENDONYMS, locales } from '@/i18n/locales'
import { DEPOSIT_KINDS, QUOTE_CURRENCIES, REMAINDER_METHODS, type DepositKind, type RemainderMethod } from '@/lib/quotes/vocabulary'

// The quote-level settings of the builder (Phase 92, plan 92-19; QUOTE-03, QUOTE-04; D-02, D-03, D-06, D-07, D-09, D-13):
// language, currency, optional expiry, the deposit (no default, 0 not allowed), the remainder method (must be chosen),
// the cancellation terms (empty = the standard policy) and, for an invoice, the billing details, with a live total /
// deposit / remainder panel from the pure money functions. The server checks everything again on save.
//
// The language options are the entries of `locales` (never a typed list), so a new locale cannot be missed.

interface QuoteSettingsFieldsProps {
  draft: QuoteDraft
  onChange: (patch: Partial<QuoteDraft>) => void
}

const REMAINDER_LABEL: Record<RemainderMethod, { title: string; hint: string }> = {
  saved_card: { title: 'Saved card (hold / capture per trip)', hint: 'The client’s card is held for each trip and charged after it.' },
  payment_link: { title: 'Payment link (paid on the quote page)', hint: 'The client pays the remainder online from the quote page.' },
  cash: { title: 'Cash to the driver', hint: 'The driver collects the remainder; the card on file guarantees it.' },
  invoice: { title: 'Invoice', hint: 'The remainder is invoiced to the billing details below.' },
}

const DEPOSIT_KIND_LABEL: Record<DepositKind, string> = { percent: 'Percent of the total', fixed: 'Fixed amount' }

const cardStyle: CSSProperties = {
  backgroundColor: 'var(--admin-surface)',
  border: '1px solid var(--admin-border)',
  borderRadius: 'var(--admin-radius-lg)',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '12px',
}

const sectionTitleStyle: CSSProperties = { ...labelStyle, color: 'var(--admin-accent-text)', marginBottom: '8px' }

const hintStyle: CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-label)',
  color: 'var(--admin-text-muted)',
  marginTop: '4px',
}

const fieldStyle: CSSProperties = { ...inputBaseStyle, fontWeight: 400 }

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} style={labelStyle}>
        {label}
      </label>
      {children}
    </div>
  )
}

export function QuoteSettingsFields({ draft, onChange }: QuoteSettingsFieldsProps) {
  const uid = useId()
  const id = (name: string) => `${uid}-${name}`

  const totals = draftTotals(draft)
  const depositText = depositProblem(draft)
  const depositParse = parseDeposit(draft.deposit, draft.currency)
  // Nothing chosen yet is a prompt, not an error; a value that is wrong is an error.
  const depositIsPrompt = !depositParse.ok && (depositParse.reason === 'kind' || depositParse.reason === 'empty')
  const terms = termsProblems(draft)
  const warning = sendWarning(draft)
  const currencyLabel = draft.currency.toUpperCase()

  const setBilling = (patch: Partial<QuoteDraft['billing']>) => onChange({ billing: { ...draft.billing, ...patch } })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <section aria-label="Quote settings" style={cardStyle}>
        <div style={sectionTitleStyle}>Language, currency and expiry</div>
        <div style={gridStyle}>
          <Field label="Language" htmlFor={id('locale')}>
            <select id={id('locale')} value={draft.locale} onChange={(e) => onChange({ locale: e.target.value })} style={fieldStyle}>
              {locales.map((locale) => (
                <option key={locale} value={locale}>
                  {LOCALE_ENDONYMS[locale]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Currency" htmlFor={id('currency')}>
            <select
              id={id('currency')}
              value={draft.currency}
              onChange={(e) => onChange({ currency: e.target.value as QuoteDraft['currency'] })}
              style={fieldStyle}
            >
              {QUOTE_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Link valid until (optional)" htmlFor={id('expires')}>
            <input
              id={id('expires')}
              type="date"
              value={draft.expires_at ?? ''}
              onChange={(e) => onChange({ expires_at: e.target.value === '' ? null : e.target.value })}
              {...focusRingHandlers}
              style={fieldStyle}
            />
            <div style={hintStyle}>Empty = the link stays valid until you cancel the quote.</div>
          </Field>
        </div>
      </section>

      <section aria-label="Deposit and totals" style={cardStyle}>
        <div style={sectionTitleStyle}>Deposit</div>
        <div style={gridStyle}>
          <Field label="Deposit type" htmlFor={id('deposit-kind')}>
            <select
              id={id('deposit-kind')}
              value={draft.deposit.kind ?? ''}
              onChange={(e) =>
                onChange({
                  // The value of the other kind means something else (30 percent vs 30.00), so it is cleared.
                  deposit: { kind: e.target.value === '' ? null : (e.target.value as DepositKind), valueInput: '' },
                })
              }
              style={fieldStyle}
            >
              <option value="">Choose…</option>
              {DEPOSIT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {DEPOSIT_KIND_LABEL[kind]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={draft.deposit.kind === 'fixed' ? `Deposit (${currencyLabel})` : draft.deposit.kind === 'percent' ? 'Deposit (%)' : 'Deposit'} htmlFor={id('deposit-value')}>
            <input
              id={id('deposit-value')}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={draft.deposit.valueInput}
              disabled={draft.deposit.kind === null}
              onChange={(e) => onChange({ deposit: { ...draft.deposit, valueInput: e.target.value } })}
              aria-invalid={depositText !== null && !depositIsPrompt}
              {...focusRingHandlers}
              style={fieldStyle}
            />
          </Field>
        </div>
        {depositText && <div style={depositIsPrompt ? hintStyle : errorStyle}>{depositText}</div>}

        <div data-testid="quote-totals" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
          <div>
            <div style={labelStyle}>Total</div>
            <div data-testid="quote-total">{money(totals.totalMinor, draft.currency)}</div>
          </div>
          <div>
            <div style={labelStyle}>Deposit</div>
            <div data-testid="quote-deposit">{totals.depositMinor === null ? '-' : money(totals.depositMinor, draft.currency)}</div>
          </div>
          <div>
            <div style={labelStyle}>Remainder</div>
            <div data-testid="quote-remainder">{totals.remainderMinor === null ? '-' : money(totals.remainderMinor, draft.currency)}</div>
          </div>
        </div>
        {totals.missingAmounts > 0 && (
          <div style={hintStyle}>{`${totals.missingAmounts} trip${totals.missingAmounts === 1 ? '' : 's'} without a valid amount are not in the total.`}</div>
        )}
        {warning && <div style={errorStyle}>{warning}</div>}
      </section>

      <section aria-label="Remainder" style={cardStyle}>
        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend style={sectionTitleStyle}>How the remainder is paid</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {REMAINDER_METHODS.map((method) => (
              <label
                key={method}
                style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', color: 'var(--admin-text)', fontFamily: 'var(--font-montserrat)', fontSize: 'var(--admin-fs-body)' }}
              >
                <input
                  type="radio"
                  name={id('remainder')}
                  value={method}
                  checked={draft.remainder_method === method}
                  onChange={() => onChange({ remainder_method: method })}
                  style={{ marginTop: '4px' }}
                />
                <span>
                  {REMAINDER_LABEL[method].title}
                  <span style={{ ...hintStyle, display: 'block', marginTop: 0 }}>{REMAINDER_LABEL[method].hint}</span>
                </span>
              </label>
            ))}
          </div>
          {draft.remainder_method === null && <div style={hintStyle}>Choose one before saving.</div>}
        </fieldset>

        {draft.remainder_method === 'invoice' && (
          <div data-testid="quote-billing" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={sectionTitleStyle}>Billing details</div>
            <div style={gridStyle}>
              <Field label="Billing name" htmlFor={id('b-name')}>
                <input id={id('b-name')} type="text" maxLength={200} value={draft.billing.name} onChange={(e) => setBilling({ name: e.target.value })} {...focusRingHandlers} style={fieldStyle} />
              </Field>
              <Field label="Billing address" htmlFor={id('b-address')}>
                <input id={id('b-address')} type="text" maxLength={500} value={draft.billing.address} onChange={(e) => setBilling({ address: e.target.value })} {...focusRingHandlers} style={fieldStyle} />
              </Field>
              <Field label="Company ID" htmlFor={id('b-company')}>
                <input id={id('b-company')} type="text" maxLength={40} value={draft.billing.company_id} onChange={(e) => setBilling({ company_id: e.target.value })} {...focusRingHandlers} style={fieldStyle} />
              </Field>
              <Field label="VAT ID" htmlFor={id('b-vat')}>
                <input id={id('b-vat')} type="text" maxLength={40} value={draft.billing.vat_id} onChange={(e) => setBilling({ vat_id: e.target.value })} {...focusRingHandlers} style={fieldStyle} />
              </Field>
              <Field label="Invoice note" htmlFor={id('b-note')}>
                <input id={id('b-note')} type="text" maxLength={300} value={draft.billing.note} onChange={(e) => setBilling({ note: e.target.value })} {...focusRingHandlers} style={fieldStyle} />
              </Field>
            </div>
          </div>
        )}
      </section>

      <section aria-label="Cancellation terms" style={cardStyle}>
        <div style={sectionTitleStyle}>Cancellation terms</div>
        <div style={gridStyle}>
          <Field label="Free cancellation (hours before the first trip)" htmlFor={id('free-hours')}>
            <input
              id={id('free-hours')}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={draft.cancel_free_hours}
              onChange={(e) => onChange({ cancel_free_hours: e.target.value })}
              aria-invalid={terms.hours !== null}
              {...focusRingHandlers}
              style={fieldStyle}
            />
            <div style={hintStyle}>Empty = standard policy. Up to 720 hours (30 days).</div>
            {terms.hours && <div style={errorStyle}>{terms.hours}</div>}
          </Field>
          <Field label="Fee after that (percent of the deposit)" htmlFor={id('fee')}>
            <input
              id={id('fee')}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={draft.cancel_fee_percent}
              onChange={(e) => onChange({ cancel_fee_percent: e.target.value })}
              aria-invalid={terms.fee !== null}
              {...focusRingHandlers}
              style={fieldStyle}
            />
            <div style={hintStyle}>Empty = all of the deposit.</div>
            {terms.fee && <div style={errorStyle}>{terms.fee}</div>}
          </Field>
        </div>
      </section>
    </div>
  )
}
