import type { MDXComponents } from 'mdx/types'
import type { ReactNode } from 'react'

/**
 * Required by @next/mdx App Router. Maps HTML elements rendered from MDX
 * to Prestigo design system styles. Mappings sourced verbatim from
 * .planning/phases/55-blog-ui-listing-article-pages/55-UI-SPEC.md
 * (MDX Prose Styling table).
 *
 * Font weights: 300 (light) and 400 (regular) only — never 500/600/700.
 * Colors: --offwhite for headings/strong, --warmgrey for body, --copper*
 * for accents.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    h2: ({ children }: { children?: ReactNode }) => (
      <h2 className="font-display font-light text-[28px] md:text-[32px] text-offwhite mt-14 mb-6 leading-[1.25]">
        {children}
      </h2>
    ),
    h3: ({ children }: { children?: ReactNode }) => (
      <h3 className="font-display font-light text-[22px] md:text-[26px] text-offwhite mt-10 mb-4 leading-[1.3]">
        {children}
      </h3>
    ),
    p: ({ children }: { children?: ReactNode }) => (
      <p className="font-body font-light text-[14px] text-warmgrey mb-5 leading-[1.75] tracking-[0.03em]">
        {children}
      </p>
    ),
    ul: ({ children }: { children?: ReactNode }) => (
      <ul className="flex flex-col gap-2 mb-6 pl-0 list-none">{children}</ul>
    ),
    li: ({ children }: { children?: ReactNode }) => (
      <li className="flex items-start gap-3 font-body font-light text-[13px] text-warmgrey leading-[1.8]">
        <span
          aria-hidden="true"
          className="mt-[10px] inline-block w-[6px] h-[6px] rounded-full shrink-0"
          style={{ backgroundColor: 'var(--copper)' }}
        />
        <span>{children}</span>
      </li>
    ),
    strong: ({ children }: { children?: ReactNode }) => (
      <strong className="text-offwhite font-normal">{children}</strong>
    ),
    a: ({ href, children }: { href?: string; children?: ReactNode }) => (
      <a
        href={href}
        className="underline underline-offset-2 transition-colors"
        style={{ color: 'var(--copper-light)' }}
      >
        {children}
      </a>
    ),
    blockquote: ({ children }: { children?: ReactNode }) => (
      <blockquote
        className="pl-6 py-2 my-8 font-display font-light text-[18px] text-offwhite italic leading-[1.5]"
        style={{ borderLeft: '2px solid var(--copper)' }}
      >
        {children}
      </blockquote>
    ),
    hr: () => <hr className="border-0 border-t border-anthracite-light my-12" />,
  }
}
