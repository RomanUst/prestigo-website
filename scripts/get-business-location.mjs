// Run after adding OAuth vars to .env.local:
// node scripts/get-business-location.mjs

import { readFileSync } from 'fs'

// Parse .env.local manually (no dotenv dependency needed)
try {
  const envFile = readFileSync('.env.local', 'utf8')
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!(key in process.env)) process.env[key] = val
  }
} catch { /* .env.local not found, rely on shell env */ }

const { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN } = process.env

if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET || !GOOGLE_OAUTH_REFRESH_TOKEN) {
  console.error('Missing env vars: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN')
  process.exit(1)
}

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: GOOGLE_OAUTH_CLIENT_ID,
    client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
    refresh_token: GOOGLE_OAUTH_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  }).toString(),
})

const { access_token, error } = await tokenRes.json()
if (error || !access_token) {
  console.error('Failed to get access token:', error)
  process.exit(1)
}

const accountsRes = await fetch('https://mybusiness.googleapis.com/v4/accounts', {
  headers: { Authorization: `Bearer ${access_token}` },
})
const accountsData = await accountsRes.json()
const accounts = accountsData.accounts ?? []

if (!accounts.length) {
  console.error('No accounts found. Make sure you authorised the correct Google account.')
  process.exit(1)
}

console.log('\nAccounts found:')
for (const acc of accounts) {
  console.log(' ', acc.name, '-', acc.accountName)
}

const firstAccount = accounts[0].name
const locationsRes = await fetch(
  `https://mybusiness.googleapis.com/v4/${firstAccount}/locations`,
  { headers: { Authorization: `Bearer ${access_token}` } },
)
const locationsData = await locationsRes.json()
const locations = locationsData.locations ?? []

if (!locations.length) {
  console.error('No locations found under account:', firstAccount)
  process.exit(1)
}

console.log('\nLocations found:')
for (const loc of locations) {
  console.log(' ', loc.name, '-', loc.locationName ?? loc.title ?? '')
}

console.log('\n✅ Add this to .env.local:')
console.log(`GOOGLE_BUSINESS_LOCATION_NAME=${locations[0].name}`)
