/**
 * PRESTIGO brand overlay templates for HCTI (HTML/CSS → image).
 *
 * Source of truth ported from the n8n workflow "AI — Creative Generator v2"
 * (node "Build Brand HTML") and prestigo-instagram-template.html.
 *
 * Design system:
 *   palette  #1C1C1E (anthracite) / #B87333–#E8B87A (copper) / #F5F2EE (off-white)
 *   fonts    Cormorant Garamond (serif display) + Montserrat (sans label)
 *   tagline  "Prestige in every mile"
 *
 * Two formats:
 *   renderPostHTML  — 1080×1080 square (IG/FB feed post)
 *   renderStoryHTML — 1080×1920 vertical (IG/FB story / reel cover)
 *
 * HCTI render params used with these templates (see lib/content/hcti.ts):
 *   { file_type: 'jpg', device_scale: 1, google_fonts: 'Cormorant Garamond|Montserrat' }
 */

export type BrandCopy = {
  /** Background image URL (Higgsfield/Replicate output). */
  imageUrl: string;
  /** Main headline (regular weight, off-white). */
  headline: string;
  /** Emphasised italic copper fragment appended to the headline. */
  headlineEm: string;
  /** Italic subline under the headline. */
  subline: string;
};

/** HTML-escape user/AI-provided text before interpolating into the template. */
export function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Tiny fractal-noise texture (kept inline so HCTI needs no extra fetch).
const NOISE_SVG =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIj48ZmlsdGVyIGlkPSJuIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC44NSIgbnVtT2N0YXZlcz0iNCIgc3RpdGNoVGlsZXM9InN0aXRjaCIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbHRlcj0idXJsKCNuKSIgb3BhY2l0eT0iMC4wNCIvPjwvc3ZnPg==";

const FONT_LINK =
  '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Montserrat:wght@300;400;500&display=swap" rel="stylesheet">';

const LOGO = '<div class="logo"><span class="presti">PRESTI</span><span class="go">GO</span></div>';
const TAGLINE = '<div class="tagline">Prestige in every mile</div>';

/**
 * 1080×1080 square feed post. Identical to the proven n8n template.
 */
