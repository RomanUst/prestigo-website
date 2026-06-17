---
phase: 59
status: issues-found
critical: 3
warning: 5
info: 3
reviewed_files: 11
files_reviewed_list:
  - components/booking/EntryBar.tsx
  - components/booking/RouteMap.tsx
  - components/booking/StickyBookingPanel.tsx
  - components/booking/VehicleSlideshow.tsx
  - components/booking/VehicleCard.tsx
  - components/booking/steps/Step3Vehicle.tsx
  - components/booking/BookingWizard.tsx
  - components/booking/ProgressBar.tsx
  - components/booking/TripTypeTabs.tsx
  - lib/booking-store.ts
  - types/booking.ts
---

# Phase 59: Code Review Report

**Reviewed:** 2026-06-17T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues-found

## Summary

Phase 59 вносит Blacklane-стиль переработки booking-флоу: новый EntryBar, RouteMap с анимацией, StickyBookingPanel, VehicleSlideshow, обновлённый VehicleCard и переработанный Step3Vehicle. Архитектура в целом разумная, Zustand-паттерны соблюдены, но есть три критических дефекта: двойной вызов `InfoWindow.open()` (утечка объекта + потенциальное дрожание карты), некорректный формат `dataLayer.push` с массивом (сломан сбор данных GTM во всех новых компонентах), и потеря номера рейса при навигации «Назад». Плюс несколько warning-уровня проблем.

---

## Critical Issues

### CR-01: Двойной `InfoWindow.open()` создаёт лишний Marker и открывает окно дважды

**File:** `components/booking/RouteMap.tsx:228–238`

**Issue:** На строке 231 `pickupInfoWindow.open()` вызывается с временным `new google.maps.Marker({ map: null })` — это создаёт висящий (dangling) объект маркера, которому не присваивается переменная, и открывает InfoWindow на этом нулевом якоре. На строке 238 то же окно открывается повторно на правильном якоре. Первый вызов бесполезен, порождает orphan-объект в куче Google Maps и может вызвать кратковременный показ окна в неверной позиции (если Maps обрабатывает их асинхронно). Это типичная ошибка «код раскомментировали частично».

**Fix:**
```tsx
// Удалить строку 231 целиком:
// pickupInfoWindow.open(map, new google.maps.Marker({ position: originLatLng, map: null }))

// Оставить только:
const pickupAnchor = new google.maps.Marker({ position: originLatLng, map, visible: false })
pickupInfoWindow.open(map, pickupAnchor)
```

---

### CR-02: Некорректный формат `dataLayer.push` с массивом во всех новых аналитических компонентах

**File:** `components/booking/EntryBar.tsx:71`, `components/booking/StickyBookingPanel.tsx:30`, `components/booking/steps/Step3Vehicle.tsx:48`, `components/booking/BookingWizard.tsx:117`

**Issue:** В `else`-ветке (когда `gtag` недоступен, т.е. при использовании GTM) происходят два push:
```js
w.dataLayer.push(['event', 'form_start', { ... }])   // НЕВЕРНО
w.dataLayer.push({ event: 'form_start', ... })        // верно
```
GTM DataLayer принимает исключительно plain-объекты. Пуш массива `['event', 'form_start', {...}]` приведёт к тому, что GTM интерпретирует его как объект с числовыми ключами `{0: 'event', 1: 'form_start', 2: {...}}` — ни одно правило GTM не сработает. Это полностью ломает аналитику в prod-среде, где обычно используется GTM (не прямой gtag.js). Затронуты события: `form_start`, `checkout_progress`, `select_item`, и все события из `pushGA4Event`/`push` хелперов.

**Fix:** Удалить строку с array-пушем в каждом из четырёх файлов. Оставить только object-форму:
```ts
// Убрать во всех четырёх файлах:
w.dataLayer.push(['event', eventName, params])  // <-- УДАЛИТЬ эту строку

// Оставить только:
w.dataLayer.push({ event: eventName, ...params })
```

---

### CR-03: Номер рейса теряется при навигации «Назад» из Step 2 → Step 1

**File:** `components/booking/EntryBar.tsx:53,99–105`

