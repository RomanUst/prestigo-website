# External Integrations

**Analysis Date:** 2026-03-20

## APIs & External Services

**Booking System:**
- LimoAnywhere - Integrated booking platform for chauffeur service reservations
  - Implementation: Embedded iframe in `components/BookingSection.tsx`
  - Configuration: URL placeholder at `const LIMOANYWHERE_URL = 'https://booking.limoanywhere.com/your-company-id'`
  - Status: Not yet configured (placeholder URL contains 'your-company-id')

**Communication:**
- WhatsApp - Contact form integration for inquiry submission
  - Implementation: Web URL scheme in `components/ContactForm.tsx`
  - Usage: Form data encoded and opened via `wa.me/` URL
  - Entry point: Contact form at `components/ContactForm.tsx` lines 27-31
  - Requires: WhatsApp phone number passed as `whatsappNumber` prop

**Image Optimization:**
- Unsplash - Remote image source for dynamic content
  - Configuration: Whitelisted domain in `next.config.ts`
  - Allowed domain: `images.unsplash.com` (HTTPS only)
  - Purpose: Image loading optimization via Next.js Image component

## Data Storage

**Databases:**
- Not detected - Application is a static/content website with no persistent data storage
- Contact data flows directly to WhatsApp, not stored in application

**File Storage:**
- Local static assets only
  - Location: `public/` directory
  - No cloud storage integration detected

**Caching:**
- Next.js built-in caching (ISR/static generation)
- No explicit caching system (Redis, Memcached, etc.) configured

## Authentication & Identity

**Auth Provider:**
- Not required - This is a public-facing marketing website with no user authentication

## Monitoring & Observability

**Error Tracking:**
- Not detected - No error tracking service configured

**Logs:**
- Standard output to console (browser console for client-side, Node.js stdout for server)
- No structured logging framework detected

## CI/CD & Deployment

**Hosting:**
- Vercel Platform - Primary deployment target
  - Configuration: `vercel.json` framework specification
  - Framework: Next.js

**CI Pipeline:**
- Not explicitly configured - Assumed handled by Vercel's automatic deployments

## Environment Configuration

**Required env vars:**
- `LIMOANYWHERE_URL` or hardcoded in `components/BookingSection.tsx` - Booking platform URL
- `WHATSAPP_NUMBER` or passed as prop to `ContactForm` component - WhatsApp contact number

**Secrets location:**
- No .env file present - Environment configuration not yet implemented
- Phone number currently expected as component prop from parent component

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- WhatsApp callback via URL scheme (not webhooks, user-initiated)
- LimoAnywhere booking callbacks (external service, transparent to this application)

---

*Integration audit: 2026-03-20*
