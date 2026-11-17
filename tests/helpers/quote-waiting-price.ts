// The one waiting-amount check of the quote copy (owner rule 2026-11-12: a line has one price; no copy may name a
// separate waiting price). Shared by tests/quote-copy-i18n.test.ts (the catalogs) and tests/quote-page.test.tsx (the
// rendered page), so both read the same patterns.

export const WAITING_PRICE: Record<string, RegExp> = {
  en: /waiting (fee|charge|cost|price|rate)/i,
  ru: /(плата|цена|стоимость|тариф) за ожидание|стоимость ожидания|плата за простой/i,
  es: /(tarifa|cargo|coste|precio|importe) (de|por) (la )?espera/i,
  fr: /(tarif|frais|coût|prix|supplément) (de|d'|pour l')attente/i,
  ar: /(رسوم|أجرة|سعر|تكلفة) الانتظار/,
  hi: /इंतज़ार (शुल्क|का शुल्क|की कीमत)|प्रतीक्षा शुल्क/,
  zh: /等候(费|费用|价格)/,
  'zh-hant': /等候(費|費用|價格)/,
}
