#!/usr/bin/env bash
# infra/vps/scripts/bootstrap.sh
#
# Idempotent Ubuntu 24.04 provisioning for the Prestigo helpdesk/CRM VPS
# (Phase 76, D-11..D-14). Structured as one function per section plus a
# main() that runs sections in order. Every section is a no-op when its
# target state already holds, so re-running the whole script (or a subset
# via repeatable --section NAME) is always safe.
#
# Usage:
#   DEPLOY_USER=deploy DEPLOY_PUBKEY_FILE=/root/key.pub bash bootstrap.sh
#   bash bootstrap.sh --section preflight --section deploy_user
#
# Inputs (env vars):
#   DEPLOY_USER         - non-root user to create/harden into (default: deploy)
#   DEPLOY_PUBKEY_FILE  - path to the uploaded deploy public key (.pub)
#
# Sections (run in this order by default):
#   preflight sshd_hardening firewall deploy_user  <- see ALL_SECTIONS below
#
set -Eeuo pipefail

CURRENT_SECTION="init"
trap 'echo "[bootstrap] FAILED at line ${LINENO} in section: ${CURRENT_SECTION}" >&2' ERR

DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_PUBKEY_FILE="${DEPLOY_PUBKEY_FILE:-}"

# Sections defined so far, in execution order. Task 2 appends packages,
# fail2ban, unattended_upgrades, swap, docker, host_layout after firewall.
ALL_SECTIONS=(preflight deploy_user sshd_hardening firewall)

log() {
  echo "[bootstrap] $*"
}

# --- preflight ---------------------------------------------------------
section_preflight() {
  CURRENT_SECTION="preflight"

  if [ "${EUID}" -ne 0 ]; then
    echo "[bootstrap] must be run as root (EUID 0)" >&2
    exit 1
  fi

  if [ ! -r /etc/os-release ]; then
    echo "[bootstrap] /etc/os-release not found - cannot verify OS" >&2
    exit 1
  fi
  # shellcheck disable=SC1091
  . /etc/os-release
  if [ "${ID:-}" != "ubuntu" ] || [ "${VERSION_ID:-}" != "24.04" ]; then
    echo "[bootstrap] unsupported OS: expected Ubuntu 24.04, found ${ID:-unknown} ${VERSION_ID:-unknown}" >&2
    exit 1
  fi

  log "preflight OK: root, Ubuntu ${VERSION_ID}"
}

# --- deploy_user ---------------------------------------------------------
section_deploy_user() {
  CURRENT_SECTION="deploy_user"

  if [ -z "${DEPLOY_PUBKEY_FILE}" ] || [ ! -f "${DEPLOY_PUBKEY_FILE}" ]; then
    echo "[bootstrap] DEPLOY_PUBKEY_FILE is not set or does not exist: '${DEPLOY_PUBKEY_FILE}'" >&2
    exit 1
  fi

  if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
    useradd --create-home --shell /bin/bash "${DEPLOY_USER}"
    log "created user ${DEPLOY_USER}"
  else
    log "user ${DEPLOY_USER} already exists"
  fi

  local home_dir ssh_dir auth_keys pubkey_content
  home_dir=$(getent passwd "${DEPLOY_USER}" | cut -d: -f6)
  ssh_dir="${home_dir}/.ssh"
  auth_keys="${ssh_dir}/authorized_keys"

  install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${ssh_dir}"
  touch "${auth_keys}"
  chmod 600 "${auth_keys}"
  chown "${DEPLOY_USER}:${DEPLOY_USER}" "${auth_keys}"

  pubkey_content=$(cat "${DEPLOY_PUBKEY_FILE}")
  if ! grep -qxF "${pubkey_content}" "${auth_keys}"; then
    echo "${pubkey_content}" >> "${auth_keys}"
    log "installed deploy public key into ${auth_keys}"
  else
    log "deploy public key already present in ${auth_keys}"
  fi
  chmod 600 "${auth_keys}"
  chown "${DEPLOY_USER}:${DEPLOY_USER}" "${auth_keys}"

  local sudoers_file="/etc/sudoers.d/90-prestigo-deploy"
  local tmp_sudoers
  tmp_sudoers=$(mktemp)
  echo "${DEPLOY_USER} ALL=(ALL) NOPASSWD:ALL" > "${tmp_sudoers}"
  chmod 440 "${tmp_sudoers}"
  if ! visudo -cf "${tmp_sudoers}"; then
    echo "[bootstrap] generated sudoers file failed visudo -cf validation" >&2
    rm -f "${tmp_sudoers}"
    exit 1
  fi
  if ! cmp -s "${tmp_sudoers}" "${sudoers_file}" 2>/dev/null; then
    cp "${tmp_sudoers}" "${sudoers_file}"
    chmod 440 "${sudoers_file}"
    log "wrote ${sudoers_file} (passwordless sudo for ${DEPLOY_USER})"
  else
    log "${sudoers_file} already up to date"
  fi
  rm -f "${tmp_sudoers}"

  # deploy will need the docker group once Docker is installed (docker section) -
  # add it here too so re-running deploy_user after docker exists is a no-op either way.
  if getent group docker >/dev/null 2>&1; then
    usermod -aG docker "${DEPLOY_USER}"
  fi
}

