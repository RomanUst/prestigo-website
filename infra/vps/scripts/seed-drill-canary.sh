#!/usr/bin/env bash
# infra/vps/scripts/seed-drill-canary.sh
#
# Idempotent seeding of the D-09 restore-drill canary into both apps:
#   Chatwoot: API inbox "Restore drill canary", contact "Restore Drill
#     Canary" (no email/phone), one resolved conversation with a message
#     carrying canary.txt as an attachment.
#   EspoCRM: Account "Restore Drill Canary", Document "Restore drill canary
#     file" whose file is canary.txt, linked to that Account.
#
# Every object is looked up by name first and only created when missing —
# safe to run repeatedly (a second run creates nothing).
#
# Usage: sudo bash seed-drill-canary.sh
#
# Env:
#   CANARY_FILE - path to the canary content file (default below)
#   ADMIN_EMAIL - Chatwoot admin email used to resolve the API token (default below)
#
set -Eeuo pipefail

CANARY_FILE="${CANARY_FILE:-/opt/prestigo/drill/canary.txt}"
ADMIN_EMAIL="${ADMIN_EMAIL:-info@rideprestigo.com}"

CANARY_INBOX_NAME="Restore drill canary"
CANARY_CONTACT_NAME="Restore Drill Canary"
ESPO_ACCOUNT_NAME="Restore Drill Canary"
ESPO_DOCUMENT_NAME="Restore drill canary file"

log() {
  echo "[canary] $*"
}

if [ ! -f "${CANARY_FILE}" ]; then
  echo "[canary] canary file not found: ${CANARY_FILE}" >&2
  exit 1
fi

INBOX_CREATED=false
CONTACT_CREATED=false
CONVERSATION_CREATED=false
ESPO_ACCOUNT_CREATED=false
ESPO_DOCUMENT_CREATED=false

# ============================================================================
# Chatwoot
# ============================================================================

log "resolving Chatwoot admin token + account id (rails runner; never printed)"
CW_RESOLVE=$(docker exec -i -e ADMIN_EMAIL="${ADMIN_EMAIL}" chatwoot-rails-1 bundle exec rails runner - <<'RUBY' 2>/dev/null
u = User.find_by(email: ENV.fetch("ADMIN_EMAIL"))
raise "admin user not found: #{ENV['ADMIN_EMAIL']}" unless u

account = u.accounts.first
raise "admin user has no account" unless account

token = u.access_token&.token
token ||= u.create_access_token&.token
raise "could not resolve access token" unless token

puts "CANARY_RESULT account_id=#{account.id} token=#{token}"
RUBY
)
CW_LINE=$(printf '%s\n' "${CW_RESOLVE}" | grep '^CANARY_RESULT ' || true)
unset CW_RESOLVE
if [ -z "${CW_LINE}" ]; then
  echo "[canary] failed to resolve Chatwoot admin token/account id" >&2
  exit 1
fi
ACCOUNT_ID=$(printf '%s' "${CW_LINE}" | sed -n 's/.*account_id=\([0-9][0-9]*\).*/\1/p')
CW_TOKEN=$(printf '%s' "${CW_LINE}" | sed -n 's/.*token=\([A-Za-z0-9_-]*\).*/\1/p')
unset CW_LINE
if [ -z "${ACCOUNT_ID}" ] || [ -z "${CW_TOKEN}" ]; then
  echo "[canary] could not parse Chatwoot account id / token" >&2
  exit 1
fi
log "Chatwoot account_id=${ACCOUNT_ID}"

CW_API="http://127.0.0.1:3000/api/v1/accounts/${ACCOUNT_ID}"
CW_AUTH_HEADER="api_access_token: ${CW_TOKEN}"

# --- inbox ---
INBOXES_JSON=$(curl -fsS -m 15 -H "${CW_AUTH_HEADER}" "${CW_API}/inboxes")
INBOX_ID=$(printf '%s' "${INBOXES_JSON}" | jq -r --arg n "${CANARY_INBOX_NAME}" '.payload[] | select(.name==$n) | .id' | head -1)
if [ -z "${INBOX_ID}" ] || [ "${INBOX_ID}" = "null" ]; then
  CREATE_JSON=$(curl -fsS -m 15 -H "${CW_AUTH_HEADER}" -H "Content-Type: application/json" \
    -d "{\"name\":\"${CANARY_INBOX_NAME}\",\"channel\":{\"type\":\"api\"}}" \
    "${CW_API}/inboxes")
  INBOX_ID=$(printf '%s' "${CREATE_JSON}" | jq -r '.id')
  INBOX_CREATED=true
  log "created Chatwoot inbox id=${INBOX_ID}"
else
  log "Chatwoot inbox already exists id=${INBOX_ID}"
fi
if [ -z "${INBOX_ID}" ] || [ "${INBOX_ID}" = "null" ]; then
  echo "[canary] could not resolve Chatwoot inbox id" >&2
  exit 1
fi

