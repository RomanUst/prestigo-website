---
status: testing
phase: 59-booking-flow-redesign-blacklane
source: [59-VERIFICATION.md]
started: 2026-06-17T17:00:00Z
updated: 2026-06-17T17:00:00Z
---

## Current Test

number: 1
name: EntryBar — полный flow в браузере
expected: |
  EntryBar рендерится на шаге 1: поля From/To/Date/Time, табы Transfer/Hourly, чекбокс "Add return", кнопка CTA. Клик по CTA переводит на шаг 2 (Vehicle Selection). Переход назад сохраняет данные (кроме flightNumber — known CR-03).
awaiting: user response

## Tests

### 1. EntryBar — полный flow в браузере
expected: EntryBar рендерится на шаге 1: поля From/To/Date/Time, табы Transfer/Hourly, чекбокс "Add return", кнопка CTA "Посмотреть варианты". Клик по CTA переводит на шаг 2.
result: [pending]

### 2. Условное поле Flight Number (аэропорт)
expected: При выборе аэропорта (PRG / любой аэропорт через Google Places) появляется поле "Flight number". При выборе не-аэропорта поле скрыто.
result: [pending]

### 3. Двухколоночный layout шага 2 + Google Maps
expected: На шаге 2 (Vehicle Selection) на десктопе: слева карточки класса + VehicleSlideshow, справа StickyBookingPanel с картой маршрута. На мобиле — одна колонка без карты. Карта рисует маршрут с анимированной точкой.
result: [pending]

### 4. Аналитика begin_checkout + InitiateCheckout
expected: При клике "SELECT [CLASS]" в StickyBookingPanel в Network/консоли браузера видно: gtag begin_checkout (GA4) + Meta Pixel InitiateCheckout.
result: [pending]

### 5. Качество placeholder-изображений
expected: Изображения из Wikimedia Commons отображаются корректно (не broken), соответствуют классу авто. Будут заменены Higgsfield AI после предоставления API key.
result: [pending]

### 6. VehicleSlideshow — auto-play и hover-pause
expected: Слайдшоу автоматически переключается между интерьерными фото каждые 4 сек. При наведении мыши автопереключение паузируется. Кнопки Prev/Next работают.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
