// Phase 93 (plan 93-11): skeleton shown while an uncached tour page renders (dynamicParams = true).
// Title bars and a 440px gallery placeholder; no text, so there is nothing to translate.

export default function Loading() {
  return (
    <div aria-hidden="true" className="mx-auto max-w-7xl px-6 pt-24 sm:px-8 lg:px-12">
      <div className="h-3 w-48 animate-pulse rounded bg-anthracite-mid motion-reduce:animate-none" />
      <div className="mt-8 h-3 w-40 animate-pulse rounded bg-anthracite-mid motion-reduce:animate-none" />
      <div className="mt-4 h-10 w-full max-w-xl animate-pulse rounded bg-anthracite-mid motion-reduce:animate-none" />
      <div className="mt-4 h-4 w-full max-w-lg animate-pulse rounded bg-anthracite-mid motion-reduce:animate-none" />
      <div className="mt-8 h-[440px] w-full animate-pulse rounded bg-anthracite-mid motion-reduce:animate-none" />
    </div>
  )
}
