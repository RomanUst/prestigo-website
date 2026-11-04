/**
 * infra/lib/secret-io.mjs
 *
 * Shared secret handling for the owner-run scripts under infra/stripe and infra/qstash
 * (Phase 88 plan 04, T-88-09). Three rules, one place:
 *
 *   1. A secret comes only from an environment variable or a hidden terminal prompt, never argv.
 *   2. A secret-looking value on the command line is refused, and never echoed back.
 *   3. Every printed line passes a scrubber that removes registered secret values and anything
 *      shaped like a Stripe key or webhook secret.
 */

const MIN_SCRUB_LENGTH = 8

/** Stripe secret / restricted / publishable keys and webhook signing secrets, however long. */
const SHAPED_SECRET = /(?:\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_]*)|(?:\bwhsec_[A-Za-z0-9_]*)/g

/** Option names that would carry a secret on the command line. */
const SECRET_OPTION = /^--?(?:api[-_]?key|key|secret|token|password|auth|bearer|stripe[-_]?key|qstash[-_]?token)(?:=|$)/i

export class SecretInputError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SecretInputError'
  }
}

/**
 * @param {string[]} [initial] secret values to redact verbatim (the key this process was given)
 * @returns {{ scrub: (line: unknown) => string, note: (value: unknown) => void }}
 */
export function createScrubber(initial = []) {
  const known = new Set()
  const note = (value) => {
    if (typeof value === 'string' && value.length >= MIN_SCRUB_LENGTH) known.add(value)
  }
  for (const value of initial) note(value)
  const scrub = (line) => {
    let text = String(line)
    for (const value of known) text = text.split(value).join('[redacted]')
    return text.replace(SHAPED_SECRET, '[redacted]')
  }
  return { scrub, note }
}

/**
 * True when an argv entry looks like a secret or is an option that would carry one. The caller
 * refuses with a fixed message; the offending value is never printed.
 * @param {string[]} argv
 */
export function argvCarriesSecret(argv) {
  return argv.some((arg) => {
    const text = String(arg)
    SHAPED_SECRET.lastIndex = 0
    return SHAPED_SECRET.test(text) || SECRET_OPTION.test(text)
  })
}

export const ARGV_SECRET_REFUSAL =
  'refused: secrets are never accepted on the command line (use the environment variable or the hidden prompt)'

/**
 * Read one line from a terminal without echoing it. Rejects when there is no terminal.
 * @param {string} label
 * @param {{ input?: NodeJS.ReadStream, output?: NodeJS.WriteStream }} [io]
 * @returns {Promise<string>}
 */
export function readHiddenSecret(label, { input = process.stdin, output = process.stderr } = {}) {
  return new Promise((resolve, reject) => {
    if (!input.isTTY || typeof input.setRawMode !== 'function') {
      reject(new SecretInputError('no terminal is available for a hidden prompt'))
      return
    }
    output.write(`${label}: `)
    let value = ''
    const finish = (fn, arg) => {
      input.removeListener('data', onData)
      input.setRawMode(false)
      input.pause()
      output.write('\n')
      fn(arg)
    }
    const onData = (chunk) => {
      for (const ch of String(chunk)) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') return finish(resolve, value.trim())
        if (ch === '\u0003') return finish(reject, new SecretInputError('cancelled'))
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1)
        else value += ch
      }
    }
    input.setEncoding('utf8')
    input.setRawMode(true)
    input.resume()
    input.on('data', onData)
  })
}

/**
 * The secret for a script run: the environment variable if set, else a hidden prompt on a
 * terminal, else a refusal (a non-interactive run without the variable never guesses).
 * @param {{ envName: string, label: string, env?: Record<string, string | undefined>, isTTY?: boolean,
 *           prompt?: (label: string) => Promise<string> }} options
 * @returns {Promise<string>}
 */
export async function resolveSecret({ envName, label, env = process.env, isTTY = Boolean(process.stdin.isTTY), prompt = readHiddenSecret }) {
  const fromEnv = env[envName]?.trim()
  if (fromEnv) return fromEnv
  if (!isTTY) throw new SecretInputError(`${envName} is not set and there is no terminal for a hidden prompt`)
  const typed = (await prompt(label)).trim()
  if (!typed) throw new SecretInputError(`${label} was empty`)
  return typed
}
