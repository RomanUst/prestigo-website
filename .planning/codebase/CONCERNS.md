# Codebase Concerns

**Analysis Date:** 2026-03-20

## Placeholder Phone Numbers

**Hardcoded test phone numbers in production code:**
- Issue: Multiple locations contain placeholder phone numbers (`420000000000` and `+420 XXX XXX XXX`) that were intended to be replaced with real business contact information
- Files:
  - `app/faq/page.tsx:20` — "call directly on +420 XXX XXX XXX"
  - `app/book/page.tsx:46` — WhatsApp link with `420000000000`
  - `app/contact/page.tsx:11` — `WHATSAPP_NUMBER = '420000000000'` with inline comment "replace with real number"
  - `app/contact/page.tsx:69` — Phone tel link hardcoded as `+420000000000`
  - `app/corporate/page.tsx:9` — `WHATSAPP_NUMBER = '420000000000'`
  - `components/Footer.tsx:75` — Phone tel link hardcoded as `+420000000000`
- Impact: Users cannot contact business via phone or WhatsApp; misleading contact information damages trust; customer acquisition and support blocked
- Fix approach:
  1. Create environment variables for phone and WhatsApp number: `NEXT_PUBLIC_PHONE_NUMBER` and `NEXT_PUBLIC_WHATSAPP_NUMBER`
  2. Update all hardcoded references to use environment variables
  3. Document in deployment guide that these must be set during build
  4. Add validation during build to fail if these are not properly configured

## Missing Contact Information

**Incomplete business contact data:**
- Issue: Email address listed as generic `info@prestigo.com` with no verification that this is operational; location data is vague ("Prague, Czech Republic" and "Service area: Central Europe")
- Files:
  - `app/contact/page.tsx:75` — `info@prestigo.com`
  - `components/Footer.tsx:80` — `info@prestigo.com`
- Impact: Email address may not route to actual support team; vague location lacks specific address for business credibility
- Fix approach: Replace with verified email address and add full business address; consider adding business registration details for legal compliance

## Form Handling Without Backend Integration

**Contact and corporate request forms rely entirely on client-side WhatsApp forwarding:**
- Issue: `ContactForm.tsx` and corporate page forms simulate success (400ms setTimeout) and redirect to WhatsApp without any server-side validation, error handling, or persistence. No backend captures form submissions for follow-up, audit, or tracking.
- Files:
  - `components/ContactForm.tsx:34-37` — Hardcoded `setTimeout(() => setState('success'))`
  - `app/corporate/page.tsx:25-28` — Identical pattern for corporate form
- Impact:
  - No record of contact attempts; customers may not realize if the message failed to send
  - No ability to follow up if WhatsApp is blocked/unavailable in their region
  - No CRM integration or lead tracking
  - Forms claim "We respond within 30 minutes" but no backend system ensures this
- Fix approach:
  1. Create API endpoint `POST /api/contact` and `POST /api/corporate` that stores submissions in database
  2. Add real validation and error states
  3. Send confirmation emails to customer and business
  4. Add fallback email option if WhatsApp fails
  5. Implement proper loading/error states instead of hardcoded timeout

## Security: No Form Validation or Sanitization

**Contact forms lack input validation and XSS protection:**
- Issue: `ContactForm.tsx` and corporate form directly encode user input into URLs without validation. No server-side sanitization.
- Files:
  - `components/ContactForm.tsx:28-30` — Direct encodeURIComponent of user input
  - `app/corporate/page.tsx:21-23` — Same pattern
- Impact: Malicious input could be encoded into URLs; XSS possible if WhatsApp message is ever displayed back to users; invalid email/phone could be submitted without feedback
- Fix approach:
  1. Add client-side validation (email format, phone pattern, message length)
  2. Add server-side validation and sanitization before any processing
  3. Never trust client input directly in URLs

## Unfinished Pages and Placeholder States

**Multiple pages have stub content or incomplete features:**
- Issue: Book page explicitly states "Booking system coming soon" with placeholder message
- Files:
  - `app/book/page.tsx:40` — "Booking system coming soon"
- Impact: Users landing on `/book` cannot complete primary conversion flow; redirected to WhatsApp or contact form instead; missed sales
- Fix approach: Either build booking system or set booking page to `noindex` (already done) and redirect to `/contact` on landing

## Hardcoded Styling and Layout Issues

**Many inline styles and magic numbers throughout components:**
- Issue: Font sizes, padding, and colors are scattered as inline styles (`style={{ color: 'var(--copper)' }}`) instead of using CSS classes. Tailwind arbitrary values used inconsistently (`text-[40px]`, `text-[52px]`).
- Files: Nearly every component has inline styles:
  - `app/faq/page.tsx` — Multiple `style={{ lineHeight: '1.9' }}`
  - `components/Hero.tsx:9` — SVG background with inline backgroundImage
  - `components/Footer.tsx` — Multiple inline color styles
  - `components/ContactForm.tsx:41-43` — Long className strings with arbitrary values
- Impact:
  - Difficult to maintain design system consistency
  - Hard to implement dark mode or theme changes
  - Code readability reduced
  - Future design updates require touching many files
- Fix approach:
  1. Move all color/style variables to CSS custom properties in `globals.css` (already partially done)
  2. Create utility classes for repeated patterns (e.g., `.input-field`, `.label-small`)
  3. Use Tailwind @apply directives to reduce className repetition
  4. Create component-level CSS modules for complex styling

