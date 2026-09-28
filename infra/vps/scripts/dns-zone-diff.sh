#!/usr/bin/env bash
# infra/vps/scripts/dns-zone-diff.sh BEFORE.json AFTER.json
#
# Record-level diff of two Hostinger DNS zone JSON snapshots (D-20 evidence).
# Each snapshot is the raw GET response from
# https://developers.hostinger.com/api/dns/v1/zones/<domain> — an array of
# {name, type, ttl, records: [{content, is_disabled}, ...]}.
#
# Flattens each snapshot to name|type|content tuples (one line per record
# content, since a single name+type can carry multiple records), diffs the
# two tuple sets, and prints:
#   +name type content   (present in AFTER, not in BEFORE)
#   -name type content   (present in BEFORE, not in AFTER)
# followed by a final line: added=N removed=M
#
# Exit code is always 0 — callers assert on the added=/removed= counts, not
# on this script's exit status, so a caller can always read the printed
# counts even when the counts are non-zero (that IS the interesting result).
set -u

BEFORE="${1:-}"
AFTER="${2:-}"

if [ -z "$BEFORE" ] || [ -z "$AFTER" ]; then
  echo "usage: dns-zone-diff.sh BEFORE.json AFTER.json" >&2
  echo "added=0 removed=0"
  exit 0
fi

flatten() {
  # name|type|content, one line per record content, sorted for stable diffing.
  # WR-07: a missing file, invalid JSON, or a shape that doesn't match the
  # expected zone-snapshot structure must fail LOUDLY here rather than being
  # silently swallowed into an empty tuple set - two empty sets produce
  # added=0 removed=0, indistinguishable from "the zone genuinely didn't
  # change", which is exactly the wrong failure mode for a script whose job
  # is to catch unintended DNS drift.
  if [ ! -f "$1" ]; then
    echo "dns-zone-diff: input file not found: $1" >&2
    exit 2
  fi
  # Without `set -o pipefail`, `jq ... | sort -u`'s exit status would be
  # sort's (which almost always succeeds even on empty input) - check jq's
  # own exit status via PIPESTATUS instead of testing the pipeline itself.
  jq -r '.[] | .name as $n | .type as $t | (.records // [])[] | "\($n)|\($t)|\(.content)"' "$1" | sort -u
  if [ "${PIPESTATUS[0]}" -ne 0 ]; then
    echo "dns-zone-diff: failed to parse $1 as a DNS zone snapshot (invalid JSON or unexpected shape) - jq's error is above" >&2
    exit 2
  fi
}

BEFORE_TUPLES=$(flatten "$BEFORE") || exit $?
AFTER_TUPLES=$(flatten "$AFTER") || exit $?

ADDED=0
REMOVED=0

# Lines only in AFTER (added)
while IFS= read -r line; do
  [ -z "$line" ] && continue
  echo "+${line}"
  ADDED=$((ADDED + 1))
done <<EOF_ADDED
$(comm -13 <(printf '%s\n' "$BEFORE_TUPLES") <(printf '%s\n' "$AFTER_TUPLES"))
EOF_ADDED

# Lines only in BEFORE (removed)
while IFS= read -r line; do
  [ -z "$line" ] && continue
  echo "-${line}"
  REMOVED=$((REMOVED + 1))
done <<EOF_REMOVED
$(comm -23 <(printf '%s\n' "$BEFORE_TUPLES") <(printf '%s\n' "$AFTER_TUPLES"))
EOF_REMOVED

echo "added=${ADDED} removed=${REMOVED}"
exit 0
