# DNS runbook — Hostinger `chat`/`crm` A records (D-20)

Covers the D-20 procedure for adding the `chat.rideprestigo.com` and
`crm.rideprestigo.com` A records used by the Chatwoot (Phase 77) and EspoCRM
(Phase 80) VPS deployments. **Never touch any other record in this zone.**

An earlier leftover apex DNS record caused a production SSL outage — this
runbook exists so that mistake is never repeated. The failure mode this
guards against: a PUT that silently drops or overwrites an existing record
because the request body only listed the records you meant to change.

## Protected records — never modify or delete

At the time this runbook was written, `rideprestigo.com` carries (do not
touch any of these, in any step below):

- Apex `@` A `216.198.79.1` (Vercel — single A, no AAAA)
- `www` CNAME `cname.vercel-dns.com.`
- MX `mx1.hostinger.com` / `mx2.hostinger.com`
- SPF (`v=spf1 include:_spf.mail.hostinger.com ...`)
- DKIM: `hostingermail-a._domainkey`, `hostingermail-b._domainkey`,
  `hostingermail-c._domainkey`, `resend._domainkey`
- DMARC (`_dmarc`)
- `autodiscover` / `autoconfig`
- `google-site-verification`, `send` (Resend tracking)

Authoritative nameservers: `ns1.dns-parking.com`, `ns2.dns-parking.com`.

## Procedure

1. **Create a short-lived API token.** hPanel -> Account/Profile -> API ->
   new token, shortest expiry offered. Hold it only in a shell variable for
   the duration of this procedure — never write it to a file or paste it
   into a commit, chat log excerpt, or this runbook.

2. **GET the whole zone and save the snapshot** (public DNS data, safe to
   commit):
   ```bash
   HOSTINGER_TOKEN='...'   # shell variable only
   curl -s -o .planning/phases/76-vps-infrastructure/evidence/dns-zone-before.json \
     -w '%{http_code}\n' \
     -H "Authorization: Bearer ${HOSTINGER_TOKEN}" \
     "https://developers.hostinger.com/api/dns/v1/zones/rideprestigo.com"
   ```
   Expect `200`.

3. **Abort if `chat` or `crm` already exist** (of any record type):
   ```bash
   jq -r '.[] | select(.name=="chat" or .name=="crm") | .name' \
     .planning/phases/76-vps-infrastructure/evidence/dns-zone-before.json
   ```
   Any output here means STOP — do not PUT. A record already exists and must
   be handled as its own change, not folded into this procedure.

4. **PUT a body containing ONLY the two new names.** `overwrite: false` so a
   name that unexpectedly exists is rejected instead of silently replaced:
   ```bash
   VPS_IP='179.198.213.201'   # see 76-01-SUMMARY.md "VPS facts"
   PUT_BODY=$(jq -n --arg ip "$VPS_IP" '{
     overwrite: false,
     zone: [
       {name: "chat", type: "A", ttl: 3600, records: [{content: $ip}]},
       {name: "crm",  type: "A", ttl: 3600, records: [{content: $ip}]}
     ]
   }')
   curl -s -o /tmp/zone-put-response.json -w '%{http_code}\n' \
     -X PUT \
     -H "Authorization: Bearer ${HOSTINGER_TOKEN}" \
     -H "Content-Type: application/json" \
     -d "$PUT_BODY" \
     "https://developers.hostinger.com/api/dns/v1/zones/rideprestigo.com"
   ```
   Expect `200` and `{"message":"Request accepted"}`.

5. **GET again into the after-snapshot:**
   ```bash
   curl -s -o .planning/phases/76-vps-infrastructure/evidence/dns-zone-after.json \
     -w '%{http_code}\n' \
     -H "Authorization: Bearer ${HOSTINGER_TOKEN}" \
     "https://developers.hostinger.com/api/dns/v1/zones/rideprestigo.com"
   ```

6. **Run the diff tool and check the counts:**
   ```bash
   bash infra/vps/scripts/dns-zone-diff.sh \
     .planning/phases/76-vps-infrastructure/evidence/dns-zone-before.json \
     .planning/phases/76-vps-infrastructure/evidence/dns-zone-after.json
   ```
   Expected output: exactly two `+` lines (`chat|A|<ip>` and `crm|A|<ip>`),
   no `-` lines, and a final `added=2 removed=0`.

   **If the counts are anything else** (a protected record shows up as `-`,
   or `added`/`removed` are not exactly `2`/`0`): restore immediately by
   re-PUTting the before-snapshot's records for the *affected names only*
   (never a blanket `overwrite: true` PUT of the whole zone), then stop and
   investigate before retrying.

7. **Confirm resolution at the authoritative nameserver** (bypasses any
   resolver cache):
   ```bash
   dig +short chat.rideprestigo.com @ns1.dns-parking.com
   dig +short crm.rideprestigo.com @ns1.dns-parking.com
   ```
   Both must return the VPS IPv4.

8. **D-10 evidence (optional, read-only):** if the same token also
   authorizes the Hostinger VPS API, record the VM's backups list as a
   read-only GET (no writes):
   ```bash
   curl -s -H "Authorization: Bearer ${HOSTINGER_TOKEN}" \
     "https://developers.hostinger.com/api/vps/v1/virtual-machines"
   # then, with the returned id:
   curl -s -H "Authorization: Bearer ${HOSTINGER_TOKEN}" \
     "https://developers.hostinger.com/api/vps/v1/virtual-machines/<id>/backups"
   ```
   If this returns 401/403, D-10 relies instead on the owner confirmation
   captured in `76-01-SUMMARY.md` (hPanel Snapshots & Backups screen).

9. **Revoke the token.** hPanel -> Account/Profile -> API -> revoke the
   token created in step 1. It has no further use after this procedure.

## Rollback

To remove `chat`/`crm` (e.g. this procedure is being undone), re-PUT the
zone with `overwrite: true` and a `zone` array containing every record from
`dns-zone-before.json` (the protected list above) and omitting `chat`/`crm`
entirely — or simply DELETE the two names via the Hostinger API/hPanel UI.
Never PUT `overwrite: true` with a partial zone array; that deletes every
name not listed.