## Missing Meta Tags and SEO Issues

**Incomplete metadata on some pages:**
- Issue: `book/page.tsx` is marked `robots: 'noindex'` (correct for a placeholder), but content references features not yet built ("confirmed in seconds", "instant booking")
- Files:
  - `app/book/page.tsx:8` — `robots: 'noindex'`
- Impact: Sends mixed signals to search engines; placeholder content could confuse users if accidentally indexed
- Fix approach: Either complete booking system before removing noindex, or update messaging to be transparent about the coming soon status

## TypeScript Strictness

**Current TypeScript setup is strict but some patterns bypass checks:**
- Issue: `tsconfig.json` uses strict mode, but forms use loose event handler patterns without full type safety
- Files:
  - `components/ContactForm.tsx:20` — Event handler type is wide union type
- Impact: Low risk currently, but could miss bugs with form field refactoring
- Fix approach: Continue maintaining strict mode; is already well-configured

## Missing Tests and No CI/CD

**No test files detected and no CI/CD pipeline visible:**
- Issue: No test files found in codebase; `eslint` in package.json but no GitHub Actions or other CI configured
- Files: None
- Impact: No automated quality checks; deployments lack safety net; regressions not caught before production
- Fix approach:
  1. Add Jest/Vitest configuration for unit tests
  2. Add integration tests for key flows (contact form, navigation)
  3. Set up GitHub Actions workflow for lint + test on pull requests
  4. Add pre-commit hooks to catch issues before pushing

## Build Configuration Concerns

**Next.js config has limited setup:**
- Issue: `next.config.ts` only configures Unsplash image pattern; missing important security and performance settings
- Files:
  - `next.config.ts`
- Impact: No security headers, no CSP, no response compression config, no rate limiting on API routes (when built)
- Fix approach:
  1. Add `headers()` export for security headers (CSP, X-Frame-Options, etc.)
  2. Add `redirects()` export for SEO-safe redirects (if any)
  3. Configure image optimization properly
  4. Add middleware for rate limiting when backend routes are added

## Accessibility Issues

**Missing ARIA labels and semantic improvements:**
- Issue: Mobile menu button has `aria-label="Menu"` (good), but many sections lack proper heading hierarchy and ARIA landmarks
- Files: All page files
- Impact: Screen reader users have difficulty navigating; WCAG compliance gaps
- Fix approach:
  1. Add proper heading hierarchy (use `<h2>`, `<h3>` instead of all display classes)
  2. Add ARIA landmarks (`<main>`, `<nav>`, `<footer>` already present)
  3. Test with screen readers
  4. Add skip navigation link (already present in layout.tsx)

## Performance Considerations

**Google Fonts loading and potential CLS:**
- Issue: `layout.tsx` imports Cormorant Garamond and Montserrat fonts synchronously; no font subsetting or preloading strategy
- Files:
  - `app/layout.tsx:2`
  - `app/globals.css:1` — Tailwind import
- Impact: Potential font loading delay; possible Cumulative Layout Shift (CLS) if fonts load after initial paint
- Fix approach:
  1. Add font preloading in layout
  2. Consider font-display: swap or variable fonts to minimize CLS
  3. Ensure fallback fonts match design intent

## Image Optimization

**Unsplash images used in components without Next.js Image component:**
- Issue: Hero section and other areas likely use standard `<img>` tags or background images from Unsplash; no lazy loading or responsive image handling visible
- Files:
  - `components/Hero.tsx:9` — Background image via SVG
  - Other components not fully inspected
- Impact: Large unoptimized images; slower page load on mobile; missed WebP/modern format support
- Fix approach:
  1. Use Next.js `<Image>` component from `next/image`
  2. Add proper `srcset` and responsive sizes
  3. Enable image optimization in deployment

## Dependencies at Risk

**No major security issues detected, but note:**
- Issue: Using Next.js 16.1.7, React 19.2.3, Tailwind CSS 4; these are recent versions and may lack production hardening
- Files:
  - `package.json`
- Impact: Early adoption of major versions means fewer battle-tested patterns; potential for undiscovered bugs
- Fix approach:
  1. Monitor GitHub security advisories for dependencies
  2. Keep dependencies updated
  3. Test thoroughly after upgrades
  4. Consider pinning to LTS versions for stability if preferred

## Duplicate Phone Number Constants

**Phone and WhatsApp numbers defined in multiple files:**
- Issue: `WHATSAPP_NUMBER` constant duplicated in `contact/page.tsx:11`, `corporate/page.tsx:9`, and `Footer.tsx`
- Files:
  - `app/contact/page.tsx:11`
  - `app/corporate/page.tsx:9`
  - `components/Footer.tsx` (hardcoded)
- Impact: If phone number changes, requires updates in multiple locations; risk of inconsistency
- Fix approach: Create environment variable and shared constant file; export from `.env` and a shared utils module

## Missing Analytics and Conversion Tracking

**No analytics or tracking setup visible:**
- Issue: No Google Analytics, Hotjar, or conversion pixel tracking in layout
- Files:
  - `app/layout.tsx`
- Impact: Cannot measure conversion rates, user behavior, or marketing effectiveness; flying blind on performance
- Fix approach:
  1. Integrate Google Analytics 4
  2. Add conversion tracking for "Book now" clicks
  3. Add event tracking for form submissions
  4. Monitor bounce rate and top exit pages

---

*Concerns audit: 2026-03-20*
