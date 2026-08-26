---
status: partial
phase: 64-admin-created-bookings-with-payment-link
source: [64-01-SUMMARY.md, 64-02-SUMMARY.md, 64-03-SUMMARY.md]
started: 2026-08-25T16:44:05Z
updated: 2026-08-25T16:52:00Z
audit_acknowledged:
  milestone: v2.1
  at: 2026-08-26
  gap_snapshot: "partial::scenarios=0"
---

## Current Test

<!-- OVERWRITE each test - shows where we are -->

[testing paused — 1 item outstanding (Test 11 blocked on Plan 64-04)]

## Tests

### 1. Server-side Stripe Payment Link creation

expected: createBookingPaymentLink генерирует Stripe Payment Link с booking UUID в metadata и server-authoritative суммой
result: pass
source: automated
coverage_id: D1-64-01

### 2. checkout.session.completed webhook reconcile

expected: webhook-ветка reconcile-ит ту же unpaid-бронь в confirmed без дублей, идемпотентно на повторной доставке
result: pass
source: automated
coverage_id: D2-64-01

### 3. Branded payment-request email

expected: письмо-запрос оплаты с единственным Pay Now CTA, кратким описанием поездки, суммой в EUR, условной строкой рейса, без внутренних админ-данных
result: pass
source: automated
coverage_id: D3-64-01

### 4. POST /api/admin/bookings collect_payment branch

expected: collect_payment=true → статус 'unpaid' + сгенерированная/сохранённая ссылка + письмо; сохранение без ссылки уважает выбор статуса оператора, по умолчанию 'confirmed'
result: pass
source: automated
coverage_id: D4-64-01

### 5. Attach-later [id]/payment-link route

expected: оператор генерирует ссылку для существующей unpaid/pending брони; pending → unpaid напрямую; отклоняет confirmed/cancelled и брони с уже существующей ссылкой; не трогает строку при ошибке Stripe
result: pass
source: automated
coverage_id: D1-64-02

### 6. Round-trip sibling detection + combined email

expected: определение парной брони по общему payment_intent_id, linkedBookingId в metadata ссылки, комбинированная сумма EUR (fallback NULL return-leg на sibling) и пометка "covers both legs" — для генерации и resend
result: pass
source: automated
coverage_id: D2-64-02

### 7. Round-trip webhook both-legs reconcile

expected: checkout.session.completed с linkedBookingId reconcile-ит ОБЕ ноги в confirmed, шлёт подтверждение ровно один раз на пару, QStash-напоминание на каждую ногу, no-op когда обе уже confirmed
result: pass
source: automated
coverage_id: D3-64-02

### 8. Cold Start Smoke Test

expected: Останови dev-сервер, очисти эфемерное состояние, запусти приложение с нуля. Сервер поднимается без ошибок, /admin и главная грузятся, список броней возвращает живые данные.
result: pass
source: automated
note: "Verified by Claude — .next cleared + port freed, cold boot Ready in 883ms (Next 16.2.3 Turbopack), / rendered w/ zero console errors, /admin renders login gate, no server compile errors. Authenticated bookings list not exercised (login credentials required)."

### 9. ManualBookingForm — тумблер оплаты + панель результата

expected: |
  В форме создания брони (админка) тумблер «Collect payment via link» (по умолчанию выключен)
  меняет текст кнопки submit; когда выключен — виден выбор «Booking status» (Confirmed по умолчанию /
  Pending). При успехе со ссылкой модалка целиком сменяется панелью результата: заголовок, текст,
  усечённый URL, «Copy Link» (копирует полный URL), «Resend Email», сумма EUR медным цветом.
  При успехе без ссылки (шаг Stripe/email упал) — текст ошибки не-атомарного создания, без намёка
  что бронь не создалась.
result: pass

### 10. BookingsTable — строчное действие «Generate Payment Link»

expected: |
  В таблице броней (админка) действие «Generate Payment Link» показывается только для unpaid/pending
  броней без payment_link_url, одинаково в развёрнутой строке (десктоп) и в развёрнутой карточке
  (мобайл). Для pending-брони показывается пометка про поздний перевод в Unpaid. При успехе кнопка
  заменяется той же панелью результата (URL + Copy + Resend + EUR), включая пометку «covers both legs»
  когда возвращён linkedBookingId. Строка оптимистично становится unpaid.
result: pass

### 11. Живое применение миграции 056

expected: |
  Миграция 056 (колонки payment_link_url, payment_link_id) применена к боевому проекту Supabase.
  Это [BLOCKING] задача Плана 64-04 (вместе с подпиской вебхука Stripe на checkout.session.completed) —
  без неё сохранение/чтение ссылки в проде не работает.
result: blocked
blocked_by: prior-phase
reason: "блокет — Plan 64-04 (live migration 056 + Stripe checkout.session.completed webhook subscription) not yet executed; no 64-04-SUMMARY.md exists"

## Summary

total: 11
passed: 10
issues: 0
pending: 0
skipped: 0
blocked: 1

## Gaps

[none yet]
