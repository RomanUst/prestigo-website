import Script from 'next/script'

const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID

/**
 * Microsoft Clarity — free session replays, heatmaps, and rage-click detection.
 *
 * Loaded unconditionally alongside GA4: Clarity masks sensitive input fields by
 * default and anonymises IPs, which meets legitimate-interest criteria under
 * most EU interpretations. If stricter opt-in is required later, call
 * `window.clarity('consent', false)` from the cookie banner's decline path.
 *
 * The official Clarity snippet is an IIFE that dynamically injects a <script
 * src="https://www.clarity.ms/tag/..."> element. Under our nonce CSP this
 * works because `strict-dynamic` grants trust to scripts created by a
 * nonce-bearing script.
 */
export default function Clarity({ nonce }: { nonce?: string }) {
  if (!CLARITY_ID) return null

  return (
    <Script id="clarity-init" strategy="afterInteractive" nonce={nonce}>
      {`
        (function(c,l,a,r,i,t,y){
          c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
          t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
          y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
        })(window, document, "clarity", "script", "${CLARITY_ID}");
      `}
    </Script>
  )
}
