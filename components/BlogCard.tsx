import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/routing'
import type { BlogPost } from '@/lib/blog'
import { formatLocaleDate } from '@/lib/locale-date'
import { blogCategoryKey } from '@/lib/blog-categories'

type Props = { post: BlogPost }

/**
 * BlogCard — used by /blog listing grid.
 *
 * Visual contract per .planning/phases/55-blog-ui-listing-article-pages/55-UI-SPEC.md
 * (BlogCard Specification). Accessibility per Accessibility section:
 * - aria-label on the wrapping anchor so AT users hear the post title
 *   (the visible CTA "Read article →" is too generic alone).
 * - alt={post.title} on the cover image.
 * - Category text uses --copper-light (#D4BB86) for WCAG AA contrast
 *   against --anthracite-mid (navy); the base --copper gold sits lower.
 */
export default function BlogCard({ post }: Props) {
  const t = useTranslations('BlogCard')
  const tCategory = useTranslations('BlogCategories')
  // 75-34 (WR-04): the locale comes from the same next-intl request config as
  // the category / CTA translations above (production-verified on the
  // force-static /blog page in 75-30), so card dates follow the page locale.
  const locale = useLocale()
  // 75-28: EN frontmatter value -> localized label (raw value if unmapped).
  const categoryKey = blogCategoryKey(post.category)
  const categoryLabel = categoryKey ? tCategory(categoryKey) : post.category
  return (
    <Link
      href={`/blog/${post.slug}`}
      aria-label={post.title}
      className="block border border-anthracite-light hover:border-[var(--copper)] transition-colors group"
    >
      <div className="aspect-[16/9] overflow-hidden bg-anthracite-mid">
        <img
          src={post.coverImage}
          alt={post.title}
          width={800}
          height={450}
          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="p-6 md:p-8 flex flex-col gap-4">
        <p className="label" style={{ color: 'var(--copper-light)' }}>
          {categoryLabel}
        </p>
        <h2 className="font-display font-light text-[24px] md:text-[28px] text-offwhite group-hover:text-[var(--copper-light)] transition-colors leading-[1.25]">
          {post.title}
        </h2>
        <p className="body-text text-[13px]" style={{ lineHeight: '1.8' }}>
          {post.description}
        </p>
        <div className="flex items-center justify-between mt-2">
          <p className="font-body font-light text-[11px] tracking-[0.1em] uppercase text-warmgrey">
            {formatLocaleDate(post.date, locale)}
          </p>
          <p
            className="font-body font-light text-[10px] tracking-[0.15em] uppercase"
            style={{ color: 'var(--copper)' }}
          >
            {t('readArticle')}
          </p>
        </div>
      </div>
    </Link>
  )
}
