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
TMP_INDEX=$(mktemp -t gsd-secret-gate-index.XXXXXX)
FAIL=0

cleanup() {
  rm -rf "$PROBE_DIR"
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

exit "$FAIL"