export function renderPostHTML(copy: BrandCopy): string {
  const imageUrl = escapeHtml(copy.imageUrl);
  const headline = escapeHtml(copy.headline);
  const headlineEm = escapeHtml(copy.headlineEm);
  const subline = escapeHtml(copy.subline);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
${FONT_LINK}
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 1080px; height: 1080px; overflow: hidden; background: #1C1C1E; }
.canvas { width: 1080px; height: 1080px; position: relative; }
.bg { position: absolute; inset: 0; background-image: url('${imageUrl}'); background-size: cover; background-position: center; }
.overlay { position: absolute; inset: 0; background: linear-gradient(175deg, rgba(28,28,30,0.75) 0%, rgba(28,28,30,0.15) 35%, rgba(28,28,30,0.50) 60%, rgba(28,28,30,0.92) 100%); }
.noise { position: absolute; inset: 0; background-image: url('${NOISE_SVG}'); opacity: 0.35; mix-blend-mode: overlay; pointer-events: none; }
.vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 50%, rgba(28,28,30,0.40) 100%); pointer-events: none; }
.top-line { position: absolute; top: 72px; left: 72px; right: 72px; height: 1px; background: linear-gradient(90deg, transparent 0%, #B87333 20%, #E8B87A 50%, #B87333 80%, transparent 100%); opacity: 0.6; }
.bottom-line { position: absolute; bottom: 72px; left: 72px; right: 72px; height: 1px; background: linear-gradient(90deg, transparent 0%, #B87333 20%, #E8B87A 50%, #B87333 80%, transparent 100%); opacity: 0.6; }
.logo { position: absolute; top: 96px; left: 96px; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; font-weight: 300; letter-spacing: 12px; text-shadow: 0 1px 12px rgba(0,0,0,0.80); }
.logo .presti { color: #F5F2EE; }
.logo .go { color: #B87333; }
.headline { position: absolute; left: 96px; right: 96px; bottom: 240px; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 72px; font-weight: 300; line-height: 1.15; color: #F5F2EE; letter-spacing: -0.01em; text-shadow: 0 2px 24px rgba(0,0,0,0.90), 0 1px 8px rgba(0,0,0,0.70); }
.headline em { font-style: italic; color: #E8B87A; font-weight: 300; }
.vline-decor { position: absolute; left: 96px; bottom: 195px; width: 48px; height: 1px; background: #B87333; opacity: 0.8; }
.subline { position: absolute; left: 96px; right: 96px; bottom: 158px; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 20px; font-weight: 300; font-style: italic; color: rgba(245,242,238,0.45); letter-spacing: 0.08em; text-shadow: 0 1px 10px rgba(0,0,0,0.80); }
.tagline { position: absolute; right: 96px; bottom: 96px; font-family: 'Montserrat', sans-serif; font-size: 11px; font-weight: 300; color: #9A958F; letter-spacing: 5px; text-transform: uppercase; text-shadow: 0 1px 8px rgba(0,0,0,0.70); }
</style>
</head>
<body>
<div class="canvas">
  <div class="bg"></div>
  <div class="overlay"></div>
  <div class="noise"></div>
  <div class="vignette"></div>
  <div class="top-line"></div>
  <div class="bottom-line"></div>
  ${LOGO}
  <div class="headline">${headline} <em>${headlineEm}</em></div>
  <div class="vline-decor"></div>
  <div class="subline">${subline}</div>
  ${TAGLINE}
</div>
</body>
</html>`;
}

/**
 * 1080×1920 vertical story / reel cover. Same design language, re-laid-out for
 * 9:16: copy sits lower-third, logo top-left, larger safe margins for the
 * Instagram story UI (top ~250px and bottom ~250px are reserved by IG chrome).
 */
export function renderStoryHTML(copy: BrandCopy): string {
  const imageUrl = escapeHtml(copy.imageUrl);
  const headline = escapeHtml(copy.headline);
  const headlineEm = escapeHtml(copy.headlineEm);
  const subline = escapeHtml(copy.subline);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
${FONT_LINK}
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 1080px; height: 1920px; overflow: hidden; background: #1C1C1E; }
.canvas { width: 1080px; height: 1920px; position: relative; }
.bg { position: absolute; inset: 0; background-image: url('${imageUrl}'); background-size: cover; background-position: center; }
.overlay { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(28,28,30,0.70) 0%, rgba(28,28,30,0.10) 30%, rgba(28,28,30,0.35) 62%, rgba(28,28,30,0.94) 100%); }
.noise { position: absolute; inset: 0; background-image: url('${NOISE_SVG}'); opacity: 0.35; mix-blend-mode: overlay; pointer-events: none; }
.vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 55%, rgba(28,28,30,0.45) 100%); pointer-events: none; }
.top-line { position: absolute; top: 150px; left: 96px; right: 96px; height: 1px; background: linear-gradient(90deg, transparent 0%, #B87333 20%, #E8B87A 50%, #B87333 80%, transparent 100%); opacity: 0.6; }
.bottom-line { position: absolute; bottom: 150px; left: 96px; right: 96px; height: 1px; background: linear-gradient(90deg, transparent 0%, #B87333 20%, #E8B87A 50%, #B87333 80%, transparent 100%); opacity: 0.6; }
.logo { position: absolute; top: 190px; left: 96px; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 26px; font-weight: 300; letter-spacing: 14px; text-shadow: 0 1px 12px rgba(0,0,0,0.80); }
.logo .presti { color: #F5F2EE; }
.logo .go { color: #B87333; }
.headline { position: absolute; left: 96px; right: 96px; bottom: 470px; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 88px; font-weight: 300; line-height: 1.12; color: #F5F2EE; letter-spacing: -0.01em; text-shadow: 0 2px 24px rgba(0,0,0,0.90), 0 1px 8px rgba(0,0,0,0.70); }
.headline em { font-style: italic; color: #E8B87A; font-weight: 300; }
.vline-decor { position: absolute; left: 96px; bottom: 410px; width: 56px; height: 1px; background: #B87333; opacity: 0.8; }
.subline { position: absolute; left: 96px; right: 96px; bottom: 360px; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 26px; font-weight: 300; font-style: italic; color: rgba(245,242,238,0.50); letter-spacing: 0.08em; text-shadow: 0 1px 10px rgba(0,0,0,0.80); }
.tagline { position: absolute; left: 96px; bottom: 190px; font-family: 'Montserrat', sans-serif; font-size: 13px; font-weight: 300; color: #9A958F; letter-spacing: 6px; text-transform: uppercase; text-shadow: 0 1px 8px rgba(0,0,0,0.70); }
</style>
</head>
<body>
<div class="canvas">
  <div class="bg"></div>
  <div class="overlay"></div>
  <div class="noise"></div>
  <div class="vignette"></div>
  <div class="top-line"></div>
  <div class="bottom-line"></div>
  ${LOGO}
  <div class="headline">${headline} <em>${headlineEm}</em></div>
  <div class="vline-decor"></div>
  <div class="subline">${subline}</div>
  ${TAGLINE}
</div>
</body>
</html>`;
}

/**
 * 1200×630 landscape (1.91:1) — Facebook / link-preview format. Same design
 * language with copy left-aligned over the darker side of the gradient; pair it
 * with a wide (16:9) background that has negative space on the left.
 */
export function renderFacebookHTML(copy: BrandCopy): string {
  const imageUrl = escapeHtml(copy.imageUrl);
  const headline = escapeHtml(copy.headline);
  const headlineEm = escapeHtml(copy.headlineEm);
  const subline = escapeHtml(copy.subline);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
${FONT_LINK}
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; overflow: hidden; background: #1C1C1E; }
.canvas { width: 1200px; height: 630px; position: relative; }
.bg { position: absolute; inset: 0; background-image: url('${imageUrl}'); background-size: cover; background-position: center; }
.overlay { position: absolute; inset: 0; background: linear-gradient(105deg, rgba(28,28,30,0.92) 0%, rgba(28,28,30,0.74) 45%, rgba(28,28,30,0.30) 100%); }
.noise { position: absolute; inset: 0; background-image: url('${NOISE_SVG}'); opacity: 0.30; mix-blend-mode: overlay; pointer-events: none; }
.top-line { position: absolute; top: 54px; left: 64px; right: 64px; height: 1px; background: linear-gradient(90deg, #B87333 0%, #E8B87A 40%, transparent 100%); opacity: 0.6; }
.logo { position: absolute; top: 80px; left: 64px; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; font-weight: 300; letter-spacing: 11px; text-shadow: 0 1px 12px rgba(0,0,0,0.80); }
.logo .presti { color: #F5F2EE; }
.logo .go { color: #B87333; }
.vline-decor { position: absolute; left: 64px; top: 200px; width: 48px; height: 1px; background: #B87333; opacity: 0.8; }
.headline { position: absolute; left: 64px; top: 230px; right: 380px; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 64px; font-weight: 300; line-height: 1.1; color: #F5F2EE; text-shadow: 0 2px 24px rgba(0,0,0,0.60); }
.headline em { font-style: italic; color: #E8B87A; font-weight: 300; }
.subline { position: absolute; left: 64px; bottom: 74px; right: 380px; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 23px; font-weight: 300; font-style: italic; color: rgba(245,242,238,0.70); letter-spacing: 0.06em; text-shadow: 0 1px 10px rgba(0,0,0,0.80); }
.tagline { position: absolute; right: 64px; bottom: 74px; font-family: 'Montserrat', sans-serif; font-size: 11px; font-weight: 300; color: #9A958F; letter-spacing: 4px; text-transform: uppercase; text-shadow: 0 1px 8px rgba(0,0,0,0.70); }
</style>
</head>
<body>
<div class="canvas">
  <div class="bg"></div>
  <div class="overlay"></div>
  <div class="noise"></div>
  <div class="top-line"></div>
  ${LOGO}
  <div class="vline-decor"></div>
  <div class="headline">${headline} <em>${headlineEm}</em></div>
  <div class="subline">${subline}</div>
  ${TAGLINE}
</div>
</body>
</html>`;
}
