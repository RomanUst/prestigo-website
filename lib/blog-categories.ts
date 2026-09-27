/**
 * Blog category label localization (75-28, GAP-4d).
 *
 * Post frontmatter (content/blog/<locale>/*.mdx) and the JSX_POSTS registry
 * in lib/blog.ts keep their English `category` value — it is data, shared
 * across locales and never edited per locale. The visible label is mapped
 * to a messages BlogCategories.<key> entry at render time; an unknown
 * category renders its raw value unchanged.
 */
export const BLOG_CATEGORY_KEYS: Readonly<Record<string, string>> = {
  'Airport Transfer': 'airportTransfer',
  'Intercity Routes': 'intercityRoutes',
  'Chauffeur Service': 'chauffeurService',
}

export function blogCategoryKey(category: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(BLOG_CATEGORY_KEYS, category)
    ? BLOG_CATEGORY_KEYS[category]
    : undefined
}
