# Architecture

**Analysis Date:** 2026-03-20

## Pattern Overview

**Overall:** Next.js 16 app router with static pages composed from reusable components

**Key Characteristics:**
- File-based routing using Next.js app directory pattern
- Marketing/informational site with multiple entry pages
- Heavy component-based UI composition (10 shared components)
- Client-side interactivity for navigation and forms (marked with 'use client')
- Tailwind CSS for styling with custom design tokens in globals.css
- Server-side metadata generation for SEO on each route

## Layers

**Presentation (Pages):**
- Purpose: Page templates that compose reusable components into complete page experiences
- Location: `app/*/page.tsx` (home page at `app/page.tsx`)
- Contains: Page-level layouts, metadata, section structure
- Depends on: Components, Next.js metadata APIs
- Used by: Next.js routing engine, browsers

**Component Layer:**
- Purpose: Reusable UI building blocks for sections, forms, and interactive elements
- Location: `components/*.tsx`
- Contains: Section components (Hero, Nav, Footer, etc.), form components (ContactForm), data components (Services, Fleet, Routes)
- Depends on: React hooks (useState, useEffect), CSS classes (Tailwind), internal data
- Used by: Pages, other components, external services via iframe (LimoAnywhere)

**Style/Theme Layer:**
- Purpose: Global design tokens, typography, color system, animations
- Location: `app/globals.css`
- Contains: Tailwind theme overrides, CSS custom properties, keyframe animations
- Depends on: Tailwind CSS v4, Google Fonts (Cormorant Garamond, Montserrat)
- Used by: All components via Tailwind class names and CSS variables

**Configuration Layer:**
- Purpose: Next.js and build-time configuration
- Location: `next.config.ts` (Next.js config), `tsconfig.json` (TypeScript), `postcss.config.mjs` (Tailwind), `eslint.config.mjs`
- Contains: Image optimization rules, path aliases (@/*), TypeScript strict mode
- Depends on: Next.js framework, TypeScript compiler, PostCSS
- Used by: Build process, dev server

## Data Flow

**Home Page Composition:**

1. User navigates to `/`
2. `app/page.tsx` renders as entry point
3. Page composes sequence of components: Nav → Hero → BookingSection → HowItWorks → Services → Fleet → Routes → Testimonials → Footer
4. Each component renders independently with internal state (e.g., Nav manages mobile menu, ContactForm manages form submission)
5. Components may trigger external actions: iframe embeds (LimoAnywhere booking), WhatsApp links, email links

**Form Data Flow (Contact/Corporate Forms):**

1. User fills ContactForm or corporate form
2. Form state updated via `useState` hooks
3. User clicks "Send"
4. Message composed as URL-encoded string
5. Window.open redirects to WhatsApp Web with pre-filled message
6. Form shows success state, resets after 400ms

**Navigation Flow:**

1. User clicks nav link or scrolls
2. Links point to app-router pages (`/services`, `/fleet`, `/routes`, `/contact`, `/book`, `/corporate`, `/about`, `/faq`)
3. Each destination page: loads layout (Nav + Footer), renders hero section, composes specific content sections
4. All pages follow same template structure: header with metadata, hero section, content grid/sections, footer

**State Management:**

- No global state management (Redux, Zustand)
- Local component state only: `useState` for form fields, menu open/close, scroll position
- No persistence (no localStorage used)
- Each page instance starts fresh

## Key Abstractions

**Section Component Pattern:**

Components follow a consistent structure for major page sections:
- Grid-based layout (max-width container with responsive columns)
- Optional "label" (copper-colored section identifier)
- Copper-line divider
- Heading with optional italic variant
- Body text
- Feature lists or CTAs

Examples: `Hero.tsx`, `BookingSection.tsx`, `Services.tsx` (services page uses data-driven mapping)

**Form Abstraction:**

Two form components with similar patterns:
- `ContactForm` - general inquiries with service dropdown
- Corporate form (inline in `app/corporate/page.tsx`) - business account requests
Both: useState for fields, WhatsApp redirect on submit, success state display

**Navigation Abstraction:**

`Nav.tsx` handles:
- Desktop nav with link array mapping
- Mobile burger menu with toggle state
- Scroll-triggered background change
- Smooth link navigation with onClick close on mobile

**Card/Box Abstraction:**

Repeated border-and-padding boxes used for:
- Stat cards (Hero right side)
- Feature lists (Services page)
- Trust signals (Services, other pages)
Structure: `border border-anthracite-light p-8 flex flex-col ...`

## Entry Points

**Home Page:**
- Location: `app/page.tsx`
- Triggers: User visits domain root
- Responsibilities: Render hero, book section, service overview, testimonials, features

**Detail Pages:**
- `/services` (`app/services/page.tsx`) - Service directory with data-driven mapping
- `/book` (`app/book/page.tsx`) - Booking flow (placeholder for LimoAnywhere)
- `/contact` (`app/contact/page.tsx`) - Contact form + WhatsApp/email CTAs
- `/corporate` (`app/corporate/page.tsx`) - Corporate account request form
- `/fleet`, `/routes`, `/about`, `/faq` - Informational pages (routing structure present)

**Root Layout:**
- Location: `app/layout.tsx`
- Triggers: All routes
- Responsibilities: Load fonts, define global metadata, render skip-to-content link, provide children placeholder

## Error Handling

**Strategy:** Minimal explicit error handling, relies on browser defaults

**Patterns:**
- No try/catch in components
- Form validation: HTML5 `required` attribute on inputs
- No error boundary components detected
- WhatsApp/email links open in new tab (may fail silently if WhatsApp not installed)
- LimoAnywhere iframe loads with fallback placeholder if URL not configured
- 404 page: `app/not-found.tsx` (basic custom page)

## Cross-Cutting Concerns

**Logging:** None - no logging framework detected

**Validation:**
- HTML5 form validation (required, type="email", type="tel")
- No client-side schema validation (Zod/Yup)

**Authentication:** None - public marketing site, no auth required

**Styling:**
- Tailwind CSS v4 with custom theme in globals.css
- CSS custom properties for colors, fonts, spacing
- Class-based styling (no CSS-in-JS)
- Responsive design: Tailwind breakpoints (md: 768px, lg: 1024px)

**Navigation:**
- Next.js client-side routing (Link implied via `<a href="/path">`)
- Full-page anchor links (#book, #main-content)
- External links for WhatsApp, email, booking iframe

---

*Architecture analysis: 2026-03-20*
