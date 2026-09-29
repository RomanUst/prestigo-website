# infra/chatwoot - Chatwoot configuration as code

Everything that configures the live Chatwoot instance (`https://chat.rideprestigo.com`,
account 1) lives here as JSON, and `sync.mjs` applies it. Git is the source of
truth (D-18): an edit made only in the Chatwoot UI is drift, and the next sync
will overwrite it for every resource listed below. The VPS side of Chatwoot
(compose, backups, smoke checks) is documented under `infra/vps/`.

## What lives here

| Path | Purpose |
|------|---------|
| `account.json` | Account-level settings (support email) |
| `labels.json` | The 11 labels: `ch-*` channel labels and topic labels |
| `teams.json` | Bookings and B2B teams (owner is a member) |
| `custom-attributes.json` | Conversation and contact attribute definitions |
| `canned-responses/*.json` | Canned responses, one short code per `<topic>-<locale>` |
| `inboxes.json` | The Website widget inbox (full config) and the owner-made inboxes (non-secret settings only) |
| `automation-rules.json` | Channel rules, one keyword rule per keyword, label routing |
| `telegram/` | Telegram bot profile (name, description) helper |
| `lib/client.mjs` | Shared API client (token handling, redaction) |
| `sync.mjs` | Idempotent config sync |
| `inspect.mjs` | Read-only views of the live instance |

Templates must stay price-free. Canned responses are sent to customers verbatim,
so a baked-in amount would go stale and could contradict the real charge. The
pre-commit hook (`.husky/pre-commit`) fails the commit when any `.json` or `.md`
under this directory contains a currency symbol or code. Say "your fixed quote"
or point to the booking page instead of naming an amount.

## Running sync

```bash
node infra/chatwoot/sync.mjs --dry-run      # always first: prints the plan, issues GET requests only
node infra/chatwoot/sync.mjs                # apply
node infra/chatwoot/sync.mjs --only labels,canned
```

Output is one line per resource (`create/update/unchanged/skipped/deleted`) and a
summary. A second run right after a real run must show `create=0 update=0`. The
`skipped` count is the channel rules whose inbox does not exist yet: re-run sync
after the owner creates each inbox (the two email inboxes, later channels).
Only automation rules named `topic:*` are ever deleted; rules made by hand in the
UI are never touched.

## Running inspect

All modes are read-only (GET only). Exit 0 ok, 1 expectation failed, 2 API or config error.

```bash
node infra/chatwoot/inspect.mjs --status
node infra/chatwoot/inspect.mjs --activity [--since ISO] [--limit N]
node infra/chatwoot/inspect.mjs --report --since ISO [--until ISO]
node infra/chatwoot/inspect.mjs --contact <email> --expect-identifier <uuid>
```

- `--status` prints label, team, attribute, canned and automation counts, the
  Website inbox key settings (`hmac_mandatory`, reply time, widget colour,
  whether the pre-chat email is required) and present or missing for every
  managed inbox.
- `--activity` prints one line per recent conversation: inbox, id, status,
  labels, whether the assignee is the owner, team and the status of the last
  outgoing message. Never names, emails or message bodies.
- `--report` prints conversations, average first response time and average
  resolution time per inbox and per `ch-*` label from Chatwoot's native reports
  API (INBOX-06). It uses `GET /api/v2/accounts/{id}/summary_reports/{inbox|label}`
  and falls back to `reports/summary` per entity if that path is missing.
  Averages are seconds; `null` means Chatwoot has no average yet.
- `--contact` prints only `contact_found` and `identifier_matches`, so an
  identity-validated widget contact can be checked without exposing the contact.
- `--print website-token|hmac-token` writes one Website inbox value to stdout and
  refuses to run when stdout is a terminal. It exists only to feed a pipe (see
  rotation below).

## WhatsApp tooling (Phase 78)

Three scripts cover the WhatsApp Cloud API channel (a manual Chatwoot inbox on a
dedicated number). None of them prints a credential: output is fixed `key=value`
lines, enums, counts and booleans. Meta values come from environment variables or
`~/.config/prestigo/meta-whatsapp.env` (mode 600): `META_WA_SYSTEM_USER_TOKEN`,
`META_WA_APP_SECRET`, `META_WA_WABA_ID`, `META_WA_PHONE_NUMBER_ID`, optional
`META_WA_GRAPH_VERSION`. The Chatwoot admin token comes from
`~/.config/prestigo/chatwoot-api.env` as for `sync.mjs`. Exit codes: 0 ok, 1
expectation failed or refused, 2 API or config error.

```bash
node infra/chatwoot/whatsapp-templates.mjs --validate | --dry-run | --status | --only <key> | --allow-edit
node infra/chatwoot/inspect.mjs --whatsapp [--expect-connected]
node infra/chatwoot/whatsapp-channel.mjs --probe
node infra/chatwoot/whatsapp-channel.mjs --harden [--dry-run]
node infra/chatwoot/whatsapp-channel.mjs --sync-templates
node infra/chatwoot/whatsapp-channel.mjs --register-webhook
node infra/chatwoot/whatsapp-channel.mjs --number [--expect-e164 <+420 and 9 digits>] [--expect-currency <ISO code>]
node infra/chatwoot/whatsapp-channel.mjs --register
```

- `whatsapp-templates.mjs` keeps the message templates in git and creates,
  re-submits or reports them on Meta. It never deletes a template.
