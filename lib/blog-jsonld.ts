/**
 * Schema.org JSON-LD builder for MDX blog articles.
 *
 * Type discrimination locked in STATE.md Phase 55 decisions:
 * "Schema type is BlogPosting (not Article) — Google-eligible, signals
 *  editorial timestamp, correct distinction from existing editorial pages."
 *
 * Returns a @graph with BreadcrumbList + BlogPosting. The publisher node
 * shares the #business @id declared in the site-wide schema but re-emits
 * name + logo inline: Google validates Article publisher per-page, so an
 * @id-only reference (whose target node isn't on the blog page) leaves the
 * required name/logo unresolved.
 */

import type { BlogPost } from '@/lib/blog'
import { personSchemaFor } from '@/lib/authors'

const ORIGIN = 'https://rideprestigo.com'

export function buildBlogPostingJsonLd(post: BlogPost): Record<string, unknown> {
  const articleUrl = `${ORIGIN}/blog/${post.slug}`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        '@id': `${articleUrl}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${ORIGIN}/blog` },
          { '@type': 'ListItem', position: 3, name: post.title, item: articleUrl },
        ],
      },
      {
        '@type': 'BlogPosting',
        '@id': `${articleUrl}#article`,
        headline: post.title,
        description: post.description,
        image: {
          '@type': 'ImageObject',
          url: `${ORIGIN}${post.coverImage}`,
          width: 1200,
          height: 630,
        },
        author: personSchemaFor(post.author),
        publisher: {
          '@type': 'Organization',
          '@id': `${ORIGIN}/#business`,
          name: 'PRESTIGO',
          logo: {
            '@type': 'ImageObject',
            url: `${ORIGIN}/logo.png`,
            width: 512,
            height: 512,
          },
        },
        mainEntityOfPage: articleUrl,
        url: articleUrl,
        datePublished: post.date,
        dateModified: post.dateModified ?? post.date,
      },
    ],
  }
}
