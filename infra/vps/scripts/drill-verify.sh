#!/usr/bin/env bash
# infra/vps/scripts/drill-verify.sh
#
# D-09 / Pitfall 14 integrity checker for Chatwoot + EspoCRM. Prints one
# "OK <check>" or "FAIL <check>: <reason>" line per check and exits 1 if any
# check FAILed (0 if all OK). Optionally writes the full result as JSON with
# --out FILE.
#
# Modes:
#   --baseline                         production, READ-ONLY. Counts,
#     orphan checks, display_id sequence correctness, canary presence and
#     checksum in both apps. Safe to run on production at any time and
#     inside the nightly backup (via backup.sh's pre-dump hook).
#   --drill --baseline-file FILE        disposable drill host ONLY (refuses
#     on hostname prestigo-vps). All --baseline checks, plus: every count
#     >= the baseline file's count, canary IDs equal the baseline, a
#     functional insert-then-destroy of one conversation in the canary
#     inbox (display_id must equal previous max + 1), an egress probe that
#     must FAIL (drill host network must be blocked), and app HTTP checks.
#
# Usage:
#   sudo bash drill-verify.sh --baseline --out /var/backups/prestigo/dumps/drill-baseline.json
#   sudo bash drill-verify.sh --drill --baseline-file /path/to/drill-baseline.json
#
set -Eeuo pipefail

CANARY_FILE="${CANARY_FILE:-/opt/prestigo/drill/canary.txt}"
CANARY_INBOX_NAME="Restore drill canary"
ESPO_ACCOUNT_NAME="Restore Drill Canary"
ESPO_DOCUMENT_NAME="Restore drill canary file"

MODE=""
OUT_FILE=""
BASELINE_FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --baseline)
      MODE="baseline"
      shift
      ;;
    --drill)
      MODE="drill"
      shift
      ;;
    --baseline-file)
      BASELINE_FILE="${2:-}"
      shift 2
      ;;
    --out)
      OUT_FILE="${2:-}"
      shift 2
      ;;
    *)
      echo "[drill-verify] unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [ -z "${MODE}" ]; then
  echo "[drill-verify] must pass --baseline or --drill" >&2
  exit 1
fi

if [ ! -f "${CANARY_FILE}" ]; then
  echo "[drill-verify] canary file not found: ${CANARY_FILE}" >&2
  exit 1
fi
CANARY_SHA256=$(sha256sum "${CANARY_FILE}" | cut -d' ' -f1)

if [ "${MODE}" = "drill" ]; then
  CURRENT_HOSTNAME="$(hostname)"
  if [ "${CURRENT_HOSTNAME}" = "prestigo-vps" ]; then
    echo "[drill-verify] refusing --drill on hostname prestigo-vps (production) - use --baseline instead" >&2
    exit 1
  fi
  if [ -z "${BASELINE_FILE}" ] || [ ! -f "${BASELINE_FILE}" ]; then
    echo "[drill-verify] --drill requires --baseline-file FILE (an existing file)" >&2
    exit 1
  fi
fi

FAILED=0
CHECKS_FILE=$(mktemp)
trap 'rm -f "${CHECKS_FILE}"' EXIT

record() {
  local name="$1" status="$2" detail="${3:-}"
  if [ "${status}" = "OK" ]; then
    echo "OK ${name}"
  else
    echo "FAIL ${name}: ${detail}"
    FAILED=1
  fi
  jq -nc --arg n "${name}" --arg s "${status}" --arg d "${detail}" '{name:$n,status:$s,detail:$d}' >> "${CHECKS_FILE}"
}

cw_psql() {
  docker exec chatwoot-postgres-1 psql -U postgres -d chatwoot_production -tAc "$1"
}

ESPO_ROOT_PW=$(grep '^MARIADB_ROOT_PASSWORD=' /etc/prestigo/espocrm.env | cut -d= -f2-)
espo_sql() {
  docker exec -e MYSQL_PWD="${ESPO_ROOT_PW}" espocrm-db-1 mariadb -N -B -u root espocrm -e "$1"
}

