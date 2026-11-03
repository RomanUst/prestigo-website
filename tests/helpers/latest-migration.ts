import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

// Phase 87: migrations redefine functions with CREATE OR REPLACE, so a text test pinned to the file
// that first created a function verifies a dead definition. These helpers scan supabase/migrations
// in filename order and answer from the LAST definition, which is the one that is live.
// Comment lines are stripped, so a rule mentioned only in a comment does not count.

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n')
}

/** Comment-stripped text of one migration file. */
export function loadMigration(name: string): string {
  return stripComments(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'))
}

/**
 * Text of the last `CREATE OR REPLACE FUNCTION public.<name>(` in filename order, from the CREATE
 * keyword up to and including its closing `$$;`. Throws when no migration defines the function.
 */
export function latestFunctionBody(name: string): string {
  const needle = `CREATE OR REPLACE FUNCTION public.${name}(`
  let found: string | null = null
  for (const file of migrationFiles()) {
    const sql = loadMigration(file)
    let from = 0
    for (;;) {
      const start = sql.indexOf(needle, from)
      if (start === -1) break
      const open = sql.indexOf('AS $$', start)
      if (open === -1) break
      const close = sql.indexOf('$$;', open + 5)
      if (close === -1) break
      found = sql.slice(start, close + 3)
      from = close + 3
    }
  }
  if (found === null) throw new Error(`function public.${name} is not defined in any migration`)
  return found
}

/** Values of the last `bookings_status_check CHECK (status IN (...))` in filename order. */
export function latestStatusCheckValues(): string[] {
  let values: string[] | null = null
  for (const file of migrationFiles()) {
    const sql = loadMigration(file)
    const re = /bookings_status_check\s+CHECK \(status IN \(([\s\S]*?)\)\)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(sql)) !== null) {
      values = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
    }
  }
  if (values === null) throw new Error('bookings_status_check is not defined in any migration')
  return values
}
