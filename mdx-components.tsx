import type { MDXComponents } from "mdx/types";

/**
 * Required by @next/mdx App Router. Maps HTML elements rendered from MDX
 * to React components. Phase 54: minimal pass-through (no styling). Phase
 * 55 will replace this with Prestigo design system components (Display
 * font headings, copper accents, dark-theme prose styles).
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
  };
}
