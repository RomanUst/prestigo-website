# Phase 59: Discussion Log

**Date:** 2026-06-17
**Method:** Interactive discuss-phase with AskUserQuestion
**Outcome:** All 5 gray areas fully resolved → CONTEXT.md written

---

## Areas Discussed

### 1. Entry bar — structure

**Q1:** Single screen or multi-step?
**A:** Один экран: From / To / Date / Time одновременно

**Q2:** Trip type selection UI?
**A:** Табы Transfer / Hourly над баром

**Q3:** Round trip?
**A:** Чекбокс "Add return" под баром (expands return date/time field)

**Q4:** What does the entry bar replace?
**A:** Заменяет Step1+Step2, остальные шаги остаются

**CTA:** Не "Продолжить", а "Посмотреть варианты"

---

### 2. Time-slot picker (BOOK-02)

**Q1:** Granularity and format?
**A:** 15 минут и добавить am или pm

**Q2:** Airport transfer — flight number field?
**A:** Тайм-слот остаётся, появляется дополнительное поле флайта (BOOK-03)

---

### 3. Route map (BOOK-04)

**Q1:** Map implementation?
**A:** Google Maps с маршрутом, чтобы по маршруту двигалась точка

**Q2:** Animation trigger?
**A:** Анимация воспроизводит поездку автоматически (auto-starts on Step3 load)

**Q3:** Layout?
**A:** Стики боковое меню

**Q4:** Panel placement?
**A:** Справа — карта sticky, слева — карточки (Blacklane layout)

**Q5:** Mobile?
**A:** Карта скрыта на мобайле

---

### 4. Vehicle card tabs / "What's included"

**Q1:** Per-class or uniform?
**A:** Для всех всё одинаково. При переключении классов снизу меняются картинки (багаж + салон)

**Q2:** "What's included" placement?
**A:** Отдельный блок ниже (not inline in card)

**Q3:** Included amenities (multiselect)?
**A:** Фиксированная цена, зарядка для телефонов, 60 минут бесплатного ожидания, Wi-Fi, Вода на борту, Meet & greet (airport)

---

### 5. Vehicle card images (BOOK-05, D-17)

**Q1:** Exterior photo style?
**A:** При выборе класса только внешне. В дополнительном блоке — фотографии интерьера и вместимость багажа, несколько слайдов (Higgsfield AI, максимально реалистичные). Расположение как на сайте Мерседес при конфигурации.

**Q2:** Background?
**A:** Без городского фона. Карточки информативные, без отвлекающих деталей.

---

### 6. Scope gate (post-discussion)

**User suggestion:** After Step3 → auth screen → passenger/payment (unified step 4)

**Resolution:** These are BOOK-06/07/08 = Phase 60. User confirmed:
**"Да, Phase 59 = entry bar + vehicle step только"**

---

### 7. Right sticky panel clarification (after Blacklane screenshot)

**Q:** Panel contents?
**A:** Карта + резюме заказа + CTA — без auth-выбора

---

## Decisions Summary

| ID | Decision |
|----|----------|
| D-01 | Single-screen entry bar: From / To / Date / Time simultaneously |
| D-02 | Trip type via tabs (Transfer / Hourly) above bar |
| D-03 | Round trip via "Add return" checkbox below bar |
| D-04 | CTA = "Посмотреть варианты" |
| D-05 | No pax field in entry bar |
| D-06 | Airport route → inline flight number field appears (time-slot stays) |
| D-07 | 15-min slots, AM/PM display |
| D-08 | Store as 24h HH:MM internally |
| D-09 | Left: cards. Right sticky: map + summary + CTA |
| D-10 | Mobile: map hidden, full-width cards |
| D-11 | Google Maps JS SDK, animated dot auto-starts on Step3 load |
| D-12 | Map labels: pickup time + drop-off time |
| D-13 | Reuse existing Google Maps API key |
| D-14 | Exterior: Higgsfield AI, studio/neutral background (no city) |
| D-15 | Below cards: animated slideshow (interior + luggage), Higgsfield AI |
| D-16 | "What's included": fixed price, charging, 60-min wait, Wi-Fi, water, meet & greet |
| D-17 | Image generation is a Phase 59 sub-task; committed to /public/vehicles/ first |
| D-18 | Zustand store shape unchanged; analytics events preserved |
| D-19 | Analytics fire at equivalent logical moments in rebuilt flow |

---

*Discuss-phase completed: 2026-06-17*