# ============================================================================
# Chatwoot: counts
# ============================================================================
CW_ACCOUNTS=$(cw_psql "select count(*) from accounts;")
CW_USERS=$(cw_psql "select count(*) from users;")
CW_INBOXES=$(cw_psql "select count(*) from inboxes;")
CW_CONTACTS=$(cw_psql "select count(*) from contacts;")
CW_CONTACT_INBOXES=$(cw_psql "select count(*) from contact_inboxes;")
CW_CONVERSATIONS=$(cw_psql "select count(*) from conversations;")
CW_MESSAGES=$(cw_psql "select count(*) from messages;")
CW_ATTACHMENTS=$(cw_psql "select count(*) from attachments;")
CW_BLOBS=$(cw_psql "select count(*) from active_storage_blobs;")
record "chatwoot-counts" OK "accounts=${CW_ACCOUNTS} users=${CW_USERS} inboxes=${CW_INBOXES} contacts=${CW_CONTACTS} contact_inboxes=${CW_CONTACT_INBOXES} conversations=${CW_CONVERSATIONS} messages=${CW_MESSAGES} attachments=${CW_ATTACHMENTS} active_storage_blobs=${CW_BLOBS}"

# ============================================================================
# Chatwoot: orphan checks (Pitfall 14)
# ============================================================================
ORPHAN_CONV=$(cw_psql "select count(*) from conversations c left join contact_inboxes ci on ci.id = c.contact_inbox_id where c.contact_inbox_id is not null and ci.id is null;")
[ "${ORPHAN_CONV}" = "0" ] && record "chatwoot-orphan-conversations" OK || record "chatwoot-orphan-conversations" FAIL "${ORPHAN_CONV} conversations with a dangling contact_inbox_id"

ORPHAN_MSG=$(cw_psql "select count(*) from messages m left join conversations c on c.id = m.conversation_id where c.id is null;")
[ "${ORPHAN_MSG}" = "0" ] && record "chatwoot-orphan-messages" OK || record "chatwoot-orphan-messages" FAIL "${ORPHAN_MSG} messages without a conversation"

ORPHAN_ATT=$(cw_psql "select count(*) from attachments a left join messages m on m.id = a.message_id where m.id is null;")
[ "${ORPHAN_ATT}" = "0" ] && record "chatwoot-orphan-attachments" OK || record "chatwoot-orphan-attachments" FAIL "${ORPHAN_ATT} attachments without a message"

ORPHAN_ASA=$(cw_psql "select count(*) from active_storage_attachments asa left join active_storage_blobs b on b.id = asa.blob_id where b.id is null;")
[ "${ORPHAN_ASA}" = "0" ] && record "chatwoot-orphan-storage-attachments" OK || record "chatwoot-orphan-storage-attachments" FAIL "${ORPHAN_ASA} active_storage_attachments without a blob"