**Issue:** `flightNumber` хранится в локальном состоянии `useState('')` компонента EntryBar. В `BookingWizard.tsx` контейнер шагов использует `key={currentStep}` (строка 306), что размонтирует EntryBar при переходе на шаг 2. Когда пользователь возвращается на шаг 1 (`prevStep`), EntryBar монтируется заново с `flightNumber = ''`. При повторном нажатии «Посмотреть варианты» условие `flightNumber.trim()` ложно — номер рейса не сохраняется в `passengerDetails`. Итог: пассажир вводит рейс, передумывает на шаге 2, возвращается и продолжает — номер рейса молча теряется.

**Fix:** Инициализировать `flightNumber` из store при монтировании и/или очищать `passengerDetails.flightNumber` при смене origin на не-аэропорт:
```tsx
// В EntryBar: инициализировать из store
const [flightNumber, setFlightNumber] = useState(() => {
  return useBookingStore.getState().passengerDetails?.flightNumber ?? ''
})
```

---

## Warnings

### WR-01: `VehicleSlideshow` интервал не пересоздаётся при смене класса, если количество слайдов совпадает

**File:** `components/booking/VehicleSlideshow.tsx:60–77`

**Issue:** `useEffect` для `setInterval` зависит от `[slides.length]`. Все три класса имеют по 3 слайда, поэтому при переключении класса (business → first_class) интервал не пересоздаётся. Текущее поведение корректно только потому что функциональный апдейт `setActiveIndex(prev => (prev+1) % slidesLen)` не захватывает конкретные слайды. Но если в будущем добавить класс с другим числом слайдов, интервал с устаревшим `slidesLen` будет работать неправильно. Зависимость должна быть на устойчивый идентификатор.

**Fix:**
```tsx
// Заменить зависимость с [slides.length] на [resolvedClass]
useEffect(() => {
  const reducedMotion = checkReducedMotion()
  if (reducedMotion) return
  const slidesLen = slides.length
  intervalRef.current = setInterval(() => {
    if (!pausedRef.current) {
      setActiveIndex((prev) => (prev + 1) % slidesLen)
    }
  }, 4000)
  return () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
  }
}, [resolvedClass]) // <-- заменить slides.length на resolvedClass
```

---

### WR-02: Отсутствует валидация даты возврата в EntryBar — пользователь может указать дату раньше даты вылета

**File:** `components/booking/EntryBar.tsx:439–454`

**Issue:** `<input type="date">` для возврата не имеет атрибута `min`. Пользователь может выбрать дату возврата раньше даты поездки. EntryBar не валидирует эту пару перед вызовом `nextStep()` (метод `validate()` строки 80–87 не проверяет `returnDate`/`returnTime`). Ошибка проявится позже — либо в UI Step3Vehicle, либо в API calculate-price, который может вернуть некорректную цену.

**Fix:**
```tsx
// 1. В validate() добавить:
if (showReturn && returnDate && pickupDate && returnDate < pickupDate) {
  errs.returnDate = 'Return date must be on or after pickup date.'
}

// 2. На input return date добавить атрибут:
<input
  id="entry-bar-return-date"
  type="date"
  min={pickupDate ?? undefined}   // <-- добавить
  value={returnDate ?? ''}
  onChange={...}
/>
```

---

### WR-03: `Step3Vehicle` читает `pickupTime` через `getState()` в теле JSX без подписки — предупреждение о порядке возврата может быть устаревшим

**File:** `components/booking/steps/Step3Vehicle.tsx:351–352`

**Issue:** Строка 351 вычисляет условие предупреждения «Return must be after pickup», используя `useBookingStore.getState().pickupTime`. Этот компонент не подписан на `pickupTime` через `useBookingStore((s) => s.pickupTime)`. Если пользователь изменил время вылета на шаге 1 (и вернулся на шаг 3), компонент не перерендерится из-за изменения `pickupTime`, и предупреждение может не обновиться до следующего изменения `returnDate`/`returnTime`. Это может привести к тому, что пользователь не увидит предупреждение об ошибке.

**Fix:**
```tsx
// Добавить подписку в начало компонента:
const pickupTime = useBookingStore((s) => s.pickupTime)

// Заменить в строке 351:
{returnDate && returnTime && pickupDate && pickupTime &&
  `${returnDate}T${returnTime}` <= `${pickupDate}T${pickupTime}` && (
```

