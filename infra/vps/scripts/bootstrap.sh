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

# Sections, in execution order.
ALL_SECTIONS=(preflight deploy_user sshd_hardening firewall packages fail2ban unattended_upgrades swap docker host_layout)

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

# --- packages ---------------------------------------------------------
section_packages() {
  CURRENT_SECTION="packages"
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg jq rsync openssl
  log "base packages present"
}

# --- fail2ban ---------------------------------------------------------
section_fail2ban() {
  CURRENT_SECTION="fail2ban"

  if ! dpkg -s fail2ban >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y fail2ban
    log "installed fail2ban"
  fi

  local jail_file="/etc/fail2ban/jail.d/sshd-prestigo.local"
  local tmp_jail
  tmp_jail=$(mktemp)
  cat > "${tmp_jail}" <<'EOF'
# Managed by infra/vps/scripts/bootstrap.sh (section fail2ban) - Phase 76 D-14/D-17.
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF
  chmod 0644 "${tmp_jail}"

  if ! cmp -s "${tmp_jail}" "${jail_file}" 2>/dev/null; then
    mv "${tmp_jail}" "${jail_file}"
    chmod 0644 "${jail_file}"
    log "wrote ${jail_file}"
  else
    rm -f "${tmp_jail}"
  fi
  chmod 0644 "${jail_file}"

  systemctl enable fail2ban >/dev/null 2>&1 || true
  systemctl restart fail2ban
  log "fail2ban enabled and restarted"
}

# --- unattended_upgrades ---------------------------------------------------------
section_unattended_upgrades() {
  CURRENT_SECTION="unattended_upgrades"

  if ! dpkg -s unattended-upgrades >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y unattended-upgrades
    log "installed unattended-upgrades"
  fi

  local auto_upgrades="/etc/apt/apt.conf.d/20auto-upgrades"
  local tmp_auto
  tmp_auto=$(mktemp)
  cat > "${tmp_auto}" <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
  chmod 0644 "${tmp_auto}"
  if ! cmp -s "${tmp_auto}" "${auto_upgrades}" 2>/dev/null; then
    mv "${tmp_auto}" "${auto_upgrades}"
    chmod 0644 "${auto_upgrades}"
    log "wrote ${auto_upgrades}"
  else
    rm -f "${tmp_auto}"
  fi
  # apt.conf.d files must stay world-readable (apt-config dump is run
  # unprivileged e.g. by monitoring/verification tooling) - normalize even
  # when content already matched and the mv branch above didn't run.
  chmod 0644 "${auto_upgrades}"

  # Security-only origins (#clear resets the accumulated Allowed-Origins list from
  # 50unattended-upgrades.conf, per D-14) + Docker package blacklist (D-14) + never
  # auto-reboot (reboots are a runbook step, not unattended).
  local uu_conf="/etc/apt/apt.conf.d/52prestigo-unattended-upgrades"
  local tmp_uu
  tmp_uu=$(mktemp)
  cat > "${tmp_uu}" <<'EOF'
#clear Unattended-Upgrade::Allowed-Origins;
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Package-Blacklist {
    "docker-ce";
    "docker-ce-cli";
    "containerd.io";
    "docker-compose-plugin";
};
Unattended-Upgrade::Automatic-Reboot "false";
EOF
  chmod 0644 "${tmp_uu}"
  if ! cmp -s "${tmp_uu}" "${uu_conf}" 2>/dev/null; then
    mv "${tmp_uu}" "${uu_conf}"
    chmod 0644 "${uu_conf}"
    log "wrote ${uu_conf}"
  else
    rm -f "${tmp_uu}"
  fi
  chmod 0644 "${uu_conf}"
}

