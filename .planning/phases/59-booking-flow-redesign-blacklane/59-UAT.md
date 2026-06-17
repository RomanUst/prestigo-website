---
status: testing
phase: 59-booking-flow-redesign-blacklane
source: [59-VERIFICATION.md]
started: 2026-06-17T17:00:00Z
updated: 2026-06-17T17:00:00Z
---

## Current Test

number: 7
name: VehicleSlideshow — auto-play и hover-pause
expected: |
  Слайдшоу автоматически переключается между интерьерными фото каждые 4 сек. При наведении мыши пауза. Кнопки Prev/Next работают.
awaiting: user response

## Tests

### 1. EntryBar — полный flow в браузере
expected: EntryBar рендерится на шаге 1: поля From/To/Date/Time, табы Transfer/Hourly, чекбокс "Add return", кнопка CTA "Посмотреть варианты". Клик по CTA переводит на шаг 2.
result: pass

### 2. Условное поле Flight Number (аэропорт)
expected: При выборе аэропорта (PRG / любой аэропорт через Google Places) появляется поле "Flight number". При выборе не-аэропорта поле скрыто.
result: pass

### 3. Двухколоночный layout шага 2 + Google Maps
expected: На шаге 2 (Vehicle Selection) на десктопе: слева карточки класса + VehicleSlideshow, справа StickyBookingPanel с картой маршрута. На мобиле — одна колонка без карты. Карта рисует маршрут с анимированной точкой.
result: pass

### 4. Аналитика begin_checkout + InitiateCheckout
expected: При клике "SELECT [CLASS]" в StickyBookingPanel в Network/консоли браузера видно: gtag begin_checkout (GA4) + Meta Pixel InitiateCheckout.
result: pass (GA4 begin_checkout подтверждён в dataLayer; Meta fbq не загружается в dev без consent — в prod сработает)

### 5. Auth-шаг после выбора машины
expected: После нажатия SELECT на шаге 2 открывается шаг 3 «Sign in to continue» с формой входа (OTP-код / пароль / Google / Apple / Create account), кнопкой «← Back to vehicle selection» в стиле OAuth-кнопок.
result: pass

### 6. Качество placeholder-изображений + горизонтальные карточки
expected: Изображения отображаются корректно, карточки горизонтальные (фото справа, инфо слева).
result: pass

### 7. VehicleSlideshow — auto-play и hover-pause
expected: Слайдшоу автоматически переключается между интерьерными фото каждые 4 сек. При наведении мыши автопереключение паузируется. Кнопки Prev/Next работают.
result: [pending]

## Summary

total: 7
passed: 6
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
