---
phase: 76-vps-infrastructure
plan: 03
subsystem: infra
tags: [vps, dns, hostinger, resend, smtp, backblaze, b2, restic, secrets]

requires:
  - phase: 76-01
    provides: "Hostinger KVM 2 VPS reachable as root/deploy, D-15 secret gate covering infra/vps"
  - phase: 76-02
    provides: "Hardened Ubuntu 24.04 host (deploy user, ufw, fail2ban, unattended-upgrades, Docker, /etc/prestigo host-layout contract)"
provides:
  - "chat.rideprestigo.com and crm.rideprestigo.com A records (TTL 3600) pointing at the VPS IPv4, proven by a zero-collateral zone diff"
  - "infra/vps/scripts/dns-zone-diff.sh — reusable record-level Hostinger zone snapshot diff tool"
  - "/etc/prestigo/smtp.env (root 0600) — working Resend STARTTLS relay credentials for Chatwoot/EspoCRM system mail"
  - "/etc/prestigo/backup.env (root 0600) — working Backblaze B2 bucket-scoped credentials for the future restic backup job"
  - "infra/vps/runbooks/dns.md — the D-20 procedure (snapshot, abort-if-exists, PUT, diff, dig, rollback, token revocation)"
  - "infra/vps/env/{smtp,backup}.env.example — documented env-file contracts with empty secret values"
affects: [76-04, 76-05, 76-06, 76-07]

actuals:
  tokens: 3940
  tasks: 1
  commits: 1
  plan_head_before: 0c20acf0aed2d4e5818c46f605e363eb9ba7498e
  plan_head_after: 35b82bc2683108645433595917bce7c09ca8cc7f

tech-stack:
  added: []
  patterns:
    - "jq flatten-then-comm diff for zone snapshots: name|type|content tuples, sorted, comm -13/-23 for added/removed — no dependency beyond jq/bash already present"
    - "curl --aws-sigv4 for S3-compatible API calls (Backblaze B2) without installing an AWS CLI"
    - "credentials held only in a shell variable scoped to the commands that consume them; piped over ssh stdin into `sudo install -m 600 -o root -g root /dev/stdin <path>`"

key-files:
  created:
    - infra/vps/scripts/dns-zone-diff.sh
    - infra/vps/env/smtp.env.example
    - infra/vps/env/backup.env.example
    - infra/vps/runbooks/dns.md
    - .planning/phases/76-vps-infrastructure/evidence/dns-zone-before.json
    - .planning/phases/76-vps-infrastructure/evidence/dns-zone-after.json
  modified: []

key-decisions:
  - "Owner-approved deviation from D-05: the Backblaze B2 bucket is region us-east-005, not EU. Claude explained the GDPR/D-05 implication and recommended a new EU-region account; owner explicitly chose to keep the existing US-East bucket (\"оставляем\"). Rationale accepted: restic encrypts client-side before upload (Backblaze never holds the key), and Backblaze participates in the EU-US Data Privacy Framework. The plan's literal verify grep (`s3:https://s3.eu-`) was replaced with an equivalent us-east-005 check per this session's explicit instruction; infra/vps/env/backup.env.example documents the region as the owner's choice rather than claiming EU."
  - "SMTP relay test used port 587 with explicit STARTTLS (curl smtp://...:587 --ssl-reqd) exactly as specified in the plan's interfaces block, matching RESEND_SMTP_PORT=587 in smtp.env — not the port-465 implicit-TLS alternative that also happens to work against smtp.resend.com."
  - "D-10 evidence resolved via API, not the owner-confirmation fallback: the same Hostinger token also authorizes the VPS API (GET /virtual-machines, GET .../backups), returning a backups list of 0 entries — consistent with 76-01-SUMMARY.md's 'no backups yet, host just created' note."

patterns-established:
  - "Pattern: DNS zone changes always go snapshot -> abort-if-exists -> minimal PUT -> re-snapshot -> diff-assert -> dig-confirm -> token-revoke (infra/vps/runbooks/dns.md), never a direct edit"

