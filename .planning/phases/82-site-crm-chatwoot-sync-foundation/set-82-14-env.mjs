#!/usr/bin/env node
// Phase 82-14: owner-run. Adds the Chatwoot sync + erasure env vars to Vercel Production and
// redeploys. Values are never printed; tokens are typed with hidden input or read from
// ~/.config/prestigo/chatwoot-api.env. Claude never sees them.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import readline from 'node:readline'

const REPO = '/Users/romanustyugov/Desktop/Prestigo'
const nvm = join(homedir(), '.nvm/versions/node')
const bins = existsSync(nvm) ? readdirSync(nvm).map((v) => join(nvm, v, 'bin')) : []
const env = { ...process.env, PATH: [...bins, process.env.PATH].join(':') }

function vercel(args, input) {
  return spawnSync('vercel', args, { cwd: REPO, env, input, encoding: 'utf8' })
}

function readCfg() {
  const p = join(homedir(), '.config/prestigo/chatwoot-api.env')
  const out = {}
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

function ask(q, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (hidden) {
      rl._writeToOutput = (s) => { if (s.startsWith(q)) rl.output.write(q) }
    }
    rl.question(q, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a.trim()) })
  })
}

function setVar(name, value) {
  if (!value) throw new Error(`${name}: empty value, aborting`)
  vercel(['env', 'rm', name, 'production', '--yes'])
  const r = vercel(['env', 'add', name, 'production'], value) // no trailing newline
  if (r.status !== 0) throw new Error(`${name}: vercel env add failed (exit ${r.status})`)
  console.log(`  ✓ ${name} set`)
}

const cfg = readCfg()
console.log('Chatwoot credential model:')
console.log('  A = reuse the token from ~/.config/prestigo/chatwoot-api.env for both vars (quickest)')
console.log('  B = paste two new tokens: sync agent + erasure administrator (recommended)')
const option = (await ask('Option A or B: ')).toUpperCase()

let apiToken
let adminToken
if (option === 'A') {
  apiToken = cfg.CHATWOOT_API_TOKEN
  adminToken = cfg.CHATWOOT_API_TOKEN
} else if (option === 'B') {
  apiToken = await ask('Token of "Prestigo Site Sync" (agent), hidden: ', true)
  adminToken = await ask('Token of "Prestigo Erasure" (administrator), hidden: ', true)
} else {
  console.error('Unknown option, nothing changed.')
  process.exit(1)
}

console.log('Setting Vercel Production env vars…')
setVar('CHATWOOT_ACCOUNT_ID', cfg.CHATWOOT_ACCOUNT_ID)
setVar('CHATWOOT_API_TOKEN', apiToken)
setVar('CHATWOOT_ADMIN_API_TOKEN', adminToken)
setVar('ERASURE_HMAC_KEY', randomBytes(32).toString('hex'))

console.log('Redeploying production…')
const ls = vercel(['ls', 'prestigo-site', '--prod'])
const url = (ls.stdout + ls.stderr).match(/https:\/\/prestigo-site-[a-z0-9-]+\.vercel\.app/)?.[0]
if (!url) {
  console.log('  Could not find the latest prod deployment; run: vercel redeploy <url> --target production')
  process.exit(0)
}
const rd = vercel(['redeploy', url, '--target', 'production'])
console.log(rd.status === 0 ? '  ✓ redeploy started' : `  redeploy failed (exit ${rd.status})`)
console.log(`Done. Option ${option}. Tell Claude "env done ${option}".`)
