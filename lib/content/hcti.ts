/**
 * HCTI (htmlcsstoimage.com) client — renders HTML/CSS to a hosted image URL.
 *
 * Used to apply the PRESTIGO brand overlay (see lib/content/brand-template.ts)
 * onto an AI-generated background. The returned hcti.io URL is public and can
 * be handed straight to Buffer as the post media.
 *
 * Auth: HTTP Basic with HCTI user id + API key (from the dashboard).
 * Env: HCTI_USER_ID, HCTI_API_KEY
 */

const HCTI_ENDPOINT = "https://hcti.io/v1/image";

export type HctiRenderOptions = {
  /** Output format. PRESTIGO posts use jpg (matches n8n). */
  fileType?: "jpg" | "png" | "webp";
  /** Pixel ratio. 1 = exact viewport pixels (n8n used 1 for 1080×1080). */
  deviceScale?: number;
  /** Google fonts to load, '|'-separated. */
  googleFonts?: string;
  /** Optional explicit viewport (disables HCTI auto-crop). */
  viewportWidth?: number;
  viewportHeight?: number;
  /** Extra delay (ms) before snapshot — lets the background image settle. */
  msDelay?: number;
};

const DEFAULTS: Required<
  Pick<HctiRenderOptions, "fileType" | "deviceScale" | "googleFonts">
> = {
  fileType: "jpg",
  deviceScale: 1,
  googleFonts: "Cormorant Garamond|Montserrat",
};

function authHeader(): string {
  const user = process.env.HCTI_USER_ID;
  const key = process.env.HCTI_API_KEY;
  if (!user || !key) {
    throw new Error("HCTI_USER_ID / HCTI_API_KEY are not configured");
  }
  return "Basic " + Buffer.from(`${user}:${key}`).toString("base64");
}

/**
 * Render an HTML document to a hosted image. Returns the public image URL.
 *
 * @throws on missing credentials or a non-2xx HCTI response.
 */
export async function renderHtmlToImage(
  html: string,
  options: HctiRenderOptions = {}
): Promise<{ url: string; id: string }> {
  const body: Record<string, unknown> = {
    html,
    file_type: options.fileType ?? DEFAULTS.fileType,
    device_scale: options.deviceScale ?? DEFAULTS.deviceScale,
    google_fonts: options.googleFonts ?? DEFAULTS.googleFonts,
  };
  if (options.viewportWidth && options.viewportHeight) {
    body.viewport_width = options.viewportWidth;
    body.viewport_height = options.viewportHeight;
  }
  if (typeof options.msDelay === "number") {
    body.ms_delay = options.msDelay;
  }

  const res = await fetch(HCTI_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`HCTI render failed (${res.status}): ${detail.slice(0, 500)}`);
  }

  const json = (await res.json()) as { url?: string; id?: string };
  if (!json.url) {
    throw new Error("HCTI render returned no url");
  }
  return { url: json.url, id: json.id ?? "" };
}
