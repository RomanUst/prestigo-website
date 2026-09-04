/**
 * renderWithIntl.tsx — shared test render helper (Phase 69, 69-01 Task 2).
 *
 * Wraps a component under test in NextIntlClientProvider so useTranslations
 * calls resolve during vitest (Pitfall 2: components no longer render without
 * a next-intl context once they call useTranslations/t()). Defaults to the
 * 'en' locale + messages/en.json — matches the EN-byte-identical assertions
 * every existing test suite makes. Pass `locale`/`messages` to exercise a
 * different locale (e.g. locale-prefix retention checks).
 *
 * Later component test plans (70+) reuse this helper rather than each
 * hand-rolling their own NextIntlClientProvider wrapper.
 */
import type { ReactElement } from 'react'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { render, type RenderOptions } from '@testing-library/react'
import enMessages from '@/messages/en.json'

export { screen, fireEvent, within } from '@testing-library/react'

interface RenderWithIntlOptions extends Omit<RenderOptions, 'wrapper'> {
  locale?: string
  messages?: AbstractIntlMessages
}

export function renderWithIntl(
  ui: ReactElement,
  {
    locale = 'en',
    messages = enMessages as unknown as AbstractIntlMessages,
    ...options
  }: RenderWithIntlOptions = {}
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    ),
    ...options,
  })
}
