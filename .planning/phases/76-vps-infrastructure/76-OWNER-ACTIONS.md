# Phase 76 — Owner actions still open

Status 2026-09-28: plans 01–04 and 08 complete; 05 and 06 `complete-pending-owner`; 07 and 09 not started (need the items below). Everything automatable is done.

## A. Custody (plan 05 Task 3) — ✓ DONE 2026-09-28 (only open bit: Chatwoot 2FA not enabled yet)
1. Terminal on the owner Mac: `ssh prestigo-vps sudo cat /etc/prestigo/backup.env` → copy all lines into a password-manager secure note **"Prestigo VPS backup.env"** (without it backups cannot be decrypted if the VPS is lost; plan 09 restores with exactly this note).
2. Chatwoot: https://chat.rideprestigo.com → Forgot password → info@rideprestigo.com → set password (password manager) → Profile → enable 2FA if offered, save recovery codes.
3. EspoCRM: `ssh prestigo-vps sudo grep ESPOCRM_ADMIN_PASSWORD /etc/prestigo/espocrm.env` → log in at https://crm.rideprestigo.com as `prestigo-admin` → change password → Preferences → Two-Factor Authentication (authenticator app).
4. Tell Claude which emails arrived: "Prestigo VPS relay test (Phase 76)", EspoCRM test email, Chatwoot reset email.
→ Claude then runs the verification in 76-05-SUMMARY "Deferred owner actions".

## B. Monitoring accounts (plan 06 Task 1) — ~15 min
1. healthchecks.io: sign up → Integrations → Telegram (@HealthchecksBot, /start) → Settings → API Access → read-write API key.
2. uptimerobot.com: sign up (free) → Integrations → Telegram → Integrations & API → Main API key.
3. Send both keys to Claude → Claude writes /etc/prestigo/monitor.env, runs provision-monitors.sh, `--status` all up, one real test alert (see 76-06-SUMMARY).

## C. Outage test (plan 07) — after B, owner present ~30 min
Claude stops the VPS apps, proves site/booking/contact keep working and alerts fire; owner confirms Telegram/email alerts and the contact email arrived, approves cleanup of the marked test booking row.

## D. Restore drill (plan 09) — after A
1. console.hetzner.cloud: sign up (may need ID verification) → project `prestigo-restore-drill` → Security → API Tokens → Read & Write token → send to Claude.
2. During the drill: log into both restored apps via the tunnel and sign off.

## E. Housekeeping
- Backblaze: Generate New Master Application Key (old one was pasted in chat); delete the over-privileged key `crm`; confirm bucket Lifecycle = 30 days.
- Hostinger: revoke the phase API token after the phase closes.
- Owner decision recorded: B2 bucket in us-east-005 (not EU) — privacy-policy update suggested as a separate task.