# --- swap ---------------------------------------------------------
section_swap() {
  CURRENT_SECTION="swap"

  if swapon --show=NAME --noheadings 2>/dev/null | grep -q .; then
    log "swap already active"
  else
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    if ! grep -q '^/swapfile ' /etc/fstab 2>/dev/null; then
      echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
    log "created and enabled 4G /swapfile"
  fi

  local sysctl_conf="/etc/sysctl.d/99-prestigo.conf"
  local tmp_sysctl
  tmp_sysctl=$(mktemp)
  echo 'vm.swappiness=10' > "${tmp_sysctl}"
  chmod 0644 "${tmp_sysctl}"
  if ! cmp -s "${tmp_sysctl}" "${sysctl_conf}" 2>/dev/null; then
    mv "${tmp_sysctl}" "${sysctl_conf}"
    chmod 0644 "${sysctl_conf}"
    sysctl --system >/dev/null
    log "set vm.swappiness=10"
  else
    rm -f "${tmp_sysctl}"
  fi
  chmod 0644 "${sysctl_conf}"
}

# --- docker ---------------------------------------------------------
section_docker() {
  CURRENT_SECTION="docker"

  # Official Docker apt signing key fingerprint - pinned per infra/vps host contract.
  # Refuse to continue unless the downloaded key matches exactly (T-76-SC).
  local expected_fp="9DC8 5822 9FC7 DD38 854A E2D8 8D81 803C 0EBF CD88"
  local expected_fp_nospace
  expected_fp_nospace=$(echo "${expected_fp}" | tr -d ' ')

  install -d -m 0755 /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.asc ]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  fi
  chmod a+r /etc/apt/keyrings/docker.asc

  local actual_fp
  actual_fp=$(gpg --show-keys --with-fingerprint --with-colons /etc/apt/keyrings/docker.asc 2>/dev/null \
    | awk -F: '/^fpr:/{print $10; exit}')

  if [ "${actual_fp}" != "${expected_fp_nospace}" ]; then
    echo "[bootstrap] Docker apt key fingerprint mismatch: expected ${expected_fp_nospace}, got ${actual_fp:-<none>}" >&2
    exit 1
  fi
  log "Docker apt key fingerprint verified: ${actual_fp}"

  local codename
  codename=$(. /etc/os-release && echo "${VERSION_CODENAME}")
  local arch
  arch=$(dpkg --print-architecture)
  local repo_line="deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${codename} stable"
  local repo_file="/etc/apt/sources.list.d/docker.list"

  if [ ! -f "${repo_file}" ] || [ "$(cat "${repo_file}")" != "${repo_line}" ]; then
    echo "${repo_line}" > "${repo_file}"
    apt-get update -y
    log "added Docker apt repo (${codename})"
  fi

  if ! dpkg -s docker-ce >/dev/null 2>&1; then
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    log "installed Docker Engine + compose plugin"
  fi

  local daemon_json="/etc/docker/daemon.json"
  install -d -m 0755 /etc/docker
  local tmp_daemon
  tmp_daemon=$(mktemp)
  cat > "${tmp_daemon}" <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
  chmod 0644 "${tmp_daemon}"
  if ! cmp -s "${tmp_daemon}" "${daemon_json}" 2>/dev/null; then
    mv "${tmp_daemon}" "${daemon_json}"
    chmod 0644 "${daemon_json}"
    systemctl restart docker
    log "wrote ${daemon_json} and restarted docker"
  else
    rm -f "${tmp_daemon}"
  fi
  # world-readable per host-bootstrap.md verification command (unprivileged cat)
  chmod 0644 "${daemon_json}"

  usermod -aG docker "${DEPLOY_USER}"
}

# --- host_layout ---------------------------------------------------------
section_host_layout() {
  CURRENT_SECTION="host_layout"

  install -d -m 0700 -o root -g root /etc/prestigo
  install -d -m 0755 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" /opt/prestigo
  install -d -m 0700 -o root -g root /var/backups/prestigo
  install -d -m 0700 -o root -g root /var/backups/prestigo/dumps
  install -d -m 0750 -o root -g root /var/log/prestigo

  if ! docker network inspect edge >/dev/null 2>&1; then
    docker network create edge >/dev/null
    log "created docker network 'edge'"
  else
    log "docker network 'edge' already exists"
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
