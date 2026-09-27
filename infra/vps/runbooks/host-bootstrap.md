# Runbook: Host Bootstrap / Re-provisioning

Covers first-time provisioning of a fresh Hostinger VPS and re-running
`bootstrap.sh` on an already-hardened host (idempotent). Also the reference
document for the D-09 restore drill, which provisions a *different*
temporary host from scratch using only this runbook, `infra/vps/` and B2.

## Prerequisites

- A fresh Ubuntu 24.04 VPS purchased and reachable (owner purchase, per
  Plan 76-01).
- Claude's dedicated SSH key uploaded to the host as an authorized root key
  (owner does this once at VPS creation, via the hosting panel).
- Local key at `~/.ssh/prestigo_vps_ed25519` (private) /
  `~/.ssh/prestigo_vps_ed25519.pub` (public).

## Fresh host: first-time bootstrap (as root)

Run from the repo root, on the owner's Mac:

```bash
# 1. Upload the script and the deploy public key
scp -i ~/.ssh/prestigo_vps_ed25519 \
  infra/vps/scripts/bootstrap.sh ~/.ssh/prestigo_vps_ed25519.pub \
  root@<VPS_IP>:/root/

# 2. Run it as root (full run - all sections)
ssh -i ~/.ssh/prestigo_vps_ed25519 root@<VPS_IP> \
  'chmod +x /root/bootstrap.sh && DEPLOY_PUBKEY_FILE=/root/prestigo_vps_ed25519.pub bash /root/bootstrap.sh'
```

`bootstrap.sh` runs its sections in order: `preflight`, `deploy_user`,
`sshd_hardening`, `firewall`, `packages`, `fail2ban`,
`unattended_upgrades`, `swap`, `docker`, `host_layout`. The
`sshd_hardening` section refuses to run unless the `deploy` user's
`authorized_keys` is already non-empty (populated by `deploy_user`
immediately before it), so there is never a window where no key-based
login works.

**Immediately after the run**, from a second connection, prove `deploy`
access before trusting the host:

```bash
ssh -i ~/.ssh/prestigo_vps_ed25519 -o BatchMode=yes deploy@<VPS_IP> \
  'sudo -n true && echo SUDO_OK'
```

Only once `SUDO_OK` prints should you consider root SSH access retired.
(In practice `sshd_hardening` and `firewall` already ran inside the same
`bootstrap.sh` invocation, so root login is refused as soon as the script
returns - this check is the human-verifiable proof that access wasn't
lost.)

Add the local alias once:

```bash
cat >> ~/.ssh/config <<EOF

Host prestigo-vps
    HostName <VPS_IP>
    User deploy
    IdentityFile ~/.ssh/prestigo_vps_ed25519
    IdentitiesOnly yes
EOF
```

From then on, use `ssh prestigo-vps`.

## Re-running on an already-hardened host (as deploy, via sudo)

```bash
scp infra/vps/scripts/bootstrap.sh prestigo-vps:/tmp/bootstrap.sh
ssh prestigo-vps 'sudo DEPLOY_PUBKEY_FILE=/home/deploy/.ssh/authorized_keys bash /tmp/bootstrap.sh'
```

Every section is a no-op when its target state already holds, so a full
re-run exits 0 without changing sshd/ufw/fail2ban state (idempotency,
verified in Plan 76-02 by running the full script twice).

## Verification commands (expected output)

```bash
# Task 1 (deploy user + sshd + firewall)
ssh prestigo-vps 'sudo -n true && echo SUDO_OK \
  && sudo sshd -T | grep -E "^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication) " \
  && sudo ufw status verbose'
# Expect: SUDO_OK; all three "... no"; "Status: active", ALLOW only 22/80/443

ssh -i ~/.ssh/prestigo_vps_ed25519 root@<VPS_IP> true
# Expect: "Permission denied (publickey)." and a non-zero exit - root is refused

# Task 2 (fail2ban, unattended-upgrades, swap, docker, host layout)
ssh prestigo-vps 'sudo fail2ban-client status sshd | head -1; \
  apt-config dump Unattended-Upgrade::Package-Blacklist; \
  apt-config dump Unattended-Upgrade::Allowed-Origins; \
  sudo unattended-upgrade --dry-run --debug 2>&1 | grep -i "allowed origins"; \
  swapon --show=NAME,SIZE --noheadings; \
  sysctl -n vm.swappiness; \
  docker compose version; \
  docker network inspect edge --format "{{.Name}}"; \
  sudo stat -c "%a %U %n" /etc/prestigo /var/backups/prestigo /var/backups/prestigo/dumps /opt/prestigo'
# Expect: "Status for the jail: sshd"; blacklist has all 4 docker packages;
# origins all end in "-security"; dry-run mentions "allowed origins";
# swap 4G active; swappiness 10; docker compose version prints; edge network exists;
# /etc/prestigo "700 root", /var/backups/prestigo(/dumps) "700 root", /opt/prestigo "755 deploy"
```

## Lockout recovery

If SSH access is ever lost (misconfigured `sshd_config.d` drop-in, ufw
rule mistake, etc.):

1. Log into **Hostinger hPanel -> VPS -> Browser terminal** (works even
   with SSH/network fully down - it is a serial/VNC-style console, not
   SSH).
2. As root in the browser terminal:
   ```bash
   rm -f /etc/ssh/sshd_config.d/10-prestigo-hardening.conf
   systemctl reload ssh
   ```
   This removes the hardening drop-in; Ubuntu's `50-cloud-init.conf`
   (or sshd's own compiled-in defaults) takes over again, restoring
   password-based root login.
3. If ufw itself is the problem: `ufw disable` from the browser terminal.
4. Re-diagnose and re-run `bootstrap.sh` once access is restored.

## Unattended upgrades never reboot

`Unattended-Upgrade::Automatic-Reboot "false"` is set deliberately - a
security patch that requires a kernel/library reboot is applied but the
host is **not** rebooted automatically. Check monthly:

```bash
ssh prestigo-vps 'test -f /var/run/reboot-required && cat /var/run/reboot-required.pkgs'
```

If `/var/run/reboot-required` exists, schedule a reboot in a quiet hour
(Prague night hours) - containers use restart policies (`restart: unless-stopped`)
and come back up automatically after a host reboot, once Compose stacks
exist (Plan 76-04).
