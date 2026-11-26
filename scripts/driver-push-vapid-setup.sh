#!/usr/bin/env bash
# Phase 94 plan 94-05 (DCAB-12; D-09): create the VAPID key pair for driver web push and store it in the Vercel
# project prestigo-site, Production. Run it yourself in the Terminal panel from the repo root:
#
#   bash scripts/driver-push-vapid-setup.sh            # first time
#   bash scripts/driver-push-vapid-setup.sh --rotate   # replace existing keys
#
# The private key is generated in memory, piped straight to `vercel env add` and never printed or written to disk.
# Rotating invalidates every stored subscription: drivers must turn notifications on again.
set -euo pipefail

ROTATE="no"
if [ "${1:-}" = "--rotate" ]; then
  ROTATE="yes"
fi

if [ ! -f package.json ] || [ ! -d scripts ] || ! grep -q '"web-push"' package.json; then
  echo "Run this from the Prestigo repo root (package.json with web-push not found)." >&2
  exit 1
fi

if ! command -v vercel >/dev/null 2>&1; then
  echo "The vercel CLI is required: npm install -g vercel, then vercel login." >&2
  exit 1
fi

if [ ! -f .vercel/project.json ]; then
  echo "This folder is not linked to a Vercel project." >&2
  echo "run: vercel link --project prestigo-site" >&2
  exit 1
fi

EXISTING="$(vercel env ls production 2>/dev/null || true)"
HAS_KEYS="no"
for NAME in VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT; do
  if printf '%s\n' "$EXISTING" | grep -q "$NAME"; then
    HAS_KEYS="yes"
  fi
done

if [ "$HAS_KEYS" = "yes" ] && [ "$ROTATE" != "yes" ]; then
  echo "VAPID variables already exist in Production. Nothing changed." >&2
  echo "To replace them (every driver must then turn notifications on again): bash scripts/driver-push-vapid-setup.sh --rotate" >&2
  exit 1
fi

DEFAULT_SUBJECT="mailto:info@rideprestigo.com"
read -r -p "Contact subject for push services [${DEFAULT_SUBJECT}]: " SUBJECT
SUBJECT="${SUBJECT:-$DEFAULT_SUBJECT}"
case "$SUBJECT" in
  mailto:*|https://*) ;;
  *)
    echo "The subject must start with mailto: or https://" >&2
    exit 1
    ;;
esac

# Two lines on stdout, captured into a variable, never echoed.
PAIR="$(node -e "const k=require('web-push').generateVAPIDKeys();process.stdout.write(k.publicKey+'\n'+k.privateKey)")"
PUBLIC_KEY="$(printf '%s\n' "$PAIR" | sed -n '1p')"
PRIVATE_KEY="$(printf '%s\n' "$PAIR" | sed -n '2p')"
unset PAIR
if [ -z "$PUBLIC_KEY" ] || [ -z "$PRIVATE_KEY" ]; then
  echo "Key generation failed." >&2
  exit 1
fi

if [ "$HAS_KEYS" = "yes" ]; then
  for NAME in VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT; do
    vercel env rm "$NAME" production --yes >/dev/null 2>&1 || true
  done
fi

printf '%s' "$PUBLIC_KEY" | vercel env add VAPID_PUBLIC_KEY production >/dev/null
printf '%s' "$PRIVATE_KEY" | vercel env add VAPID_PRIVATE_KEY production >/dev/null
printf '%s' "$SUBJECT" | vercel env add VAPID_SUBJECT production >/dev/null
unset PRIVATE_KEY

echo "Stored in Vercel Production: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT"
echo "Public key: ${PUBLIC_KEY}"
echo "Redeploy production for the keys to take effect."