# --- contact (no email/phone - synthetic canary only) ---
SEARCH_JSON=$(curl -fsS -m 15 -H "${CW_AUTH_HEADER}" -G --data-urlencode "q=${CANARY_CONTACT_NAME}" "${CW_API}/contacts/search")
CONTACT_ID=$(printf '%s' "${SEARCH_JSON}" | jq -r --arg n "${CANARY_CONTACT_NAME}" '.payload[] | select(.name==$n) | .id' | head -1)
if [ -z "${CONTACT_ID}" ] || [ "${CONTACT_ID}" = "null" ]; then
  CREATE_JSON=$(curl -fsS -m 15 -H "${CW_AUTH_HEADER}" -H "Content-Type: application/json" \
    -d "{\"name\":\"${CANARY_CONTACT_NAME}\"}" \
    "${CW_API}/contacts")
  CONTACT_ID=$(printf '%s' "${CREATE_JSON}" | jq -r '.payload.contact.id')
  CONTACT_CREATED=true
  log "created Chatwoot contact id=${CONTACT_ID}"
else
  log "Chatwoot contact already exists id=${CONTACT_ID}"
fi
if [ -z "${CONTACT_ID}" ] || [ "${CONTACT_ID}" = "null" ]; then
  echo "[canary] could not resolve Chatwoot contact id" >&2
  exit 1
fi

# --- conversation + message + attachment (idempotent by contact+inbox) ---
CONVS_JSON=$(curl -fsS -m 15 -H "${CW_AUTH_HEADER}" "${CW_API}/contacts/${CONTACT_ID}/conversations")
CONV_DISPLAY_ID=$(printf '%s' "${CONVS_JSON}" | jq -r --argjson ib "${INBOX_ID}" '.payload[] | select(.inbox_id==$ib) | .id' | head -1)
if [ -z "${CONV_DISPLAY_ID}" ] || [ "${CONV_DISPLAY_ID}" = "null" ]; then
  CONV_JSON=$(curl -fsS -m 15 -H "${CW_AUTH_HEADER}" -H "Content-Type: application/json" \
    -d "{\"inbox_id\":${INBOX_ID},\"contact_id\":${CONTACT_ID}}" \
    "${CW_API}/conversations")
  CONV_DISPLAY_ID=$(printf '%s' "${CONV_JSON}" | jq -r '.id')
  CONVERSATION_CREATED=true
  log "created Chatwoot conversation display_id=${CONV_DISPLAY_ID}"

  MSG_JSON=$(curl -fsS -m 15 -H "${CW_AUTH_HEADER}" \
    -F "content=Restore drill canary message" \
    -F "message_type=outgoing" \
    -F "attachments[]=@${CANARY_FILE}" \
    "${CW_API}/conversations/${CONV_DISPLAY_ID}/messages")
  MSG_ID=$(printf '%s' "${MSG_JSON}" | jq -r '.id')
  log "created Chatwoot message id=${MSG_ID} with canary attachment"

  curl -fsS -m 15 -H "${CW_AUTH_HEADER}" -d "status=resolved" \
    "${CW_API}/conversations/${CONV_DISPLAY_ID}/toggle_status" >/dev/null
  log "resolved Chatwoot conversation display_id=${CONV_DISPLAY_ID}"
else
  log "Chatwoot canary conversation already exists display_id=${CONV_DISPLAY_ID}"
fi
unset CW_TOKEN CW_AUTH_HEADER

# ============================================================================
# EspoCRM
# ============================================================================

ESPO_API="http://127.0.0.1:8080/api/v1"
ESPO_KEY=$(grep '^ESPOCRM_CANARY_API_KEY=' /etc/prestigo/espocrm.env | cut -d= -f2-)
if [ -z "${ESPO_KEY}" ]; then
  echo "[canary] ESPOCRM_CANARY_API_KEY not set in /etc/prestigo/espocrm.env" >&2
  exit 1
fi

SEARCH_JSON=$(curl -fsS -m 15 -H "X-Api-Key: ${ESPO_KEY}" -G \
  --data-urlencode "where[0][type]=equals" \
  --data-urlencode "where[0][attribute]=name" \
  --data-urlencode "where[0][value]=${ESPO_ACCOUNT_NAME}" \
  "${ESPO_API}/Account")
ESPO_ACCOUNT_ID=$(printf '%s' "${SEARCH_JSON}" | jq -r '.list[0].id // empty')
if [ -z "${ESPO_ACCOUNT_ID}" ]; then
  CREATE_JSON=$(curl -fsS -m 15 -H "X-Api-Key: ${ESPO_KEY}" -H "Content-Type: application/json" \
    -d "{\"name\":\"${ESPO_ACCOUNT_NAME}\"}" "${ESPO_API}/Account")
  ESPO_ACCOUNT_ID=$(printf '%s' "${CREATE_JSON}" | jq -r '.id')
  ESPO_ACCOUNT_CREATED=true
  log "created EspoCRM Account id=${ESPO_ACCOUNT_ID}"
else
  log "EspoCRM Account already exists id=${ESPO_ACCOUNT_ID}"
fi
if [ -z "${ESPO_ACCOUNT_ID}" ] || [ "${ESPO_ACCOUNT_ID}" = "null" ]; then
  echo "[canary] could not resolve EspoCRM Account id" >&2
  exit 1
fi