# ============================================================================
# Chatwoot: per-account display_id sequence correctness
# ============================================================================
SEQ_BAD=$(cw_psql "
select count(*) from (
  select a.id as account_id,
         coalesce((select max(display_id) from conversations where account_id = a.id), 0) as max_did,
         coalesce((select last_value from pg_sequences where sequencename = 'conv_dpid_seq_' || a.id), 0) as seq_val
  from accounts a
) s where seq_val < max_did;
")
[ "${SEQ_BAD}" = "0" ] && record "chatwoot-display-id-sequences" OK || record "chatwoot-display-id-sequences" FAIL "${SEQ_BAD} accounts where conv_dpid_seq lags max(display_id)"

# ============================================================================
# Chatwoot: canary presence + checksum
# ============================================================================
CANARY_CONV_ID=$(cw_psql "select c.id from conversations c join inboxes i on i.id = c.inbox_id where i.name = '${CANARY_INBOX_NAME}' order by c.id desc limit 1;")
CANARY_ACCOUNT_ID=""
CANARY_CONV_DISPLAY_ID=""
CANARY_MSG_ID=""
CANARY_ATTACHMENT_ID=""
CANARY_BLOB_KEY=""
if [ -n "${CANARY_CONV_ID}" ]; then
  CANARY_ACCOUNT_ID=$(cw_psql "select account_id from conversations where id = ${CANARY_CONV_ID};")
  CANARY_CONV_DISPLAY_ID=$(cw_psql "select display_id from conversations where id = ${CANARY_CONV_ID};")
  CANARY_MSG_ID=$(cw_psql "select id from messages where conversation_id = ${CANARY_CONV_ID} order by id asc limit 1;")
fi
if [ -n "${CANARY_MSG_ID}" ]; then
  CANARY_ATTACHMENT_ID=$(cw_psql "select id from attachments where message_id = ${CANARY_MSG_ID} limit 1;")
fi
if [ -n "${CANARY_ATTACHMENT_ID}" ]; then
  CANARY_BLOB_KEY=$(cw_psql "select b.key from active_storage_attachments asa join active_storage_blobs b on b.id = asa.blob_id where asa.record_type = 'Attachment' and asa.record_id = ${CANARY_ATTACHMENT_ID} limit 1;")
fi

if [ -n "${CANARY_CONV_ID}" ] && [ -n "${CANARY_MSG_ID}" ] && [ -n "${CANARY_ATTACHMENT_ID}" ] && [ -n "${CANARY_BLOB_KEY}" ]; then
  record "chatwoot-canary-present" OK "conversation_display_id=${CANARY_CONV_DISPLAY_ID} message_id=${CANARY_MSG_ID}"
else
  record "chatwoot-canary-present" FAIL "canary conversation/message/attachment/blob not found in inbox '${CANARY_INBOX_NAME}'"
fi

CW_CANARY_SHA=""
if [ -n "${CANARY_BLOB_KEY}" ]; then
  CHATWOOT_STORAGE_MOUNT=$(docker volume inspect chatwoot_storage_data --format '{{.Mountpoint}}' 2>/dev/null || true)
  if [ -n "${CHATWOOT_STORAGE_MOUNT}" ]; then
    SHARD1=${CANARY_BLOB_KEY:0:2}
    SHARD2=${CANARY_BLOB_KEY:2:2}
    BLOB_PATH="${CHATWOOT_STORAGE_MOUNT}/${SHARD1}/${SHARD2}/${CANARY_BLOB_KEY}"
    if [ -f "${BLOB_PATH}" ]; then
      CW_CANARY_SHA=$(sha256sum "${BLOB_PATH}" | cut -d' ' -f1)
      if [ "${CW_CANARY_SHA}" = "${CANARY_SHA256}" ]; then
        record "chatwoot-canary-checksum" OK
      else
        record "chatwoot-canary-checksum" FAIL "blob ${BLOB_PATH} sha256 ${CW_CANARY_SHA} != canary.txt ${CANARY_SHA256}"
      fi
    else
      record "chatwoot-canary-checksum" FAIL "blob file not found at ${BLOB_PATH}"
    fi
  else
    record "chatwoot-canary-checksum" FAIL "could not resolve chatwoot_storage_data volume mountpoint"
  fi
else
  record "chatwoot-canary-checksum" FAIL "no canary blob key to check (canary not present)"
fi

# ============================================================================
# EspoCRM: counts
# ============================================================================
ESPO_ACCOUNT_CNT=$(espo_sql "select count(*) from account where deleted=0;")
ESPO_DOCUMENT_CNT=$(espo_sql "select count(*) from document where deleted=0;")
ESPO_ATTACHMENT_CNT=$(espo_sql "select count(*) from attachment where deleted=0;")
ESPO_USER_CNT=$(espo_sql "select count(*) from user where deleted=0;")
record "espocrm-counts" OK "account=${ESPO_ACCOUNT_CNT} document=${ESPO_DOCUMENT_CNT} attachment=${ESPO_ATTACHMENT_CNT} user=${ESPO_USER_CNT}"

ESPO_DOC_MISSING_ATT=$(espo_sql "select count(*) from document d left join attachment a on a.id = d.file_id and a.deleted = 0 where d.deleted = 0 and d.file_id is not null and a.id is null;")
[ "${ESPO_DOC_MISSING_ATT}" = "0" ] && record "espocrm-documents-missing-attachment" OK || record "espocrm-documents-missing-attachment" FAIL "${ESPO_DOC_MISSING_ATT} documents whose file attachment row is missing"

# ============================================================================
# EspoCRM: canary presence + checksum
# ============================================================================
ESPO_CANARY_ACCOUNT_ID=$(espo_sql "select id from account where deleted=0 and name='${ESPO_ACCOUNT_NAME}' order by id desc limit 1;")
ESPO_CANARY_DOC_ID=$(espo_sql "select id from document where deleted=0 and name='${ESPO_DOCUMENT_NAME}' order by id desc limit 1;")
ESPO_CANARY_ATTACHMENT_ID=""
ESPO_CANARY_LINK_CNT="0"
if [ -n "${ESPO_CANARY_DOC_ID}" ]; then
  ESPO_CANARY_ATTACHMENT_ID=$(espo_sql "select file_id from document where deleted=0 and id='${ESPO_CANARY_DOC_ID}';")
fi
if [ -n "${ESPO_CANARY_ACCOUNT_ID}" ] && [ -n "${ESPO_CANARY_DOC_ID}" ]; then
  ESPO_CANARY_LINK_CNT=$(espo_sql "select count(*) from account_document where deleted=0 and account_id='${ESPO_CANARY_ACCOUNT_ID}' and document_id='${ESPO_CANARY_DOC_ID}';")
fi

if [ -n "${ESPO_CANARY_ACCOUNT_ID}" ] && [ -n "${ESPO_CANARY_DOC_ID}" ] && [ -n "${ESPO_CANARY_ATTACHMENT_ID}" ] && [ "${ESPO_CANARY_LINK_CNT}" != "0" ]; then
  record "espocrm-canary-present" OK "account_id=${ESPO_CANARY_ACCOUNT_ID} document_id=${ESPO_CANARY_DOC_ID}"
else
  record "espocrm-canary-present" FAIL "canary Account/Document/Attachment/link not found (account=${ESPO_CANARY_ACCOUNT_ID:-<none>} document=${ESPO_CANARY_DOC_ID:-<none>} attachment=${ESPO_CANARY_ATTACHMENT_ID:-<none>} link_count=${ESPO_CANARY_LINK_CNT})"
fi

ESPO_CANARY_SHA=""
if [ -n "${ESPO_CANARY_ATTACHMENT_ID}" ]; then
  ESPO_APP_DATA_MOUNT=$(docker volume inspect espocrm_app_data --format '{{.Mountpoint}}' 2>/dev/null || true)
  if [ -n "${ESPO_APP_DATA_MOUNT}" ]; then
    UPLOAD_PATH="${ESPO_APP_DATA_MOUNT}/upload/${ESPO_CANARY_ATTACHMENT_ID}"
    if [ -f "${UPLOAD_PATH}" ]; then
      ESPO_CANARY_SHA=$(sha256sum "${UPLOAD_PATH}" | cut -d' ' -f1)
      if [ "${ESPO_CANARY_SHA}" = "${CANARY_SHA256}" ]; then
        record "espocrm-canary-checksum" OK
      else
        record "espocrm-canary-checksum" FAIL "upload ${UPLOAD_PATH} sha256 ${ESPO_CANARY_SHA} != canary.txt ${CANARY_SHA256}"
      fi
    else
      record "espocrm-canary-checksum" FAIL "upload file not found at ${UPLOAD_PATH}"
    fi
  else
    record "espocrm-canary-checksum" FAIL "could not resolve espocrm_app_data volume mountpoint"
  fi
else
  record "espocrm-canary-checksum" FAIL "no canary attachment id to check (canary not present)"
fi

# ============================================================================
# --drill-only checks
# ============================================================================
if [ "${MODE}" = "drill" ]; then
  compare_ge() {
    local name="$1" current="$2" base="$3"
    if [ -z "${base}" ] || [ "${base}" = "null" ]; then
      record "drill-count-${name}" FAIL "baseline value missing for ${name}"
      return
    fi
    if [ "${current}" -ge "${base}" ]; then
      record "drill-count-${name}" OK "current=${current} baseline=${base}"
    else
      record "drill-count-${name}" FAIL "current=${current} < baseline=${base}"
    fi
  }

  compare_ge "chatwoot-accounts" "${CW_ACCOUNTS}" "$(jq -r '.chatwoot.counts.accounts // empty' "${BASELINE_FILE}")"
  compare_ge "chatwoot-users" "${CW_USERS}" "$(jq -r '.chatwoot.counts.users // empty' "${BASELINE_FILE}")"
  compare_ge "chatwoot-inboxes" "${CW_INBOXES}" "$(jq -r '.chatwoot.counts.inboxes // empty' "${BASELINE_FILE}")"
  compare_ge "chatwoot-contacts" "${CW_CONTACTS}" "$(jq -r '.chatwoot.counts.contacts // empty' "${BASELINE_FILE}")"
  compare_ge "chatwoot-contact-inboxes" "${CW_CONTACT_INBOXES}" "$(jq -r '.chatwoot.counts.contact_inboxes // empty' "${BASELINE_FILE}")"
  compare_ge "chatwoot-conversations" "${CW_CONVERSATIONS}" "$(jq -r '.chatwoot.counts.conversations // empty' "${BASELINE_FILE}")"
  compare_ge "chatwoot-messages" "${CW_MESSAGES}" "$(jq -r '.chatwoot.counts.messages // empty' "${BASELINE_FILE}")"
  compare_ge "chatwoot-attachments" "${CW_ATTACHMENTS}" "$(jq -r '.chatwoot.counts.attachments // empty' "${BASELINE_FILE}")"
  compare_ge "chatwoot-blobs" "${CW_BLOBS}" "$(jq -r '.chatwoot.counts.active_storage_blobs // empty' "${BASELINE_FILE}")"
  compare_ge "espocrm-account" "${ESPO_ACCOUNT_CNT}" "$(jq -r '.espocrm.counts.account // empty' "${BASELINE_FILE}")"
  compare_ge "espocrm-document" "${ESPO_DOCUMENT_CNT}" "$(jq -r '.espocrm.counts.document // empty' "${BASELINE_FILE}")"
  compare_ge "espocrm-attachment" "${ESPO_ATTACHMENT_CNT}" "$(jq -r '.espocrm.counts.attachment // empty' "${BASELINE_FILE}")"
  compare_ge "espocrm-user" "${ESPO_USER_CNT}" "$(jq -r '.espocrm.counts.user // empty' "${BASELINE_FILE}")"

  BASE_CONV_DISPLAY_ID=$(jq -r '.chatwoot.canary.conversation_display_id // empty' "${BASELINE_FILE}")
  BASE_MSG_ID=$(jq -r '.chatwoot.canary.message_id // empty' "${BASELINE_FILE}")
  if [ "${CANARY_CONV_DISPLAY_ID}" = "${BASE_CONV_DISPLAY_ID}" ] && [ "${CANARY_MSG_ID}" = "${BASE_MSG_ID}" ] && [ -n "${CANARY_CONV_DISPLAY_ID}" ]; then
    record "drill-canary-ids-match" OK
  else
    record "drill-canary-ids-match" FAIL "current conversation_display_id=${CANARY_CONV_DISPLAY_ID:-<none>}/message_id=${CANARY_MSG_ID:-<none>} != baseline ${BASE_CONV_DISPLAY_ID:-<none>}/${BASE_MSG_ID:-<none>}"
  fi

  BASE_ESPO_ACCOUNT_ID=$(jq -r '.espocrm.canary.account_id // empty' "${BASELINE_FILE}")
  BASE_ESPO_DOC_ID=$(jq -r '.espocrm.canary.document_id // empty' "${BASELINE_FILE}")
  if [ "${ESPO_CANARY_ACCOUNT_ID}" = "${BASE_ESPO_ACCOUNT_ID}" ] && [ "${ESPO_CANARY_DOC_ID}" = "${BASE_ESPO_DOC_ID}" ] && [ -n "${ESPO_CANARY_ACCOUNT_ID}" ]; then
    record "drill-espocrm-canary-ids-match" OK
  else
    record "drill-espocrm-canary-ids-match" FAIL "current account_id=${ESPO_CANARY_ACCOUNT_ID:-<none>}/document_id=${ESPO_CANARY_DOC_ID:-<none>} != baseline ${BASE_ESPO_ACCOUNT_ID:-<none>}/${BASE_ESPO_DOC_ID:-<none>}"
  fi

  # Functional insert: one conversation in the canary inbox, display_id must be previous max + 1, then destroy it.
  if [ -n "${CANARY_ACCOUNT_ID}" ]; then
    CANARY_INBOX_ID=$(cw_psql "select i.id from inboxes i where i.name = '${CANARY_INBOX_NAME}' and i.account_id = ${CANARY_ACCOUNT_ID} limit 1;")
    PREV_MAX_DID=$(cw_psql "select coalesce(max(display_id),0) from conversations where account_id = ${CANARY_ACCOUNT_ID};")
    # set +e around this command substitution: Conversation.create! requires an
    # existing contact_inbox association (Chatwoot validates "Contact inbox must
    # exist"), and a `VAR=$(docker exec ...)` assignment that fails still trips
    # `set -e` at the top of this script even though it isn't inside an `if` -
    # that silently killed the ENTIRE drill-verify run (no FAIL line at all,
    # stderr already redirected to /dev/null to suppress Sidekiq client noise)
    # the first time this ran for real, live, in Plan 76-09. Captured explicitly
    # so a future regression here always produces a FAIL line instead of an
    # unexplained early exit.
    set +e
    INSERT_RESULT=$(docker exec -i -e CANARY_INBOX_ID="${CANARY_INBOX_ID}" chatwoot-rails-1 bundle exec rails runner - 2>/dev/null <<'RUBY'
inbox = Inbox.find(ENV.fetch("CANARY_INBOX_ID"))
contact = inbox.account.contacts.find_by(name: "Restore Drill Canary") ||
          inbox.account.contacts.create!(name: "Restore Drill Canary (functional test)")
contact_inbox = ContactInbox.find_by(contact_id: contact.id, inbox_id: inbox.id) ||
                ContactInbox.create!(contact_id: contact.id, inbox_id: inbox.id, source_id: SecureRandom.uuid)
conv = Conversation.create!(account_id: inbox.account_id, inbox_id: inbox.id, contact_id: contact.id, contact_inbox_id: contact_inbox.id, status: :open)
did = conv.display_id
conv.destroy!
puts "DRILL_RESULT display_id=#{did}"
RUBY
)
    INSERT_EXIT=$?
    set -e
    NEW_DID=$(printf '%s' "${INSERT_RESULT}" | grep '^DRILL_RESULT ' | sed -n 's/.*display_id=\([0-9]*\).*/\1/p')
    EXPECTED_DID=$((PREV_MAX_DID + 1))
    if [ "${INSERT_EXIT}" -eq 0 ] && [ "${NEW_DID}" = "${EXPECTED_DID}" ]; then
      record "drill-functional-insert" OK "display_id=${NEW_DID}"
    else
      record "drill-functional-insert" FAIL "expected display_id ${EXPECTED_DID}, got ${NEW_DID:-<none>} (docker exec exit=${INSERT_EXIT})"
    fi
  else
    record "drill-functional-insert" FAIL "no canary account id resolved - cannot run functional insert test"
  fi

  # Egress must be BLOCKED on the drill host (chatwoot-rails-1 has no curl - use wget).
  if docker exec chatwoot-rails-1 wget -q -T 5 -O /dev/null https://example.com 2>/dev/null; then
    record "drill-egress-blocked" FAIL "egress to https://example.com succeeded from inside chatwoot-rails-1 - drill host must block outbound (D-09)"
  else
    record "drill-egress-blocked" OK
  fi

  if curl -fsS -m 10 http://127.0.0.1:3000/api >/dev/null 2>&1; then
    record "drill-chatwoot-http" OK
  else
    record "drill-chatwoot-http" FAIL "http://127.0.0.1:3000/api not reachable"
  fi

  ESPO_HTTP_BODY=$(curl -fsS -m 10 http://127.0.0.1:8080/ 2>/dev/null || true)
  if grep -qi espo <<< "${ESPO_HTTP_BODY}"; then
    record "drill-espocrm-http" OK
  else
    record "drill-espocrm-http" FAIL "http://127.0.0.1:8080/ did not return an EspoCRM login marker"
  fi
fi

# ============================================================================
# Assemble JSON result
# ============================================================================
CHECKS_JSON=$(jq -s '.' "${CHECKS_FILE}")

RESULT_JSON=$(jq -n \
  --arg mode "${MODE}" \
  --arg ts "$(date -u +%FT%TZ)" \
  --arg hostname "$(hostname)" \
  --arg canarySha256 "${CANARY_SHA256}" \
  --argjson cwAccounts "${CW_ACCOUNTS}" \
  --argjson cwUsers "${CW_USERS}" \
  --argjson cwInboxes "${CW_INBOXES}" \
  --argjson cwContacts "${CW_CONTACTS}" \
  --argjson cwContactInboxes "${CW_CONTACT_INBOXES}" \
  --argjson cwConversations "${CW_CONVERSATIONS}" \
  --argjson cwMessages "${CW_MESSAGES}" \
  --argjson cwAttachments "${CW_ATTACHMENTS}" \
  --argjson cwBlobs "${CW_BLOBS}" \
  --argjson orphanConv "${ORPHAN_CONV}" \
  --argjson orphanMsg "${ORPHAN_MSG}" \
  --argjson orphanAtt "${ORPHAN_ATT}" \
  --argjson orphanAsa "${ORPHAN_ASA}" \
  --arg cwCanaryConvDisplayId "${CANARY_CONV_DISPLAY_ID}" \
  --arg cwCanaryMessageId "${CANARY_MSG_ID}" \
  --arg cwCanaryBlobKey "${CANARY_BLOB_KEY}" \
  --arg cwCanarySha "${CW_CANARY_SHA}" \
  --argjson espoAccount "${ESPO_ACCOUNT_CNT}" \
  --argjson espoDocument "${ESPO_DOCUMENT_CNT}" \
  --argjson espoAttachment "${ESPO_ATTACHMENT_CNT}" \
  --argjson espoUser "${ESPO_USER_CNT}" \
  --argjson espoDocMissingAtt "${ESPO_DOC_MISSING_ATT}" \
  --arg espoCanaryAccountId "${ESPO_CANARY_ACCOUNT_ID}" \
  --arg espoCanaryDocId "${ESPO_CANARY_DOC_ID}" \
  --arg espoCanaryAttachmentId "${ESPO_CANARY_ATTACHMENT_ID}" \
  --arg espoCanarySha "${ESPO_CANARY_SHA}" \
  --argjson checks "${CHECKS_JSON}" \
  --argjson ok "$([ "${FAILED}" -eq 0 ] && echo true || echo false)" \
  '{
    mode: $mode,
    timestamp: $ts,
    hostname: $hostname,
    canarySha256: $canarySha256,
    chatwoot: {
      counts: {accounts:$cwAccounts, users:$cwUsers, inboxes:$cwInboxes, contacts:$cwContacts, contact_inboxes:$cwContactInboxes, conversations:$cwConversations, messages:$cwMessages, attachments:$cwAttachments, active_storage_blobs:$cwBlobs},
      orphans: {conversations_missing_contact_inbox:$orphanConv, messages_missing_conversation:$orphanMsg, attachments_missing_message:$orphanAtt, active_storage_attachments_missing_blob:$orphanAsa},
      canary: {conversation_display_id:$cwCanaryConvDisplayId, message_id:$cwCanaryMessageId, blob_key:$cwCanaryBlobKey, sha256:$cwCanarySha}
    },
    espocrm: {
      counts: {account:$espoAccount, document:$espoDocument, attachment:$espoAttachment, user:$espoUser},
      documents_missing_attachment: $espoDocMissingAtt,
      canary: {account_id:$espoCanaryAccountId, document_id:$espoCanaryDocId, attachment_id:$espoCanaryAttachmentId, sha256:$espoCanarySha}
    },
    checks: $checks,
    ok: $ok
  }')

if [ -n "${OUT_FILE}" ]; then
  printf '%s\n' "${RESULT_JSON}" > "${OUT_FILE}"
  echo "[drill-verify] wrote ${OUT_FILE}"
else
  printf '%s\n' "${RESULT_JSON}"
fi

exit "${FAILED}"