---

### WR-04: `BookingWizard.handleNext` в режиме квоты не проверяет `res.ok` перед `res.json()`

**File:** `components/booking/BookingWizard.tsx:247–268`

**Issue:** При отправке quote (`/api/submit-quote`) код сразу вызывает `await res.json()` без проверки `res.ok`. Если сервер вернёт HTML-страницу ошибки (500, 502 и т.д.), `res.json()` бросит SyntaxError и выполнение уйдёт в catch, который навигирует на `/book/confirmation?type=quote&ref=QR-error`. Пользователь видит страницу подтверждения с поддельным ref `QR-error`, думая что квота отправлена, хотя на самом деле произошла ошибка сервера.

**Fix:**
```tsx
const res = await fetch('/api/submit-quote', { ... })
if (!res.ok) {
  throw new Error(`submit-quote failed: ${res.status}`)
}
const data = await res.json()
router.push(`/book/confirmation?type=quote&ref=${data.quoteReference}`)
```

---

### WR-05: `StickyBookingPanel` показывает `selectedPrice.base` вместо `selectedPrice.total`

**File:** `components/booking/StickyBookingPanel.tsx:51`

**Issue:** `priceDisplay` формируется как `€${selectedPrice.base}`, но `PriceBreakdown` содержит поле `total` (= base + extras). Если extras уже выбраны в store (например, из прошлой сессии), панель покажет цену без extras, вводя пользователя в заблуждение. Кнопка «Select» в `handleSelectClass` при этом корректно прибавляет `extrasTotal` к base, создавая расхождение между показанной ценой и переданной в analytics.

**Fix:**
```tsx
const priceDisplay = selectedPrice
  ? `€${selectedPrice.total}`   // <-- total вместо base
  : null
```

---

## Info

### IN-01: Дублирование VEHICLE_LABELS в трёх компонентах

**File:** `components/booking/StickyBookingPanel.tsx:11–15`, `components/booking/steps/Step3Vehicle.tsx:13–17`, `components/booking/BookingWizard.tsx:122–126`

**Issue:** Объект `VEHICLE_LABELS` объявлен идентично в трёх местах. Любое добавление нового класса потребует изменений в трёх файлах. Следует вынести в `types/booking.ts` или в отдельный `lib/vehicle-labels.ts`.

**Fix:** Экспортировать из `types/booking.ts`:
```ts
export const VEHICLE_LABELS: Record<VehicleClass, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
}
```

---

### IN-02: `routes` library в `RouteMap` загружается, но не используется

**File:** `components/booking/RouteMap.tsx:22`

**Issue:** `setOptions` перечисляет `libraries: ['maps', 'places', 'routes']`, но `routes` (новый Routes API / `RoutesClient`) нигде в компоненте не используется — используется только классический `DirectionsService` (часть библиотеки `maps`). Лишняя библиотека в списке увеличивает нагрузку при первой загрузке Google Maps.

**Fix:**
```tsx
setOptions({
  key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
  libraries: ['maps', 'places'],  // убрать 'routes'
  v: 'weekly',
})
```

---

### IN-03: Непоследовательная гранулярность слотов времени возврата (15 мин vs 5 мин)

**File:** `components/booking/EntryBar.tsx:11–21` vs `components/booking/steps/Step3Vehicle.tsx:53–57`

**Issue:** EntryBar генерирует 96 слотов с шагом 15 минут (AM/PM формат). Step3Vehicle для выбора времени возврата при round-trip использует отдельный массив `TIME_SLOTS` из 288 слотов с шагом 5 минут в 24h формате. Один и тот же стор поле `returnTime` заполняется из разных источников с разной гранулярностью: из EntryBar — всегда кратно 15 минутам, из Step3 — может быть кратно 5 минутам. Это создаёт неконсистентность UX и потенциально удвоенную логику в API (которое получает `returnTime`).

**Fix:** Привести шаг к одному значению. Рекомендуется использовать 15-минутные слоты во всех местах, либо вынести `TIME_SLOTS_AMPM` в общий модуль `lib/time-slots.ts` и переиспользовать в обоих компонентах.

---

_Reviewed: 2026-06-17T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