DOC_SEARCH_JSON=$(curl -fsS -m 15 -H "X-Api-Key: ${ESPO_KEY}" -G \
  --data-urlencode "where[0][type]=equals" \
  --data-urlencode "where[0][attribute]=name" \
  --data-urlencode "where[0][value]=${ESPO_DOCUMENT_NAME}" \
  "${ESPO_API}/Document")
ESPO_DOC_ID=$(printf '%s' "${DOC_SEARCH_JSON}" | jq -r '.list[0].id // empty')
if [ -z "${ESPO_DOC_ID}" ]; then
  CANARY_B64=$(base64 < "${CANARY_FILE}" | tr -d '\n')
  ATTACH_JSON=$(curl -fsS -m 15 -H "X-Api-Key: ${ESPO_KEY}" -H "Content-Type: application/json" \
    -d "{\"name\":\"canary.txt\",\"type\":\"text/plain\",\"role\":\"Attachment\",\"relatedType\":\"Document\",\"field\":\"file\",\"file\":\"data:text/plain;base64,${CANARY_B64}\"}" \
    "${ESPO_API}/Attachment")
  unset CANARY_B64
  ESPO_ATTACHMENT_ID=$(printf '%s' "${ATTACH_JSON}" | jq -r '.id')
  if [ -z "${ESPO_ATTACHMENT_ID}" ] || [ "${ESPO_ATTACHMENT_ID}" = "null" ]; then
    echo "[canary] could not create EspoCRM Attachment" >&2
    exit 1
  fi
  log "created EspoCRM Attachment id=${ESPO_ATTACHMENT_ID}"

  # NOTE (Rule 1 - plan interfaces bug): Document.accounts is a noLoad/
  # directUpdateDisabled linkMultiple field - it cannot be set via a plain
  # "accountsIds" create field (EspoCRM rejects/ignores it), and the REST
  # relate action (POST /Document/{id}/accounts) requires "edit" ACL on
  # Document, which the least-privilege canary role (create+read only,
  # T-76-34) deliberately does not have. Widening the role's ACL just to
  # perform one link would weaken the mitigation this plan's threat model
  # commits to. Instead, the account_document join row is inserted directly
  # via root MariaDB (same access pattern backup.sh already uses for
  # mariadb-dump) - see the "link Document to Account" step below.
  TODAY=$(date -u +%Y-%m-%d)
  CREATE_DOC_JSON=$(curl -fsS -m 15 -H "X-Api-Key: ${ESPO_KEY}" -H "Content-Type: application/json" \
    -d "{\"name\":\"${ESPO_DOCUMENT_NAME}\",\"fileId\":\"${ESPO_ATTACHMENT_ID}\",\"publishDate\":\"${TODAY}\"}" \
    "${ESPO_API}/Document")
  unset TODAY
  ESPO_DOC_ID=$(printf '%s' "${CREATE_DOC_JSON}" | jq -r '.id')
  if [ -z "${ESPO_DOC_ID}" ] || [ "${ESPO_DOC_ID}" = "null" ]; then
    echo "[canary] could not create EspoCRM Document: ${CREATE_DOC_JSON}" >&2
    exit 1
  fi
  ESPO_DOCUMENT_CREATED=true
  log "created EspoCRM Document id=${ESPO_DOC_ID}"
else
  log "EspoCRM Document already exists id=${ESPO_DOC_ID}"
fi
unset ESPO_KEY

# --- link Document to Account (account_document join row, idempotent) ---
ESPO_ROOT_PW=$(grep '^MARIADB_ROOT_PASSWORD=' /etc/prestigo/espocrm.env | cut -d= -f2-)
espo_sql() {
  docker exec -e MYSQL_PWD="${ESPO_ROOT_PW}" espocrm-db-1 mariadb -N -B -u root espocrm -e "$1"
}
ESPO_LINK_CNT=$(espo_sql "select count(*) from account_document where deleted=0 and account_id='${ESPO_ACCOUNT_ID}' and document_id='${ESPO_DOC_ID}';")
if [ "${ESPO_LINK_CNT}" = "0" ]; then
  espo_sql "insert into account_document (account_id, document_id, deleted) values ('${ESPO_ACCOUNT_ID}', '${ESPO_DOC_ID}', 0);"
  log "linked EspoCRM Document ${ESPO_DOC_ID} to Account ${ESPO_ACCOUNT_ID}"
else
  log "EspoCRM Document ${ESPO_DOC_ID} already linked to Account ${ESPO_ACCOUNT_ID}"
fi
unset ESPO_ROOT_PW

log "summary: inbox_created=${INBOX_CREATED} contact_created=${CONTACT_CREATED} conversation_created=${CONVERSATION_CREATED} espocrm_account_created=${ESPO_ACCOUNT_CREATED} espocrm_document_created=${ESPO_DOCUMENT_CREATED}"
log "canary ids: chatwoot_inbox_id=${INBOX_ID} chatwoot_contact_id=${CONTACT_ID} chatwoot_conversation_display_id=${CONV_DISPLAY_ID} espocrm_account_id=${ESPO_ACCOUNT_ID} espocrm_document_id=${ESPO_DOC_ID}"