- `inspect.mjs --whatsapp` is the read-only health view of the channel.
- `whatsapp-channel.mjs --probe` sends three message-less webhook POSTs to the
  inbox's own webhook URL (unsigned, wrong signature, correct signature) and
  prints `verdict=enforced` only for 401, 401, 200. It creates no conversation.
- `--harden` writes `app_secret` into the inbox `provider_config` (the full
  existing hash is merged in memory, then re-read to prove `source`, `api_key` and
  `phone_number_id` are unchanged). Idempotent; `--dry-run` only reads. If the
  Chatwoot API refuses the write, the fallback is a rails runner in the Chatwoot
  rails container (see the runbook).
- `--sync-templates` and `--register-webhook` call the Chatwoot inbox endpoints of
  the same names; they are the recovery levers named in the runbook.
- `--number` prints the number's Meta status enums and whether it belongs to the
  WABA. `--expect-e164` prints `number_matches` without printing the number;
  `--expect-currency` checks the WABA billing currency (the code agreed with the
  owner is recorded in `infra/vps/runbooks/whatsapp.md`, "Owner onboarding
  checklist"; it is deliberately not written here).
- `--register` registers the number with the owner's own 6 digit two-step PIN. The
  PIN is only ever typed at the hidden prompt of this command, in the owner's own
  terminal: it refuses to run without a terminal, accepts no PIN argument, and
  never prints, logs or stores it. It reads the status first, does nothing when the
  number is already connected and makes at most one register call per run (Meta
  allows 10 per 72 hours).

## Token custody

No secret is ever committed, pasted into chat or written to a log. Names and
custody notes are listed (with empty values) in
`infra/vps/env/chatwoot-integration.env.example`, which also feeds the pre-commit
infra secret gate: a real value pasted next to one of these names in any tracked
file is blocked (`scripts/qa/secret_gate_probe.sh` proves it).

| Secret | Where the real value lives |
|--------|----------------------------|
| Chatwoot API token | Owner Mac, `~/.config/prestigo/chatwoot-api.env` (mode 600, also holds the base URL and account id). Read by `lib/client.mjs`; never a command-line argument. |
| Website widget HMAC secret | Chatwoot (Inboxes, Website, Configuration, Identity validation) and Vercel Production `CHATWOOT_WIDGET_HMAC_SECRET` (sensitive) |
| Website widget token | Public (shipped to browsers). Vercel Production `CHATWOOT_WEBSITE_TOKEN` |
| Chatwoot base URL | Not secret. Vercel Production `CHATWOOT_BASE_URL` |
| Telegram bot token | Owner Mac, `~/.config/prestigo/telegram-chat-bot.env` (mode 600) and inside the Chatwoot Telegram inbox |

The reverse proxy in front of Chatwoot drops request headers that contain an
underscore, so the API client sends `api-access-token` (hyphens), never
`api_access_token`. Do not use a raw `curl -H "api_access_token: ..."` against
production; it answers 401.

## Rotation

Rotate on suspicion of exposure, when a person with access leaves, and after any
incident. After each rotation run `node infra/chatwoot/inspect.mjs --status` to
confirm the API still answers.

**Chatwoot API token.** In Chatwoot open Profile settings, Access token, and
reset it. Put the new value in `~/.config/prestigo/chatwoot-api.env` (edit the
file in place, keep mode 600). Nothing else holds it. The old token stops working
immediately.

**Website HMAC secret.** Rotate it in Chatwoot (Inboxes, Website, Configuration,
Identity validation). If this Chatwoot version has no regenerate control there,
rotating means recreating the Website inbox (sync recreates it from the JSON, then
repeat this step) or an owner-run change on the VPS; confirm which applies before
you start. Then re-pipe the new value into Vercel without displaying it, and
redeploy so the identity route signs with the new secret:

```bash
vercel env rm CHATWOOT_WIDGET_HMAC_SECRET production --yes
node infra/chatwoot/inspect.mjs --print hmac-token | vercel env add CHATWOOT_WIDGET_HMAC_SECRET production --sensitive --yes
# then redeploy production (merge to main, or promote a fresh deployment)
```

Until the redeploy finishes, the identity route signs with the old secret and
Chatwoot rejects the identity, so do it in a quiet hour and check with
`inspect.mjs --contact` afterwards.

**Telegram bot token.** In Telegram, message BotFather with `/revoke`, choose the
bot and take the new token. Update the Telegram inbox in Chatwoot (Inboxes,
Telegram, Settings) and the local file `~/.config/prestigo/telegram-chat-bot.env`.
Send a test message to the bot and confirm it arrives in Chatwoot.

## Adding a channel (Phases 78 and 79)

1. Add a `ch-<channel>` label to `labels.json` (same colour as the other `ch-*` labels).
2. Add the inbox to `inboxes.json` under `managed` (name, `channel_type`, non-secret
   settings). The owner creates the channel itself so credentials never touch git.
3. Add a `channelRules` entry to `automation-rules.json` (inbox, label, team) so new
   conversations are labelled and routed.
4. `node infra/chatwoot/sync.mjs --dry-run`, then `node infra/chatwoot/sync.mjs`,
   then `node infra/chatwoot/inspect.mjs --status` (the inbox must read `present`).
5. Extend the `ch-*` reporting check: `--report` picks up every `ch-*` label automatically.
