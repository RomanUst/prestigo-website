#!/usr/bin/env bash
# infra/vps/scripts/gen-env.sh
#
# First-install generator for the app secret env files under /etc/prestigo.
# Root only. Never overwrites an existing file (refuses and exits 0 - a no-op
# is not a failure on a re-run). Never prints a secret value to stdout/stderr.
#
# Usage (run as root on the VPS, from /opt/prestigo after rsync):
#   sudo bash scripts/gen-env.sh chatwoot
#   sudo bash scripts/gen-env.sh espocrm
#
set -Eeuo pipefail

log() {
  echo "[gen-env] $*"
}

require_root() {
  if [ "${EUID}" -ne 0 ]; then
    echo "[gen-env] must be run as root (EUID 0)" >&2
    exit 1
  fi
}

require_smtp_env() {
  if [ ! -s /etc/prestigo/smtp.env ]; then
    echo "[gen-env] /etc/prestigo/smtp.env is missing or empty - run plan 76-03 first" >&2
    exit 1
  fi
}

# Reads a KEY=value out of /etc/prestigo/smtp.env without ever echoing it.
smtp_value() {
  local key="$1"
  # shellcheck disable=SC1091
  ( set -a; . /etc/prestigo/smtp.env; set +a; eval "echo \"\$${key}\"" )
}

write_env_file() {
  local path="$1"
  local content="$2"
  if [ -e "${path}" ]; then
    log "${path} already exists - refusing to overwrite (no-op)"
    return 0
  fi
  local tmp
  tmp=$(mktemp)
  printf '%s\n' "${content}" > "${tmp}"
  chmod 600 "${tmp}"
  chown root:root "${tmp}"
  mv "${tmp}" "${path}"
  log "wrote ${path} (mode 600, root:root)"
}

# --- chatwoot ---------------------------------------------------------------
gen_chatwoot() {
  require_root
  require_smtp_env

  local target=/etc/prestigo/chatwoot.env
  if [ -e "${target}" ]; then
    log "${target} already exists - refusing to overwrite (no-op)"
    return 0
  fi

  local secret_key_base postgres_password redis_password redis_url
  local smtp_host smtp_port smtp_user smtp_password

  secret_key_base=$(openssl rand -hex 64)
  postgres_password=$(openssl rand -hex 32)
  redis_password=$(openssl rand -hex 32)
  redis_url="redis://:${redis_password}@redis:6379"

  smtp_host=$(smtp_value RESEND_SMTP_HOST)
  smtp_port=$(smtp_value RESEND_SMTP_PORT)
  smtp_user=$(smtp_value RESEND_SMTP_USER)
  smtp_password=$(smtp_value RESEND_SMTP_PASSWORD)

  write_env_file "${target}" "$(cat <<EOF
RAILS_ENV=production
NODE_ENV=production
INSTALLATION_ENV=docker
SECRET_KEY_BASE=${secret_key_base}
FRONTEND_URL=https://chat.rideprestigo.com
DEFAULT_LOCALE=en
ENABLE_ACCOUNT_SIGNUP=false
POSTGRES_HOST=postgres
POSTGRES_USERNAME=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${postgres_password}
POSTGRES_DATABASE=chatwoot_production
POSTGRES_DB=chatwoot_production
REDIS_PASSWORD=${redis_password}
REDIS_URL=${redis_url}
ACTIVE_STORAGE_SERVICE=local
RAILS_LOG_TO_STDOUT=true
SIDEKIQ_CONCURRENCY=3
MAILER_SENDER_EMAIL=Prestigo <notifications@rideprestigo.com>
SMTP_ADDRESS=${smtp_host}
SMTP_PORT=${smtp_port}
SMTP_USERNAME=${smtp_user}
SMTP_PASSWORD=${smtp_password}
SMTP_AUTHENTICATION=login
SMTP_ENABLE_STARTTLS_AUTO=true
SMTP_DOMAIN=rideprestigo.com
EOF
)"
}

# --- espocrm ------------------------------------------------------------
gen_espocrm() {
  require_root
  require_smtp_env

  local target=/etc/prestigo/espocrm.env
  if [ -e "${target}" ]; then
    log "${target} already exists - refusing to overwrite (no-op)"
    return 0
  fi

  local mariadb_root_password mariadb_password admin_password

  mariadb_root_password=$(openssl rand -hex 32)
  mariadb_password=$(openssl rand -hex 32)
  admin_password=$(openssl rand -hex 24)

  write_env_file "${target}" "$(cat <<EOF
MARIADB_ROOT_PASSWORD=${mariadb_root_password}
MARIADB_DATABASE=espocrm
MARIADB_USER=espocrm
MARIADB_PASSWORD=${mariadb_password}
ESPOCRM_DATABASE_PLATFORM=Mysql
ESPOCRM_DATABASE_HOST=db
ESPOCRM_DATABASE_NAME=espocrm
ESPOCRM_DATABASE_USER=espocrm
ESPOCRM_DATABASE_PASSWORD=${mariadb_password}
ESPOCRM_ADMIN_USERNAME=prestigo-admin
ESPOCRM_ADMIN_PASSWORD=${admin_password}
ESPOCRM_SITE_URL=https://crm.rideprestigo.com
ESPOCRM_CANARY_API_KEY=
EOF
)"
}

main() {
  local subcommand="${1:-}"
  case "${subcommand}" in
    chatwoot)
      gen_chatwoot
      ;;
    espocrm)
      gen_espocrm
      ;;
    *)
      echo "[gen-env] usage: gen-env.sh <chatwoot|espocrm>" >&2
      exit 1
      ;;
  esac
}

main "$@"
