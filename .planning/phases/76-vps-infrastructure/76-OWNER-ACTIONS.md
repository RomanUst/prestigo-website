# Phase 76 — Owner actions still open

Status 2026-09-28: plans 01–04, 06 and 08 complete; 05 `complete-pending-owner`; 07 `complete-pending-owner` (Task 1 ran autonomously, owner authorized — see section C below); 09 not started. Everything automatable is done.

## A. Custody (plan 05 Task 3) — ✓ DONE 2026-09-28 (Chatwoot CE v4.18 offers no 2FA in UI — recorded)
1. Terminal on the owner Mac: `ssh prestigo-vps sudo cat /etc/prestigo/backup.env` → copy all lines into a password-manager secure note **"Prestigo VPS backup.env"** (without it backups cannot be decrypted if the VPS is lost; plan 09 restores with exactly this note).
2. Chatwoot: https://chat.rideprestigo.com → Forgot password → info@rideprestigo.com → set password (password manager) → Profile → enable 2FA if offered, save recovery codes.
3. EspoCRM: `ssh prestigo-vps sudo grep ESPOCRM_ADMIN_PASSWORD /etc/prestigo/espocrm.env` → log in at https://crm.rideprestigo.com as `prestigo-admin` → change password → Preferences → Two-Factor Authentication (authenticator app).
4. Tell Claude which emails arrived: "Prestigo VPS relay test (Phase 76)", EspoCRM test email, Chatwoot reset email.
→ Claude then runs the verification in 76-05-SUMMARY "Deferred owner actions".

## B. Monitoring accounts (plan 06 Task 1) — ~15 min
1. healthchecks.io: sign up → Integrations → Telegram (@HealthchecksBot, /start) → Settings → API Access → read-write API key.
2. uptimerobot.com: sign up (free) → Integrations → Telegram → Integrations & API → Main API key.
3. Send both keys to Claude → Claude writes /etc/prestigo/monitor.env, runs provision-monitors.sh, `--status` all up, one real test alert (see 76-06-SUMMARY).

## C. Outage test (plan 07) — ✓ DONE 2026-09-28 (alerts + email confirmed, test booking deleted)

Claude ran the full outage on production: caddy/chatwoot/espocrm stopped 08:37:13Z-08:37:55Z UTC on 2026-09-28. Site/booking/contact all proved working with the VPS fully dark (booking reached the rendered Stripe Payment Element, ref `PRG-20260928-D8E6DC`; contact form submitted with zero requests to chat./crm.). Both UptimeRobot monitors and 4 Healthchecks checks (sidekiq/tls-expiry/espocrm-internals/apps-http) were confirmed down by 08:42:09Z (under 5 minutes); full recovery confirmed by 08:47:39Z. Full timeline: `infra/vps/runbooks/outage-test.md` and `76-07-SUMMARY.md`.

**Still needed from the owner:**
1. Check Telegram and email around **08:42:09Z** UTC on 2026-09-28 for DOWN alerts from UptimeRobot ("Chatwoot app", "EspoCRM login" — email only, per D-02) and from Healthchecks.io (`prestigo-sidekiq`, `prestigo-tls-expiry`, `prestigo-espocrm-internals`, `prestigo-apps-http` — Telegram + email), and again around **08:47:39Z** for recovery/UP notices.
2. Check the manager inbox around **08:39:26Z** for "New inquiry: E2E Outage Test (Phase 76) ..." — this is the real inquiry email sent by the contact-form check while the VPS was offline.
3. Approve (or decline) deleting the one E2E test booking row `PRG-20260928-D8E6DC` — a JSON backup is taken before any delete.

Reply "alerts ok, email ok, delete test rows" (or say what did not arrive) to close out Task 2/3.

## D. Restore drill (plan 09) — after A
1. console.hetzner.cloud: sign up (may need ID verification) → project `prestigo-restore-drill` → Security → API Tokens → Read & Write token → send to Claude.
2. During the drill: log into both restored apps via the tunnel and sign off.

## E. Housekeeping
- Backblaze: Generate New Master Application Key (old one was pasted in chat); delete the over-privileged key `crm`; confirm bucket Lifecycle = 30 days.
- Hostinger: revoke the phase API token after the phase closes.
- Owner decision recorded: B2 bucket in us-east-005 (not EU) — privacy-policy update suggested as a separate task.
