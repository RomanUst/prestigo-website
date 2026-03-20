# Coding Conventions

**Analysis Date:** 2026-03-20

## Naming Patterns

**Files:**
- React components: PascalCase with `.tsx` extension (e.g., `Nav.tsx`, `ContactForm.tsx`, `HowItWorks.tsx`)
- Page components: lowercase with `.tsx` extension (e.g., `page.tsx`, `layout.tsx`)
- Configuration files: lowercase with camelCase in exports (e.g., `eslint.config.mjs`, `next.config.ts`)

**Functions:**
- React components: `export default function ComponentName() { ... }`
- Exported functions: camelCase
- Event handlers: onEventName pattern (e.g., `onClick`, `onChange`, `handleSubmit`)
- Utility callbacks: descriptive camelCase (e.g., `onScroll`, `set`)

**Variables:**
- Component state: camelCase (e.g., `scrolled`, `open`, `form`, `state`)
- Constants: UPPER_SNAKE_CASE for environment/hardcoded values (e.g., `WHATSAPP_NUMBER`)
- Data objects: camelCase arrays (e.g., `services`, `steps`, `testimonials`)
- Type discriminators: lowercase strings (e.g., `'idle'`, `'sending'`, `'success'`, `'error'`)

**Types:**
- React component props: `{ propName: type }` inline or `type ComponentProps = { ... }`
- Type unions: camelCase with `'literal'` values (e.g., `type FormState = 'idle' | 'sending' | 'success' | 'error'`)
- Type prefixes: Plain names without T prefix (e.g., `FormState` not `TFormState`)
- Generic objects: `type PropName = { key: value }` syntax

## Code Style

**Formatting:**
- Tool: Tailwind CSS for styling (embedded in className attributes)
- Indentation: 2 spaces (observed in config and code)
- Line length: No strict enforcement observed, varies by context
- Quote style: Single quotes in JSX attributes, template literals for interpolation

**Linting:**
- Tool: ESLint 9.x with Next.js configuration
- Config: `eslint.config.mjs` (flat config format)
- Extensions used:
  - `eslint-config-next/core-web-vitals` - Core Web Vitals rules
  - `eslint-config-next/typescript` - TypeScript rules
- Ignored paths: `.next/**`, `out/**`, `build/**`, `next-env.d.ts`

**CSS/Styling:**
- Framework: Tailwind CSS 4.x with PostCSS
- Design tokens defined in `app/globals.css`:
  - Colors: `--color-anthracite`, `--color-copper`, `--color-offwhite`, `--color-warmgrey`
  - Fonts: `--font-display` (Cormorant Garamond), `--font-body` (Montserrat)
  - Letter spacing: `--letter-spacing-label`, `--letter-spacing-nav`, etc.
- Utility-first approach: All styling via Tailwind classes and CSS variables
- Custom CSS classes for semantic elements (`.label`, `.display`, `.body-text`, `.btn-primary`, `.btn-ghost`, `.wordmark`)

## Import Organization

**Order:**
1. React/Next imports (e.g., `import type { Metadata } from 'next'`)
2. Built-in hooks (e.g., `import { useState, useEffect } from 'react'`)
3. Custom components with path aliases (e.g., `import Nav from '@/components/Nav'`)
4. Styling imports (e.g., `import './globals.css'`)
5. Font imports (e.g., `import { Cormorant_Garamond, Montserrat } from 'next/font/google'`)

**Path Aliases:**
- `@/*` maps to project root directory
- Used for imports: `import Nav from '@/components/Nav'`, `import ContactForm from '@/components/ContactForm'`
- All relative paths avoided in favor of alias-based imports

## Error Handling

**Patterns:**
- Forms: State-based validation with type-safe string literals (e.g., `'success' | 'error'`)
- No try-catch blocks observed in examined code
- Defensive programming: Conditional rendering based on form state
- Client-side errors: Managed via useState hooks
- Form submission: preventDefault, state management, timeout simulation

**Error States:**
- Form submission: `state` tracks 'idle', 'sending', 'success', 'error'
- Errors displayed or handled via conditional JSX (ternary operators)
- Success states: Form resets, success message displays with retry option

## Logging

**Framework:** `console` methods available but not used in examined code

**Patterns:**
- No explicit logging observed
- Browser console available for debugging
- Event listeners: `window.addEventListener('scroll', ...)` pattern used for side effects

## Comments

**When to Comment:**
- Component purposes documented via filenames and JSDoc-style comments
- Inline comments used for non-obvious layout/UI logic:
  - Decorative/background elements marked with comments (e.g., `{/* Background texture — subtle grain */}`)
  - Section dividers: `{/* Left — headline */}`, `{/* Mobile burger */}`
  - Functional areas clearly labeled

**JSDoc/TSDoc:**
- Not consistently used in examined components
- Type annotations preferred over comments for function parameters
- Component prop types: Defined inline as TypeScript types or function signatures

## Function Design

**Size:**
- Components typically 50-150 lines
- Large components decomposed by sections with clear comments
- Hero.tsx spans ~100 lines with logical section comments

**Parameters:**
- React components: Destructured props with type annotations (e.g., `{ whatsappNumber }: { whatsappNumber: string }`)
- Event handlers: React event types (e.g., `React.ChangeEvent<HTMLInputElement>`, `React.FormEvent`)
- Callbacks: Curried functions for form field updates (e.g., `const set = (k: keyof typeof form) => (e) => ...`)

**Return Values:**
- Components: JSX elements wrapped in semantic HTML tags (section, nav, main, footer)
- Conditional renders: Ternary operators for simple two-branch logic
- Early returns: Success states return different UI entirely

## Module Design

**Exports:**
- Pattern: `export default function ComponentName() { ... }`
- All components are default exports
- Data arrays exported at module level (services, steps, testimonials)
- No named exports observed; barrel files not used

**Barrel Files:**
- Not detected in examined structure
- Components imported individually with full paths from `@/components/`

**Code Organization:**
- Data before component: Constants and data objects declared at top
- Component last: Default export at bottom
- Inline styles: Limited use; primarily CSS variables and Tailwind classes
- Form state: Managed with useState hooks at component level

---

*Convention analysis: 2026-03-20*
