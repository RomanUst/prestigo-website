# Codebase Structure

**Analysis Date:** 2026-03-20

## Directory Layout

```
prestigo/
├── app/                    # Next.js app router - page components
│   ├── page.tsx           # Home page (/)
│   ├── layout.tsx         # Root layout (fonts, metadata)
│   ├── globals.css        # Design tokens, typography, animations
│   ├── not-found.tsx      # 404 page
│   ├── about/page.tsx     # About page
│   ├── book/page.tsx      # Booking page with LimoAnywhere placeholder
│   ├── contact/page.tsx   # Contact form page
│   ├── corporate/page.tsx # Corporate account request page
│   ├── faq/page.tsx       # FAQ page
│   ├── fleet/page.tsx     # Fleet showcase page
│   ├── routes/page.tsx    # Routes/intercity page
│   └── services/page.tsx  # Services directory page
│
├── components/            # Reusable React components
│   ├── Nav.tsx           # Navigation header with mobile menu
│   ├── Hero.tsx          # Hero section with headline and stats
│   ├── BookingSection.tsx # Booking area with LimoAnywhere iframe
│   ├── ContactForm.tsx   # General contact form (WhatsApp submission)
│   ├── HowItWorks.tsx    # Process steps section
│   ├── Services.tsx      # Service highlights section
│   ├── Fleet.tsx         # Fleet showcase section
│   ├── Routes.tsx        # Popular routes section
│   ├── Testimonials.tsx  # Customer testimonials section
│   └── Footer.tsx        # Footer with links and contact info
│
├── public/               # Static assets
│   ├── e-class.png      # Vehicle image
│   ├── s-class.png      # Vehicle image
│   ├── v-class.png      # Vehicle image
│   ├── favicon.ico      # Favicon
│   └── *.svg            # Logo/icon SVGs
│
├── .next/               # Next.js build output (generated)
├── .planning/           # GSD planning documents
├── node_modules/        # Dependencies (excluded from git)
│
├── package.json         # Project metadata, scripts, dependencies
├── package-lock.json    # Dependency lock file
├── tsconfig.json        # TypeScript compiler config
├── next.config.ts       # Next.js configuration
├── postcss.config.mjs   # PostCSS/Tailwind config
├── eslint.config.mjs    # ESLint rules
├── vercel.json          # Vercel deployment config
├── README.md            # Project readme
└── .gitignore           # Git exclusions
```

## Directory Purposes

**app/ - Pages & Layout:**
- Purpose: Next.js app router pages and root layout
- Contains: Page templates (page.tsx per route), global layout, global styles, metadata
- Key files: `layout.tsx` (root metadata, fonts), `globals.css` (design system), `page.tsx` (home)

**components/ - Reusable Sections:**
- Purpose: Shared React components used across pages
- Contains: Section components (Hero, Services, Routes), UI components (Nav, Footer), form components (ContactForm)
- Key files: `Nav.tsx` (navigation), `Footer.tsx` (global footer), `ContactForm.tsx` (multi-use form)

**public/ - Static Assets:**
- Purpose: Publicly accessible static files
- Contains: Vehicle images (e-class.png, s-class.png, v-class.png), SVG icons, favicon
- Key files: Vehicle showcase images, logo assets

## Key File Locations

**Entry Points:**
- `app/page.tsx`: Home page - main entry point, composes all hero and feature sections
- `app/layout.tsx`: Root layout - loads Google Fonts, sets global metadata, wraps all pages