requirements-completed: [INFRA-01, INFRA-02]

coverage:
  - id: D1
    description: "D-20: chat/crm A records added with a proven +2/-0 zone diff, no collateral change to apex/www/MX/SPF/DKIM/DMARC/autodiscover"
    requirement: "INFRA-01"
    verification:
      - kind: other
        ref: "bash infra/vps/scripts/dns-zone-diff.sh evidence/dns-zone-before.json evidence/dns-zone-after.json -> added=2 removed=0, both lines chat|A and crm|A with the VPS IPv4"
        status: pass
    human_judgment: false
  - id: D2
    description: "INFRA-01: chat/crm resolve at the authoritative nameserver to the VPS IPv4"
    requirement: "INFRA-01"
    verification:
      - kind: other
        ref: "dig +short chat.rideprestigo.com @ns1.dns-parking.com / crm.rideprestigo.com @ns1.dns-parking.com -> 179.198.213.201 (both), matches ssh -G prestigo-vps hostname"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-18: /etc/prestigo/smtp.env holds a working, root-only Resend sending-only key; STARTTLS relay on port 587 accepted"
    requirement: "INFRA-02"
    verification:
      - kind: other
        ref: "ssh prestigo-vps stat -> 600 root /etc/prestigo/smtp.env; curl smtp://smtp.resend.com:587 --ssl-reqd relay transcript -> 250 Accepted after DATA"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-05/D-08: /etc/prestigo/backup.env holds a working, root-only bucket-scoped B2 key; List/Put/Delete probe against the bucket succeeds"
    requirement: "INFRA-02"
    verification:
      - kind: other
        ref: "ssh prestigo-vps stat -> 600 root /etc/prestigo/backup.env; curl --aws-sigv4 ListObjectsV2/PUT/DELETE against s3.us-east-005.backblazeb2.com/prestigo-vps-backup-7k3m -> 200/200/204"
        status: pass
    human_judgment: false
  - id: D5
    description: "Documentation artifacts: dns-zone-diff.sh, smtp.env.example, backup.env.example (empty secret values), dns.md runbook with rollback + token revocation"
    verification:
      - kind: other
        ref: "grep -Eq secret-empty-pattern on both .example files (pass); ! grep -Eq secret-value-pattern (pass); grep -q revoke infra/vps/runbooks/dns.md (pass); sh scripts/qa/secret_gate_probe.sh (BLOCKED/BLOCKED/ALLOWED); pre-commit hook passed on commit 35b82bc2 (no --no-verify)"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-09-28
status: complete
---

# Phase 76 Plan 03: DNS + VPS Egress Credentials Summary

**chat.rideprestigo.com and crm.rideprestigo.com now resolve to the VPS with a proven zero-collateral zone diff, and the VPS holds working, root-only Resend SMTP relay and Backblaze B2 backup credentials — an owner-approved US-East (not EU) bucket region.**

## Performance

- **Duration:** ~35 min (continuation agent — Task 1 checkpoint had already been resolved by the owner in chat before this run)
- **Tasks:** 2/2 completed (Task 1: checkpoint:decision, resolved by owner reply "approve" before this run; Task 2: tracer, executed and committed in this run)
- **Files modified:** 6 created, 0 modified

## Accomplishments

