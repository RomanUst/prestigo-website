/**
 * Phase 75, Plan 31 — runs Next.js's REAL metadata resolution
 * (`accumulateMetadata` from next/dist/lib/metadata/resolve-metadata) over a
 * list of per-segment Metadata objects, exactly the way the App Router merges
 * a root layout's metadata with a page's metadata before rendering <head>.
 *
 * This is the end-to-end proof that the locale layout's default twitter block
 * (card + images only) lets Next.js's own postProcessMetadata mirror each
 * page's resolved openGraph title/description into twitter:* — so a future
 * Next.js upgrade that stops doing that fails the contract test instead of
 * silently re-introducing the English twitter:* leak (WR-02).
 *
 * resolve-metadata.js is a CJS module that `require('server-only')`; vitest
 * cannot mock a bare specifier required from inside a CJS dependency, so we
 * shim Node's resolver to map `server-only` to Next's own empty stub and load
 * the module with createRequire.
 */
import Module, { createRequire } from 'node:module'
import type { Metadata, ResolvedMetadata } from 'next'

const require = createRequire(import.meta.url)

type ResolveFilename = (request: string, ...rest: unknown[]) => string
const ModuleWithResolver = Module as unknown as { _resolveFilename: ResolveFilename }

const SERVER_ONLY_STUB = require.resolve('next/dist/compiled/server-only/empty.js')
const originalResolveFilename = ModuleWithResolver._resolveFilename
if (!(originalResolveFilename as { __gsdServerOnlyShim?: boolean }).__gsdServerOnlyShim) {
  const shim: ResolveFilename = function (this: unknown, request, ...rest) {
    if (request === 'server-only') return SERVER_ONLY_STUB
    return originalResolveFilename.call(this, request, ...rest)
  }
  ;(shim as { __gsdServerOnlyShim?: boolean }).__gsdServerOnlyShim = true
  ModuleWithResolver._resolveFilename = shim
}

const { accumulateMetadata } = require('next/dist/lib/metadata/resolve-metadata') as {
  accumulateMetadata: (
    route: string,
    metadataItems: Array<[Metadata | null, null]>,
    pathname: Promise<string>,
    metadataContext: { trailingSlash: boolean; isStaticMetadataRouteFile: boolean }
  ) => Promise<ResolvedMetadata>
}

/**
 * Resolve `items` (root layout first, page last) through Next.js's real
 * accumulateMetadata, returning the ResolvedMetadata that feeds <head>.
 */
export async function resolveNextMetadata(
  items: Metadata[],
  pathname = '/qa'
): Promise<ResolvedMetadata> {
  return accumulateMetadata(
    '/[locale]/qa',
    items.map((m) => [m, null] as [Metadata, null]),
    Promise.resolve(pathname),
    { trailingSlash: false, isStaticMetadataRouteFile: false }
  )
}
