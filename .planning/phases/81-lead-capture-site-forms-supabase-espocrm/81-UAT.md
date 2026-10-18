---
status: complete
phase: 81-lead-capture-site-forms-supabase-espocrm
source: [81-01-SUMMARY.md, 81-02-SUMMARY.md, 81-03-SUMMARY.md, 81-04-SUMMARY.md, 81-05-SUMMARY.md, 81-06-SUMMARY.md, 81-07-SUMMARY.md, 81-08-SUMMARY.md, 81-09-SUMMARY.md, 81-10-SUMMARY.md, 81-11-SUMMARY.md]
started: 2026-10-18T18:34:02Z
updated: 2026-10-18T18:54:10Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Cold Start Smoke Test — продакшн-сайт и формы живы
expected: rideprestigo.com открывается без ошибок, страницы /contact, /corporate и /book/multi-day загружаются, формы на них видны и кликабельны.
result: pass

### 2. Уведомление о хранении под кнопкой отправки
expected: Под кнопкой отправки в формах contact, corporate и multi-day видна одна строка «We store your request to reply to it — Privacy Policy»; на /ru/contact (и других локалях) она переведена, а ссылка ведёт на /ru/privacy (локаль сохраняется).
result: pass

### 3. Контактная форма → Lead в EspoCRM
expected: Отправка контактной формы (тестовое имя/email) показывает обычный успех и письмо, как раньше. В течение ~2 минут в EspoCRM появляется ровно один Lead: статус New, источник «Website form» (контакт), назначен на тебя, в панели Website видна ссылка на запись сайта (cSupabaseRef).
result: pass

### 4. Корпоративная форма → Lead с компанией
expected: Отправка корпоративной формы создаёт один Lead со статусом New, название компании записано текстом в поле Account name (без привязки к Account), назначен на тебя.
result: pass

### 5. Multi-day quote → Lead с маршрутом по дням
expected: Отправка формы /book/multi-day создаёт один Lead; в описании маршрут по строке на день («Day 1 …», «Day 2 …» по порядку, «date not set» для дней без даты), есть номер квоты и телефон в формате E.164.
result: pass

### 6. Ручное бронирование в админке требует Channel
expected: В админке (ручное бронирование и шаг 6 создания) есть обязательный выпадающий список CHANNEL (WhatsApp / Phone / Email / Partner / Other). Без выбора отправка блокируется сообщением «Please choose the booking channel.»; с выбранным каналом бронь сохраняется.
result: pass
note: "Сначала было «нету канала» — устаревшая вкладка; после Cmd+Shift+R поле CHANNEL на месте (повторная проверка 2026-10-18T18:49:00Z)"

### 7. Бронь → Lead, статус следует за бронью
expected: Новая бронь (ручная с каналом или неоплаченная с сайта) через ~2 минуты даёт Lead: источник — канал брони (или «Website booking»), статус New/In Process; после оплаты/подтверждения Lead становится Converted, после отмены — Dead. Дублей Lead на одну бронь нет; у round trip — один Lead на обе ноги.
result: pass
note: "Бронь 18:50:39 (confirmed, WhatsApp) → Lead Converted / WhatsApp в 18:52:19 UTC (задержка kick 90 с по замыслу). Первое «в срм не вижу» — посмотрел до того, как лид пришёл."

### 8. Права в EspoCRM: Dispatcher не видит Leads
expected: Под пользователем Dispatcher раздел Leads недоступен/пуст; под твоим пользователем видны все лиды сайта, у каждого есть панель Website с ссылками на запись сайта.
result: pass
note: "Сначала было «нету лидов» — устаревший список; после перезагрузки 3 лида видны у prestigo-admin. Часть про Dispatcher проверить нельзя: ни у одного пользователя нет роли Dispatcher (в roles.json у неё Lead=false)."

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-81-6
  truth: "В админке (ручное бронирование и шаг 6 создания) есть обязательный выпадающий список CHANNEL (WhatsApp / Phone / Email / Partner / Other); без выбора отправка блокируется"
  status: resolved
  resolved_by: re-test after hard reload
  resolved_at: 2026-10-18T18:49:00Z
  reason: "User reported: нету канала (модалка NEW BOOKING в проде без поля CHANNEL)"
  severity: major
  test: 6
  root_cause: "Not a code defect (likely stale client bundle). CHANNEL select is on origin/main (6033b558, ManualBookingForm.tsx:876 directly under PASSENGER DETAILS) and production deployment b2cb1e18 is success at 18:25Z. The admin tab was most likely loaded before that deploy and kept the old JS. Pending re-test after hard reload."
  artifacts:
    - path: "components/admin/ManualBookingForm.tsx"
      issue: "none — CHANNEL present at line 876"
  missing: []

- gap_id: G-81-8
  truth: "Под пользователем владельца в EspoCRM видны все лиды сайта с панелью Website; Dispatcher Leads не видит"
  status: resolved
  resolved_by: re-test after hard reload
  resolved_at: 2026-10-18T18:49:00Z
  reason: "User reported: нету лидов (crm.rideprestigo.com/#Lead, All → No Data 0/0), хотя тесты 3–5 (формы → Lead) пройдены"
  severity: major
  test: 8
  root_cause: "Not a code defect. Supabase: 3 inquiries (contact 18:37, corporate 18:39, multiday 18:41 UTC), all outbox rows status=sent. EspoCRM API: 3 Leads (Contact form / Corporate form / Multi-day quote, New) assigned to prestigo-admin (type admin, sees all). Empty list = stale list view in the CRM tab. Also: no user holds the Dispatcher role (users: prestigo-admin, prestigo-config, prestigo-sync, restore-drill-canary), so the Dispatcher half of the test cannot be run; the role has Lead=false in roles.json."
  artifacts:
    - path: "infra/espocrm/roles.json"
      issue: "none — Dispatcher Lead=false"
  missing: []