- Snapshotted the live Hostinger zone (14 record sets), confirmed no pre-existing `chat`/`crm` records, PUT exactly two new A records (`overwrite:false`), re-snapshotted (16 record sets), and proved the diff is exactly `added=2 removed=0` with `infra/vps/scripts/dns-zone-diff.sh` — no apex/www/MX/SPF/DKIM/DMARC/autodiscover record was touched.
- Both new hostnames resolve at the authoritative nameserver (`ns1.dns-parking.com`) to the VPS IPv4 `179.198.213.201`, matching `ssh -G prestigo-vps` hostname.
- Wrote `/etc/prestigo/smtp.env` (root 0600) on the VPS holding the owner-supplied dedicated Resend sending-only key; ran a live STARTTLS relay test on port 587 from `notifications@rideprestigo.com` to `info@rideprestigo.com` — SMTP transcript shows `250 Accepted` after `DATA`.
- Wrote `/etc/prestigo/backup.env` (root 0600) on the VPS holding the owner-supplied Backblaze B2 bucket-scoped key; ran a live `curl --aws-sigv4` probe against the bucket — `ListObjectsV2` 200, object `PUT` 200, object `DELETE` 204.
- Also captured D-10 evidence via the same Hostinger token's read-only VPS API access (`GET /virtual-machines/{id}/backups` → 0 entries, consistent with the host being newly created).
- Produced `infra/vps/runbooks/dns.md` (full D-20 procedure incl. rollback and token revocation) and `infra/vps/env/{smtp,backup}.env.example` (every key documented, secret values empty).

## Task Commits

1. **Task 1 (checkpoint:decision, blocking-human): owner approves the exact DNS change + hands over three session credentials** — resolved by the owner replying "approve" in chat with all required credentials (Hostinger token, Resend key, B2 keyID/applicationKey/bucket/endpoint) before this continuation run started. No commit (decision-only task).
2. **Task 2 (tracer): apply the two A records with snapshot/diff, place SMTP and B2 credentials, prove each path** — `35b82bc2` (security)

