'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'

export type BentoRoute = { slug: string; to: string; time: string; price?: number }
export type BentoTile = { span: string; feature?: boolean; img?: string }

type Props = { pool: BentoRoute[]; tiles: BentoTile[] }

const FADE_MS = 340
const MIN_DELAY = 5000
const MAX_DELAY = 7000

export default function RoutesBento({ pool, tiles }: Props) {
  // Which pool index each tile currently shows (start with distinct routes).
  const [assign, setAssign] = useState<number[]>(() => tiles.map((_, i) => i % pool.length))
  const [fading, setFading] = useState<boolean[]>(() => tiles.map(() => false))
  // Reserved target route per tile — updated the instant a swap is decided (before
  // the fade completes) so concurrent swaps can't pick the same route → no dupes.
  const slotsRef = useRef<number[]>(assign)

  useEffect(() => {
    if (pool.length <= tiles.length) return // not enough routes to swap in a fresh one
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let cancelled = false
    const timers: Array<ReturnType<typeof setTimeout>> = []

    const swap = (t: number) => {
      // Pick a route not currently shown or reserved by any tile.
      const used = new Set(slotsRef.current)
      const candidates = pool.map((_, i) => i).filter((i) => !used.has(i))
      if (candidates.length === 0) return
      const next = candidates[Math.floor(Math.random() * candidates.length)]
      slotsRef.current = slotsRef.current.map((v, i) => (i === t ? next : v)) // reserve immediately

      setFading((f) => f.map((v, i) => (i === t ? true : v)))
      timers.push(
        setTimeout(() => {
          if (cancelled) return
          setAssign((a) => a.map((v, i) => (i === t ? next : v)))
          setFading((f) => f.map((v, i) => (i === t ? false : v)))
        }, FADE_MS),
      )
    }

    const schedule = (t: number) => {
      const delay = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY)
      timers.push(
        setTimeout(() => {
          if (cancelled) return
          swap(t)
          schedule(t)
        }, delay),
      )
    }

    tiles.forEach((_, t) => schedule(t))

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [pool, tiles])

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-[150px] lg:auto-rows-[172px]">
      {tiles.map((tile, t) => {
        const r = pool[assign[t]]
        return (
          <a
            key={t}
            href={`/routes/${r.slug}`}
            className={`group relative flex overflow-hidden border border-anthracite-light bg-anthracite transition-[transform,border-color] duration-500 ease-out hover:-translate-y-1 hover:border-copper/60 ${tile.span}`}
          >
            {tile.img && (
              <>
                <Image
                  src={tile.img}
                  alt=""
                  fill
                  sizes="(max-width: 1024px) 100vw, 640px"
                  className="object-cover opacity-30 transition-transform duration-[1200ms] ease-out group-hover:scale-105"
                />
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(to top, rgba(15,29,44,0.96) 10%, rgba(15,29,44,0.6) 100%)' }}
                />
              </>
            )}

            {/* Gold sheen on hover */}
            <div
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              style={{ background: 'radial-gradient(130% 100% at 100% 0%, rgba(191,160,106,0.16), transparent 60%)' }}
            />

            {/* Rotating content — fades out/in on route change */}
            <div
              className="relative z-10 flex h-full w-full flex-col justify-between p-6"
              style={{
                opacity: fading[t] ? 0 : 1,
                transform: fading[t] ? 'translateY(8px)' : 'translateY(0)',
                transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
              }}
            >
              <div className="flex items-center gap-3">
                <span className="label" style={{ fontSize: '10px' }}>{r.time}</span>
                {r.price != null && (
                  <>
                    <span className="w-1 h-1 rounded-full" style={{ background: 'var(--copper)' }} />
                    <span className="label" style={{ fontSize: '10px' }}>from €{r.price}</span>
                  </>
                )}
              </div>

              <div>
                <h3 className={`display mb-3 ${tile.feature ? 'text-[30px] md:text-[40px]' : 'text-[22px] md:text-[26px]'}`}>
                  Prague <span style={{ color: 'var(--warmgrey)' }}>→</span> {r.to}
                </h3>
                <span className="inline-flex items-center gap-2 font-body font-light text-[10px] tracking-[0.2em] uppercase text-warmgrey transition-colors group-hover:text-offwhite">
                  View route
                  <span className="transition-transform duration-500 ease-out group-hover:translate-x-1">→</span>
                </span>
              </div>
            </div>
          </a>
        )
      })}
    </div>
  )
}