# --- sshd_hardening ---------------------------------------------------------
section_sshd_hardening() {
  CURRENT_SECTION="sshd_hardening"

  local home_dir auth_keys
  home_dir=$(getent passwd "${DEPLOY_USER}" | cut -d: -f6)
  auth_keys="${home_dir}/.ssh/authorized_keys"

  if [ ! -s "${auth_keys}" ]; then
    echo "[bootstrap] refusing to harden sshd: ${auth_keys} is missing or empty (would lock out access)" >&2
    exit 1
  fi

  local drop_in="/etc/ssh/sshd_config.d/10-prestigo-hardening.conf"
  local tmp_conf
  tmp_conf=$(mktemp)
  cat > "${tmp_conf}" <<EOF
# Managed by infra/vps/scripts/bootstrap.sh (section sshd_hardening) - Phase 76 D-14.
# Named 10- so it sorts before Ubuntu cloud-init's 50-cloud-init.conf: sshd uses the
# FIRST value it reads per keyword, so this file must win.
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AllowUsers ${DEPLOY_USER}
EOF

  if ! cmp -s "${tmp_conf}" "${drop_in}" 2>/dev/null; then
    cp "${tmp_conf}" "${drop_in}"
    chmod 644 "${drop_in}"
    rm -f "${tmp_conf}"

    if ! sshd -t; then
      echo "[bootstrap] sshd -t failed after writing ${drop_in} - reverting" >&2
      rm -f "${drop_in}"
      exit 1
    fi

    systemctl reload ssh
    log "wrote ${drop_in} and reloaded ssh"
  else
    rm -f "${tmp_conf}"
    log "${drop_in} already up to date"
  fi
}

# --- firewall ---------------------------------------------------------
section_firewall() {
  CURRENT_SECTION="firewall"

  if ! command -v ufw >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y ufw
    log "installed ufw"
  fi

  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null

  if ! ufw status | grep -q "^Status: active"; then
    ufw --force enable
    log "ufw enabled"
  else
    log "ufw already active"
  fi
}

# --- main ---------------------------------------------------------
main() {
  local sections=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --section)
        sections+=("$2")
        shift 2
        ;;
      *)
        echo "[bootstrap] unknown argument: $1" >&2
        exit 1
        ;;
    esac
  done

  if [ ${#sections[@]} -eq 0 ]; then
    sections=("${ALL_SECTIONS[@]}")
  fi

  for s in "${sections[@]}"; do
    CURRENT_SECTION="${s}"
    if declare -f "section_${s}" >/dev/null 2>&1; then
      "section_${s}"
    else
      echo "[bootstrap] unknown or not-yet-implemented section: ${s}" >&2
      exit 1
    fi
  done

  log "completed sections: ${sections[*]}"
}

main "$@"
