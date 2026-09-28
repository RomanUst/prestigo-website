#!/usr/bin/env sh
# Phase 76 D-15 — proves .husky/pre-commit blocks infra/vps secrets without
# ever touching the real git index. Seeds a temporary GIT_INDEX_FILE from
# HEAD via `git read-tree`, force-adds one probe file into that temp index,
# then runs the real hook script against it. Nothing here stages anything
# in the real index or working tree beyond a throwaway probe directory that
# is removed in the exit trap.
set -eu

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

PROBE_DIR="infra/vps/.gate-probe-$$"
CHATWOOT_PROBE_DIR="infra/chatwoot/.gate-probe-$$"
TMP_INDEX=$(mktemp -t gsd-secret-gate-index.XXXXXX)
FAIL=0

cleanup() {
  rm -rf "$PROBE_DIR"
  rm -rf "$CHATWOOT_PROBE_DIR"
  rm -f "$TMP_INDEX"
}
trap cleanup EXIT INT TERM

mkdir -p "$PROBE_DIR"

reset_index() {
  GIT_INDEX_FILE="$TMP_INDEX" git read-tree HEAD
}

# expect: "block" (hook must exit non-zero and print $needle) or
#         "allow" (hook must exit zero)
run_probe() {
  name=$1
  file=$2
  expect=$3
  needle=${4:-}

  reset_index
  GIT_INDEX_FILE="$TMP_INDEX" git add -f "$file" >/dev/null 2>&1

  set +e
  HOOK_OUTPUT=$(GIT_INDEX_FILE="$TMP_INDEX" sh .husky/pre-commit 2>&1)
  HOOK_EXIT=$?
  set -e

  if [ "$expect" = "block" ]; then
    if [ "$HOOK_EXIT" -ne 0 ] && printf '%s' "$HOOK_OUTPUT" | grep -qF "$needle"; then
      echo "PROBE $name: BLOCKED"
    else
      echo "PROBE $name: NOT BLOCKED"
      echo "$HOOK_OUTPUT" >&2
      FAIL=1
    fi
  else
    if [ "$HOOK_EXIT" -eq 0 ]; then
      echo "PROBE $name: ALLOWED"
    else
      echo "PROBE $name: NOT BLOCKED"
      echo "$HOOK_OUTPUT" >&2
      FAIL=1
    fi
  fi
}

# --- Probe A: staged .env file must be blocked ---
printf 'FAKE=placeholder-value\n' > "$PROBE_DIR/probe.env"
run_probe "env-file" "$PROBE_DIR/probe.env" "block" "ERROR: .env file(s) staged"

# --- Probe B: added line shaped like a live secret must be blocked. The
# secret-shaped literal is assembled at runtime from two fragments plus 24
# random alphanumerics from /dev/urandom, so it never exists as a literal in
# any tracked file (including this script). ---
FRAG1='sk_'
FRAG2='live_'
RAND_SUFFIX=$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 24)
SECRET_LINE="FAKE_SECRET=${FRAG1}${FRAG2}${RAND_SUFFIX}"
printf '#!/usr/bin/env sh\n%s\n' "$SECRET_LINE" > "$PROBE_DIR/probe-secret.sh"
run_probe "secret-line" "$PROBE_DIR/probe-secret.sh" "block" "ERROR: Possible secret"

# --- Probe C: a clean .env.example with only empty KEY= lines must pass ---
printf 'RESTIC_PASSWORD=\nB2_ACCOUNT_ID=\nB2_ACCOUNT_KEY=\n' > "$PROBE_DIR/probe.env.example"
run_probe "clean-example" "$PROBE_DIR/probe.env.example" "allow"

# --- Probe D (WR-02): a Phase 76 VPS secret shape added to SECRET_RE
# (Backblaze B2 application key, "K00" + digit + 20+ alnum) must be
# blocked. Assembled at runtime from fragments + random suffix so it never
# exists as a literal in any tracked file. ---
B2_FRAG='K005'
B2_RAND_SUFFIX=$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 24)
B2_SECRET_LINE="B2_ACCOUNT_KEY=${B2_FRAG}${B2_RAND_SUFFIX}"
printf '#!/usr/bin/env sh\n%s\n' "$B2_SECRET_LINE" > "$PROBE_DIR/probe-b2-key.sh"
run_probe "b2-application-key" "$PROBE_DIR/probe-b2-key.sh" "block" "ERROR: Possible secret"

# --- Probe E (WR-02): a Phase 76 .env.example KEY name (POSTGRES_PASSWORD)
# assigned a real-shaped, non-empty value in a *non*-.env, non-.example
# tracked file (e.g. a runbook .md or a one-off script) must be blocked —
# this is the gap WR-02 closed: SECRET_RE alone never recognized this
# shape. Assembled at runtime; never a literal in any tracked file. ---
PW_RAND_SUFFIX=$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 24)
PW_LINE="POSTGRES_PASSWORD=${PW_RAND_SUFFIX}"
printf '# notes\n%s\n' "$PW_LINE" > "$PROBE_DIR/probe-infra-key.md"
run_probe "infra-env-key-value" "$PROBE_DIR/probe-infra-key.md" "block" "ERROR: Possible infra/vps secret"

# --- Probe F (WR-02 regression guard): the same KEY name used as a `grep`/
# `awk` search PATTERN (never a real value — matches this repo's own
# `grep '^KEY=' file | cut -d= -f2-` idiom used throughout infra/vps/) must
# still be ALLOWED, proving the false-positive exclusion added for WR-02
# does not regress. ---
printf "ROOT_PW=\$(grep '^MARIADB_ROOT_PASSWORD=' /etc/prestigo/espocrm.env | cut -d= -f2-)\n" > "$PROBE_DIR/probe-grep-pattern.sh"
run_probe "infra-env-key-search-pattern" "$PROBE_DIR/probe-grep-pattern.sh" "allow"

# --- Probe G (Phase 77 D-18): a Chatwoot template source file containing a
# currency token must be blocked. The token is assembled at runtime from
# fragments so the literal never exists in a tracked file (including this
# script). The price guard scans the WORKING TREE (not the staged index),
# so the file only needs to exist on disk under infra/chatwoot for the hook
# to see it — run_probe's git add -f is harmless but not what makes this
# probe work. ---
mkdir -p "$CHATWOOT_PROBE_DIR"
CUR_FRAG1='EU'
CUR_FRAG2='R'
CUR_TOKEN="${CUR_FRAG1}${CUR_FRAG2} 99"
printf '{"topic":"probe","responses":{"en":"Total %s"}}\n' "$CUR_TOKEN" > "$CHATWOOT_PROBE_DIR/probe-price.json"
run_probe "template-price" "$CHATWOOT_PROBE_DIR/probe-price.json" "block" "Price or currency found in Chatwoot template source"

# --- Probe H (Phase 77 D-18): a clean template JSON (no price/currency
# token) must be ALLOWED. Probe G's file is removed first — the price guard
# greps infra/chatwoot recursively, so a leftover probe-price.json anywhere
# under that tree would make this probe fail for the wrong reason. ---
rm -f "$CHATWOOT_PROBE_DIR/probe-price.json"
printf '{"topic":"probe","responses":{"en":"Hello there, no price mentioned here."}}\n' > "$CHATWOOT_PROBE_DIR/probe-clean.json"
run_probe "template-clean" "$CHATWOOT_PROBE_DIR/probe-clean.json" "allow"

exit "$FAIL"
