/**
 * Build-time lastmod resolver for sitemap.
 *
 * Returns the most-recent git commit date that touched the given source file,
 * falling back to the filesystem mtime, falling back to the build time. This
 * gives Google real per-page modification signals instead of a single uniform
 * build-time timestamp (uniform lastmod is discounted by Google).
 *
 * Runs only at build time (sitemap.ts is a Next.js server generator), so the
 * child_process + fs usage is safe and never shipped to the client.
 */

import { execSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { resolve } from 'node:path'

const PROJECT_ROOT = process.cwd()
const FALLBACK = new Date()

// Memoise so the sitemap doesn't spawn `git log` 66 times if lib imports
// cascade. Keyed by absolute path.
const cache = new Map<string, Date>()

export function lastModFor(relativePath: string): Date {
  const abs = resolve(PROJECT_ROOT, relativePath)
  const cached = cache.get(abs)
  if (cached) return cached

  let date: Date | null = null

  // 1) Git: most recent commit that touched this file
  try {
    const iso = execSync(`git log -1 --format=%cI -- "${relativePath}"`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (iso) {
      const parsed = new Date(iso)
      if (!Number.isNaN(parsed.getTime())) date = parsed
    }
  } catch {
    // git not available, or path outside repo — fall through
  }

  // 2) Filesystem mtime
  if (!date) {
    try {
      const stat = statSync(abs)
      date = stat.mtime
    } catch {
      // file missing — fall through
    }
  }

  // 3) Build-time fallback
  if (!date) date = FALLBACK

  cache.set(abs, date)
  return date
}