**Plan metadata:** this SUMMARY + STATE/ROADMAP update (REQUIREMENTS.md intentionally not updated per this run's explicit instruction — see "Deviations" below).

## Files Created/Modified

- `infra/vps/scripts/dns-zone-diff.sh` — jq-flatten + `comm` record-level diff of two Hostinger zone JSON snapshots; prints `+`/`-` tuple lines and a final `added=N removed=M`, always exits 0
- `infra/vps/env/smtp.env.example` — documents `RESEND_SMTP_HOST/PORT/USER/PASSWORD`, `SMTP_FROM_ADDRESS/NAME`; secret value empty
- `infra/vps/env/backup.env.example` — documents `RESTIC_REPOSITORY/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_DEFAULT_REGION/B2_BUCKET/B2_S3_ENDPOINT/RESTIC_PASSWORD`; secret values empty; header note explains the US-East region deviation
- `infra/vps/runbooks/dns.md` — full D-20 step-by-step procedure: token creation, snapshot, protected-record list, minimal PUT body, diff-tool usage, dig verification, rollback, token revocation
- `.planning/phases/76-vps-infrastructure/evidence/dns-zone-before.json` / `dns-zone-after.json` — public DNS zone snapshots (no secrets)
- Host (not in git): `/etc/prestigo/smtp.env`, `/etc/prestigo/backup.env` (root:root 0600); DNS: `chat`/`crm` A records in the `rideprestigo.com` zone

## Decisions Made

See `key-decisions` in frontmatter. In short:
1. **US-East B2 bucket accepted as an explicit owner-approved deviation from D-05** (see "Deviations" below for the full rationale and instructions this session carried).
2. SMTP relay proven on port 587 with STARTTLS specifically (not the also-working port-465 implicit-TLS path), matching the plan's interfaces block literally.
3. D-10 evidence obtained via a live API call rather than falling back to the owner-confirmation note, since the same token happened to also authorize the Hostinger VPS API.

## Deviations from Plan

### Owner-Approved Architectural Deviation (not a Rule 1-3 auto-fix)

**1. Backblaze B2 bucket region is us-east-005, not EU — D-05 modified with explicit owner approval**
- **Found during:** Task 1 checkpoint (resolved before this continuation run; recorded here for the plan's audit trail)
- **Issue:** D-05 requires "Offsite target is Backblaze B2, EU region" for GDPR reasons. The owner-created bucket (`prestigo-vps-backup-7k3m`) and its keys are in `us-east-005`, not an EU region.
- **Owner instruction (explicit, this session):** Claude explained the GDPR/D-05 implication and recommended creating a new EU-region B2 account instead; the owner explicitly replied to keep the US bucket ("оставляем"). This session's dispatch further instructed: do NOT apply the plan's "refuse to continue if `AWS_DEFAULT_REGION` does not start with `eu-`" guard, and replace the plan's literal verify grep (`^RESTIC_REPOSITORY=s3:https://s3.eu-`) with an equivalent check against the real `us-east-005` endpoint.
- **What was done:** `/etc/prestigo/backup.env` and `infra/vps/env/backup.env.example` use `AWS_DEFAULT_REGION=us-east-005` / `B2_S3_ENDPOINT=s3.us-east-005.backblazeb2.com` as-is. No EU guard was applied. The `.example` file's header comment documents the deviation, the rationale (restic client-side encryption — Backblaze never holds the key; Backblaze's EU-US Data Privacy Framework participation), and warns future tooling not to assume an `eu-` prefix.
- **Verification:** `curl --aws-sigv4` against the real `us-east-005` endpoint: `ListObjectsV2` 200, `PUT` 200, `DELETE` 204 — the credentials work end-to-end against the bucket the owner actually created.
- **Files modified:** `/etc/prestigo/backup.env` (host, not in git), `infra/vps/env/backup.env.example`
- **Committed in:** `35b82bc2`

### Auto-fixed Issues

None — no Rule 1/2/3 auto-fixes were needed; the only deviation from the plan's literal text is the owner-approved US-region substitution above, which is a directed change, not an autonomous fix.

---

**Total deviations:** 1 (owner-directed architectural substitution, not a Rule 1-3 auto-fix)
**Impact on plan:** Backups will reside in the US rather than the EU. Restic's client-side encryption and Backblaze's Data Privacy Framework participation were accepted by the owner as sufficient mitigation. No other scope creep.

## Issues Encountered

None. Both credential paths (SMTP relay, B2 probe) worked on the first attempt with the owner-supplied values.

## User Setup Required

None further for this plan — all three `user_setup` items from the plan's frontmatter (Hostinger API token, Resend sending-only key, Backblaze B2 bucket+key) were owner-supplied credentials, already consumed in this run. **Reminder per the plan's `<output>` spec: the owner should revoke the Hostinger API token created for this session** (hPanel -> Account/Profile -> API) — it has no further use after this plan. It was held only in shell variables during this run, never written to disk or committed.

## Next Phase Readiness

- `chat.rideprestigo.com` / `crm.rideprestigo.com` now resolve to the VPS — Plan 76-04 can proceed with TLS (Caddy) and the Chatwoot/EspoCRM Compose stacks.
- `/etc/prestigo/smtp.env` is ready for Chatwoot/EspoCRM system mail configuration in Plan 76-04.
- `/etc/prestigo/backup.env` is ready for Plan 76-05's `restic init` (which will append `RESTIC_PASSWORD`) and the nightly backup job.
- No blockers. The only outstanding manual item is the Hostinger token revocation noted above (owner action, not automatable — the token is not held by Claude after this session).

---
*Phase: 76-vps-infrastructure*
*Completed: 2026-09-28*

## Self-Check: PASSED

- FOUND: infra/vps/scripts/dns-zone-diff.sh
- FOUND: infra/vps/env/smtp.env.example
- FOUND: infra/vps/env/backup.env.example
- FOUND: infra/vps/runbooks/dns.md
- FOUND: .planning/phases/76-vps-infrastructure/evidence/dns-zone-before.json
- FOUND: .planning/phases/76-vps-infrastructure/evidence/dns-zone-after.json
- FOUND commit: 35b82bc2
- Re-ran all 3 plan `<verify>` blocks: dns-zone-diff added=2 removed=0 (PASS); dig chat/crm both 179.198.213.201 matching expected (PASS); stat 600 root on both env files + region-appropriate grep count 1 (PASS, per owner-approved US-East substitution documented above)
- Re-ran all acceptance criteria commands for Task 2: all PASS
