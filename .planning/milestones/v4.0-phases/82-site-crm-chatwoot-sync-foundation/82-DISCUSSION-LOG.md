# Phase 82: Site ↔ CRM/Chatwoot Sync Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-18
**Phase:** 82-site-crm-chatwoot-sync-foundation
**Areas discussed:** Клиент в Chatwoot, Дубли и общие телефоны, Удаление по GDPR, Здоровье outbox и политика

---

## Клиент в Chatwoot

| Option | Description | Selected |
|--------|-------------|----------|
| Всех клиентов | Каждый, кто бронировал/зарегистрировался, заранее в Chatwoot | ✓ |
| Только кто писал | Синк только в существующие контакты | |

| Option (карточка, multi) | Selected |
|--------|----------|
| Ближайшая поездка | ✓ |
| Счётчики | ✓ |
| Сумма потраченного | ✓ |
| Ссылки в CRM и админку | ✓ |

| Option (кто главнее для имени/телефона) | Selected |
|--------|----------|
| Нет, только пустые поля | ✓ |
| Да, сайт всегда прав | |

---

## Дубли и общие телефоны

| Option | Selected |
|--------|----------|
| Email — сразу, телефон — авто (с пометкой «склеено по телефону») | ✓ |
| По телефону — только предлагать | |

| Option (общий телефон) | Selected |
|--------|----------|
| Авто (≥2 email) + ручной список | ✓ |
| Только автоматически | |
| Только ручной список | |

| Option (где разделять) | Selected |
|--------|----------|
| В админке сайта | ✓ |
| В EspoCRM | |

---

## Удаление по GDPR

| Question | Options | Selected |
|----------|---------|----------|
| Кто запускает | Только владелец из админки / Админка + сам клиент | Только владелец из админки |
| Брони | Анонимизировать / Удалять полностью | Анонимизировать |
| CRM / Chatwoot | Удалить всё про человека / Анонимизировать и там | Удалить всё про человека |
| Аккаунт на сайте | Удалять аккаунт / Блокировать при будущей брони | Удалять аккаунт |

---

## Здоровье outbox и политика

| Question | Options | Selected |
|----------|---------|----------|
| Алерты | Ежедневное письмо / Сразу при каждом сбое / Только страница | Ежедневное письмо |
| Повтор | По одному + «все упавшие» / Только по одному | По одному + «все упавшие» |
| Срок переписки Chatwoot | До запроса на удаление / 3 года | До запроса на удаление |
| WhatsApp в политике | Обще — как канал связи / Не упоминать | Обще — как канал связи |

---

## Claude's Discretion

Event naming/payload/fan-out, backfill order and batching, admin-edit column coverage, erasure UX details, page layouts, Lead refresh on booking edit.

## Deferred Ideas

Customer self-service erasure; automatic Chatwoot retention cleanup; WhatsApp Cloud API policy details (Phase 78); reading CRM-side merges back (Phase 83+).
