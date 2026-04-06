import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Upstash packages use native Node.js fetch and must not be bundled by webpack
  serverExternalPackages: ['@upstash/redis', '@upstash/ratelimit', '@upstash/core-analytics'],
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
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js inline scripts, GA, Stripe and Google Maps JS API
              "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://js.stripe.com https://maps.googleapis.com",
              // Stripe iframe, Google fonts frames
              "frame-src https://js.stripe.com https://hooks.stripe.com",
              // Inline styles from Next.js + Stripe elements
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://images.unsplash.com https://maps.gstatic.com https://maps.googleapis.com https://*.ggpht.com",
              // API calls: Stripe, GA, Supabase, Google Maps APIs
              `connect-src 'self' https://api.stripe.com https://www.google-analytics.com https://*.supabase.co https://routes.googleapis.com https://maps.googleapis.com`,
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
