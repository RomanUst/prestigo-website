/**
 * lib/quotes/pdf-fonts.ts — embedded font faces of the quote PDF (Phase 92, plan 92-07; D-14, B1).
 *
 * Server only. The renderer blocks every network request, so each family is embedded as a base64 data: URL from the
 * OFL files in lib/quotes/pdf-fonts/ (see SOURCES.txt). Each locale embeds only what it needs: the Chinese faces are
 * 12-18 MB each, so no locale carries a face of another script. `Record<AppLocale, ...>` makes a new locale a type
 * error until it has fonts.
 *
 * The files are read at call time through process.cwd() (next.config.ts `outputFileTracingIncludes` ships them with the
 * routes that render PDFs) and cached per process.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { AppLocale } from '@/i18n/locales'

interface FontFace {
  /** CSS family name the document uses. */
  family: string
  /** File inside lib/quotes/pdf-fonts. */
  file: string
}

const INTER: FontFace = { family: 'Inter', file: 'Inter.ttf' }
const FRAUNCES: FontFace = { family: 'Fraunces', file: 'Fraunces.ttf' }
const ARABIC: FontFace = { family: 'Noto Sans Arabic', file: 'NotoSansArabic.ttf' }
const DEVANAGARI: FontFace = { family: 'Noto Sans Devanagari', file: 'NotoSansDevanagari.ttf' }
const SC: FontFace = { family: 'Noto Sans SC', file: 'NotoSansSC.ttf' }
const TC: FontFace = { family: 'Noto Sans TC', file: 'NotoSansTC.ttf' }

const LOCALE_FACES: Record<AppLocale, readonly FontFace[]> = {
  en: [INTER, FRAUNCES],
  ru: [INTER, FRAUNCES],
  es: [INTER, FRAUNCES],
  fr: [INTER, FRAUNCES],
  ar: [INTER, FRAUNCES, ARABIC],
  hi: [INTER, FRAUNCES, DEVANAGARI],
  zh: [INTER, FRAUNCES, SC],
  'zh-hant': [INTER, FRAUNCES, TC],
}

const base64Cache = new Map<string, string>()

function fontBase64(file: string): string {
  let b64 = base64Cache.get(file)
  if (b64 === undefined) {
    b64 = readFileSync(path.join(process.cwd(), 'lib/quotes/pdf-fonts', file)).toString('base64')
    base64Cache.set(file, b64)
  }
  return b64
}

/** `@font-face` rules for every family the locale's document needs (variable fonts, weights 100-900). */
export function fontFaceCss(locale: AppLocale): string {
  return LOCALE_FACES[locale]
    .map(
      (f) =>
        `@font-face { font-family: '${f.family}'; font-style: normal; font-weight: 100 900; ` +
        `src: url(data:font/ttf;base64,${fontBase64(f.file)}) format('truetype'); }`,
    )
    .join('\n')
}

/**
 * CSS font stacks for the locale: Inter (and Fraunces for headings) cover Latin and Cyrillic, and the script face
 * covers the rest. Every name in a stack is an embedded family, so no glyph is drawn by a system font.
 */
export function fontStacks(locale: AppLocale): { body: string; heading: string } {
  const script = LOCALE_FACES[locale].filter((f) => f !== INTER && f !== FRAUNCES).map((f) => `'${f.family}'`)
  return {
    body: ["'Inter'", ...script].join(', '),
    heading: ["'Fraunces'", "'Inter'", ...script].join(', '),
  }
}
