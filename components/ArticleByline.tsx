import { Link } from '@/i18n/routing'
import { AUTHORS, type AuthorSlug } from '@/lib/authors'
import { formatLocaleDate } from '@/lib/locale-date'
import { getPageContent } from '@/lib/page-content'

type Props = {
  authorSlug: AuthorSlug
  datePublished: string
  dateModified?: string
  /**
   * The ROUTE locale (from the calling page's `params`). 75-28 / CR-01:
   * every call site sits on a force-static route, so the locale must be
   * threaded in explicitly — never resolved from the request scope here.
   */
  locale: string
}

/** Localized author strings from content/pages/<locale>/authors/<slug>.json. */
type AuthorBylineContent = {
  labels: {
    aboutAuthorAria: string
    /** 75-34 (WR-04): byline prefix before the author name ("By"). */
    by: string
    /** 75-34 (WR-04): "Published {date}" — {date} filled via formatLocaleDate. */
    published: string
    /** 75-34 (WR-04): "Updated {date}" — {date} filled via formatLocaleDate. */
    updated: string
  }
  jobTitle: string
  imageAlt: string
}

/**
 * Visible byline used on /guides, /compare, and other long-form pages.
 *
 * Renders a portrait, name, role, and published / updated dates so Google's
 * E-E-A-T crawl — and any AI answer engine summarising the page — sees a
 * named, bio'd expert behind the content. The corresponding Person schema is
 * produced separately via `personSchemaFor()` in lib/authors.ts and nested in
 * the page's Article node (and stays English by design — Phase 74 D-09).
 *
 * 75-28: the job title, portrait alt and link aria-label come from the
 * localized author content for `locale`; name, image and dates still come
 * from lib/authors.ts.
 *
 * 75-34 (WR-04): the "By" / "Published {date}" / "Updated {date}" labels
 * also come from the author content, and dates are formatted for `locale`
 * via formatLocaleDate (EN stays byte-identical: en-GB "9 April 2026").
 */
export default function ArticleByline({
  authorSlug,
  datePublished,
  dateModified,
  locale,
}: Props) {
  const a = AUTHORS[authorSlug]
  const content = getPageContent(`authors/${a.slug}`, locale) as AuthorBylineContent
  const aboutAuthorAria = content.labels.aboutAuthorAria.replace('{name}', a.name)
  const showUpdated = dateModified && dateModified !== datePublished
  const publishedText = content.labels.published.replace(
    '{date}',
    formatLocaleDate(datePublished, locale),
  )
  const updatedText = showUpdated
    ? content.labels.updated.replace('{date}', formatLocaleDate(dateModified!, locale))
    : ''

  return (
    <div className="flex items-center gap-4 py-5 border-y border-anthracite-light">
      <Link
        href={`/authors/${a.slug}`}
        className="flex-shrink-0 block"
        aria-label={aboutAuthorAria}
      >
        <picture>
          <source srcSet={a.image.replace(/\.jpg$/, '.avif')} type="image/avif" />
          <source srcSet={a.image.replace(/\.jpg$/, '.webp')} type="image/webp" />
          <img
            src={a.image}
            alt={content.imageAlt}
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
          {content.labels.by}{' '}
          <Link
            href={`/authors/${a.slug}`}
            className="text-offwhite hover:text-copper transition-colors"
          >
            {a.name}
          </Link>
          {' · '}
          <span>{content.jobTitle}</span>
        </p>
        <p className="font-body text-[11px] text-warmgrey tracking-[0.05em]">
          {publishedText}
          {showUpdated ? ` · ${updatedText}` : ''}
        </p>
      </div>
    </div>
  )
}
