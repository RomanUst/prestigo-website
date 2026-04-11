import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // 20 long-distance route pages removed 2026-04-09 per SEO strategy
    // — see /Users/romanustyugov/Desktop/founder prestigo/routes/03-noindex-rules-20-red-routes.md
    // Permanent redirects preserve any accumulated link equity to the /routes hub.
    const removedRedRoutes = [
      'prague-erfurt',
      'prague-augsburg',
      'prague-frankfurt',
      'prague-stuttgart',
      'prague-cologne',
      'prague-dusseldorf',
      'prague-hamburg',
      'prague-innsbruck',
      'prague-kosice',
      'prague-basel',
      'prague-zurich',
      'prague-bern',
      'prague-geneva',
      'prague-venice',
      'prague-verona',
      'prague-milan',
      'prague-strasbourg',
      'prague-paris',
      'prague-brussels',
      'prague-amsterdam',
    ]

    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.rideprestigo.com' }],
        destination: 'https://rideprestigo.com/:path*',
        permanent: true,
      },
      ...removedRedRoutes.map((slug) => ({
        source: `/routes/${slug}`,
        destination: '/routes',
        permanent: true,
      })),
      // Czech locale was never implemented. Any /cs or /cs/* request was
      // hitting Next.js trailing-slash strip (308) → 404. Redirect cleanly
      // to the homepage so crawlers see a single stable 301 and any
      // accumulated link equity is preserved. Remove these rules if a
      // real CS locale is added later.
      {
        source: '/cs',
        destination: '/',
        permanent: true,
      },
      {
        source: '/cs/:path*',
        destination: '/',
        permanent: true,
      },
    ]
  },
  images: {
    // Serve AVIF first, then WebP. Every modern browser (Chrome 85+, Safari 16+,
    // Firefox 93+, Edge 85+) supports AVIF — combined coverage is ~96% of
    // global traffic in 2026. next/image negotiates per request via the
    // Accept header and falls back to WebP/JPEG for the few clients that
    // don't accept AVIF.
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            // Modern browsers ignore this header (CSP is the replacement),
            // but legacy Internet Explorer and some older Safari/Android
            // versions shipped a buggy XSS auditor that could be abused to
            // create its own XSS via side-channel. Explicitly disabling it
            // is the OWASP-recommended value for modern applications.
            key: "X-XSS-Protection",
            value: "0",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js inline scripts, GA/GTM, Stripe and Google Maps JS API
              "script-src 'self' 'unsafe-inline' https://*.googletagmanager.com https://js.stripe.com https://maps.googleapis.com",
              // Stripe iframe, Google fonts frames
              "frame-src https://js.stripe.com https://hooks.stripe.com",
              // Inline styles from Next.js + Stripe elements
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // GA4 Enhanced Measurement may load tracking pixels from google-analytics.com
              "img-src 'self' data: blob: https://images.unsplash.com https://maps.gstatic.com https://maps.googleapis.com https://*.ggpht.com https://*.google-analytics.com https://*.googletagmanager.com",
              "font-src 'self' https://fonts.gstatic.com",
              // API calls: Stripe, GA4 (including regional endpoints like
              // region1.google-analytics.com — required for EU traffic to
              // reach GA4), Google Tag Manager, Supabase, Google Maps APIs.
              // places.googleapis.com is Places API (New) REST endpoint used
              // by AddressInputNew (behind NEXT_PUBLIC_USE_NEW_PLACES_API flag);
              // maps.googleapis.com is used by the legacy JS SDK path.
              `connect-src 'self' https://api.stripe.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.supabase.co https://routes.googleapis.com https://maps.googleapis.com https://places.googleapis.com`,
              "report-uri /api/csp-report",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
