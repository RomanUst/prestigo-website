/**
 * Tiny {token} substitution helper for content JSON strings.
 *
 * Content JSON (content/routes/*, content/pages/*) is plain JSON — it never
 * goes through next-intl's t()/ICU pipeline. Prices are DB-sourced per-request
 * (lib/route-prices.ts) and must stay locale-invariant (D-02), so content
 * strings store a `{ePrice}`-style placeholder token and this helper performs
 * simple substitution after the content is loaded, exactly reproducing the
 * pre-refactor template-literal output.
 *
 * Build-time/render-time only — no special runtime requirement, but this
 * module has no 'use client' directive and is meant to run alongside the
 * content loaders (lib/route-content.ts, lib/page-content.ts) inside Server
 * Components.
 */
export function interpolate(
  template: string,
  values: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = values[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}
