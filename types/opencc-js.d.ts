// opencc-js ships no type declarations. Only the converter the tour admin API (lib/tours/admin-store.ts) and the
// zh-hant sync script use is declared.
declare module 'opencc-js' {
  export function Converter(options: { from: string; to: string }): (text: string) => string
}