**Configuration:**
- `next.config.ts`: Next.js config including image remote patterns for Unsplash
- `tsconfig.json`: TypeScript strict mode, path aliases (@/*), ES2017 target
- `postcss.config.mjs`: PostCSS pipeline for Tailwind v4
- `eslint.config.mjs`: ESLint rules configuration

**Core Logic:**
- `components/Nav.tsx`: Navigation with scroll detection and mobile burger menu state
- `components/ContactForm.tsx`: Form component with useState, WhatsApp submission
- `components/Hero.tsx`: Hero section with text layout and stat cards
- `app/globals.css`: Design tokens (colors, fonts, animations), Tailwind theme overrides

**Page Templates:**
- `app/services/page.tsx`: Data-driven service cards with mapping pattern
- `app/contact/page.tsx`: Contact page with ContactForm + WhatsApp/email links
- `app/corporate/page.tsx`: Corporate form with inline form component
- `app/book/page.tsx`: Booking placeholder with WhatsApp fallback

**Testing:**
- None detected - no test files found

## Naming Conventions

**Files:**
- Page files: `page.tsx` (Next.js convention)
- Components: `PascalCase.tsx` (e.g., `Nav.tsx`, `Hero.tsx`, `ContactForm.tsx`)
- Styles: `globals.css` for global, inline Tailwind classes for components
- Config files: lowercase with dot separator (e.g., `next.config.ts`, `eslint.config.mjs`)

**Directories:**
- Routes: lowercase, kebab-case matching URL structure (e.g., `/app/services/`, `/app/contact/`)
- Component folder: `components/` (no nesting)
- Static assets: `public/` (standard Next.js)

**Variables/Functions:**
- React components: PascalCase (Home, Nav, Hero)
- Hooks: camelCase with use prefix (useState, useEffect)
- Data arrays: lowercase plural (services, guarantees, trust)
- Constants: UPPER_SNAKE_CASE (e.g., LIMOANYWHERE_URL, WHATSAPP_NUMBER)

## Where to Add New Code

**New Feature/Page:**
1. Create route directory: `app/[new-feature]/page.tsx`
2. Page template: Wrap with Nav (import from @/components/Nav), Footer, metadata export
3. Content sections: Create components or compose existing ones
4. Example: `app/services/page.tsx` shows the pattern

**New Component/Module:**
1. Create file: `components/[ComponentName].tsx`
2. Export default function with PascalCase name
3. Use 'use client' directive if managing state (useState/useEffect)
4. Use Tailwind classes for styling (no separate CSS files)
5. Example: `components/ContactForm.tsx` shows form pattern, `components/Hero.tsx` shows section pattern

**Utilities/Helpers:**
- No utilities folder exists
- Small inline logic acceptable (form submission in ContactForm)
- For shared logic across components, create at component level or add to component file
- Example: `ContactForm.tsx` contains form helper functions (set, handleSubmit)

**Styles/Design Tokens:**
- All global styles in `app/globals.css`
- Extend Tailwind theme in `@theme` block
- CSS custom properties via `:root` variables
- Component styling: inline Tailwind classes only

## Special Directories

**.next/:**
- Purpose: Next.js build output and type definitions
- Generated: Yes (by `npm run build`)
- Committed: No (in .gitignore)

**node_modules/:**
- Purpose: Project dependencies
- Generated: Yes (by `npm install`)
- Committed: No (in .gitignore)

**.planning/:**
- Purpose: GSD planning and analysis documents
- Generated: Yes (by GSD commands)
- Committed: Yes (for team reference)

**public/:**
- Purpose: Static assets served directly by Next.js
- Generated: No (manually maintained)
- Committed: Yes (images and icons)

## Architectural Patterns

**Component Composition:**
All major sections follow a grid-based container pattern:
```
max-w-7xl mx-auto px-6 md:px-12
  grid grid-cols-1 md:grid-cols-[2-4] gap-10 md:gap-16
    [left column] - text/info
    [right column] - visual/form/list
```
Location: `components/Hero.tsx` (left text + right stats), `components/BookingSection.tsx` (left text + right iframe), pages like `app/contact/page.tsx`

**Page Template Structure:**
```
main#main-content
  Nav
  section#[topic] (hero with metadata)
  section... (content sections)
  Footer
```
Location: Every page file (`app/*/page.tsx`)

**Form Pattern:**
```
useState for form fields (name, email, service, etc.)
Helper: set() function to create field updaters
Handle submit: encode message, window.open() to WhatsApp
Success state: conditional render success message
```
Location: `components/ContactForm.tsx`, inline in `app/corporate/page.tsx`

---

*Structure analysis: 2026-03-20*
