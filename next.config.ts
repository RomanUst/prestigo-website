import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.rideprestigo.com' }],
        destination: 'https://rideprestigo.com/:path*',
        permanent: true,
      },
    ]
  },
  images: {
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
              // reach GA4), Google Tag Manager, Supabase, Google Maps APIs
              `connect-src 'self' https://api.stripe.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.supabase.co https://routes.googleapis.com https://maps.googleapis.com`,
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
