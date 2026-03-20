# Technology Stack

**Analysis Date:** 2026-03-20

## Languages

**Primary:**
- TypeScript ^5 - Used throughout the application for type-safe development
- TSX - React components with TypeScript

**Secondary:**
- JavaScript (ES2017) - Configuration files and Node.js runtime

## Runtime

**Environment:**
- Node.js v16.14.0 (determined from environment; no .nvmrc specified)

**Package Manager:**
- npm (inferred from package-lock.json)
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Next.js 16.1.7 - Full-stack React framework with App Router
- React 19.2.3 - UI library
- React DOM 19.2.3 - DOM rendering

**Styling:**
- Tailwind CSS ^4 - Utility-first CSS framework
- @tailwindcss/postcss ^4 - PostCSS plugin for Tailwind

**Dev Tools:**
- TypeScript ^5 - Type checking and compilation
- ESLint ^9 - Code linting with Next.js configuration
- eslint-config-next 16.1.7 - Next.js linting rules
- PostCSS - CSS transformation tool (via tailwindcss plugin)

## Key Dependencies

**Critical:**
- next 16.1.7 - Framework for server-side rendering, API routes, and full-stack development
- react 19.2.3 - Component-based UI library
- react-dom 19.2.3 - React rendering into DOM

**Type Definitions:**
- @types/node ^20 - Node.js type definitions
- @types/react ^19 - React component type definitions
- @types/react-dom ^19 - React DOM type definitions

## Configuration

**Environment:**
- No .env file present - Application relies on environment-provided configuration
- No custom environment variables detected in codebase

**Build:**
- TypeScript compilation: `tsconfig.json` with strict mode, ES2017 target
- Next.js configuration: `next.config.ts` - Configures remote image optimization from unsplash.com
- PostCSS configuration: `postcss.config.mjs` - Tailwind CSS processing
- ESLint configuration: `eslint.config.mjs` - Next.js web vitals and TypeScript rules

**Deployment Configuration:**
- `vercel.json` - Framework specification for Vercel deployment

## Platform Requirements

**Development:**
- Node.js 16+
- npm or compatible package manager
- TypeScript compiler (dev dependency)

**Production:**
- Vercel Platform (configured as deployment target per vercel.json)
- Modern browser support (uses Next.js 16 with React 19)

## Build Scripts

**Development:**
```bash
npm run dev
```
Runs Next.js development server

**Production Build:**
```bash
npm run build
```
Builds optimized Next.js application

**Production Start:**
```bash
npm start
```
Starts production Next.js server

**Linting:**
```bash
npm run lint
```
Runs ESLint validation

---

*Stack analysis: 2026-03-20*
