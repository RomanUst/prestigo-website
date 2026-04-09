import Link from 'next/link'
import { AUTHORS, type AuthorSlug, formatBylineDate } from '@/lib/authors'

type Props = {
  authorSlug: AuthorSlug
  datePublished: string
  dateModified?: string
}

/**
 * Visible byline used on /guides, /compare, and other long-form pages.
 *
 * Renders a portrait, name, role, and published / updated dates so Google's
 * E-E-A-T crawl — and any AI answer engine summarising the page — sees a
 * named, bio'd expert behind the content. The corresponding Person schema is
 * produced separately via `personSchemaFor()` in lib/authors.ts and nested in
 * the page's Article node.
 */
export default function ArticleByline({
  authorSlug,
  datePublished,
  dateModified,
}: Props) {
  const a = AUTHORS[authorSlug]
  const showUpdated = dateModified && dateModified !== datePublished

  return (
    <div className="flex items-center gap-4 py-5 border-y border-anthracite-light">
      <Link
        href={`/authors/${a.slug}`}
        className="flex-shrink-0 block"
        aria-label={`About the author, ${a.name}`}
      >
        <picture>
          <source srcSet={a.image.replace(/\.jpg$/, '.avif')} type="image/avif" />
          <source srcSet={a.image.replace(/\.jpg$/, '.webp')} type="image/webp" />
          <img
            src={a.image}
            alt={a.imageAlt}
            width={56}
            height={56}
            loading="lazy"
            decoding="async"
            className="w-14 h-14 rounded-full object-cover border border-anthracite-light"
          />
        </picture>
      </Link>
      <div className="flex flex-col gap-0.5 min-w-0">
        <p className="font-body text-[11px] tracking-[0.1em] uppercase text-warmgrey">
          By{' '}
          <Link
            href={`/authors/${a.slug}`}
            className="text-offwhite hover:text-copper transition-colors"
          >
            {a.name}
          </Link>
          {' · '}
          <span>{a.jobTitle}</span>
        </p>
        <p className="font-body text-[11px] text-warmgrey tracking-[0.05em]">
          Published {formatBylineDate(datePublished)}
          {showUpdated ? ` · Updated ${formatBylineDate(dateModified!)}` : ''}
        </p>
      </div>
    </div>
  )
}
