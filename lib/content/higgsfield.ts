/**
 * Higgsfield Cloud API client — text-to-image and image-to-video generation.
 *
 * One Higgsfield subscription covers both stills (for HCTI-branded posts/stories)
 * and video (for ffmpeg-branded Reels), which is why this is the single visual
 * provider for the pipeline.
 *
 * Contract (per cloud.higgsfield.ai docs):
 *   POST   https://api.higgsfield.ai/v1/generations      → submit job
 *   GET    https://api.higgsfield.ai/v1/generations/{id} → poll status
 *   Auth:  Authorization: Bearer <HIGGSFIELD_API_KEY>
 *
 * NOTE: exact model identifiers and the response field that carries the output
 * URL must be confirmed against the live Higgsfield dashboard once the API key
 * exists. They are isolated here (env + the small `extractOutputUrl` helper) so
 * finalizing them is a one-line change, not a rewrite.
 *
 * Env:
 *   HIGGSFIELD_API_KEY        (required)
 *   HIGGSFIELD_BASE_URL       (optional, default https://api.higgsfield.ai/v1)
 *   HIGGSFIELD_IMAGE_MODEL    (optional, default 'nano-banana-pro')
 *   HIGGSFIELD_VIDEO_MODEL    (optional, default 'kling-3.0')
 */

const DEFAULT_BASE = "https://api.higgsfield.ai/v1";

function baseUrl(): string {
  return process.env.HIGGSFIELD_BASE_URL?.replace(/\/$/, "") || DEFAULT_BASE;
}

function authHeaders(): Record<string, string> {
  const key = process.env.HIGGSFIELD_API_KEY;
  if (!key) throw new Error("HIGGSFIELD_API_KEY is not configured");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export type GenerationResult = {
  id: string;
  /** Public URL of the generated image or video. */
  outputUrl: string;
};

type PollOptions = {
  /** Total time budget before giving up. Default 180s (images) / 600s (video). */
  timeoutMs?: number;
  /** Delay between polls. Default 5s. */
  intervalMs?: number;
};

/** Pull the output URL out of a (provider-shaped) completed job payload. */
function extractOutputUrl(job: Record<string, unknown>): string | null {
  // Tolerate the common shapes until the exact contract is confirmed:
  //   { output: "https://..." } | { output: ["https://..."] }
  //   { output: { url } } | { result: { url } } | { url }
  const out = (job.output ?? job.result ?? job.url) as unknown;
  if (typeof out === "string") return out;
  if (Array.isArray(out) && typeof out[0] === "string") return out[0];
  if (out && typeof out === "object") {
    const url = (out as { url?: unknown }).url;
    if (typeof url === "string") return url;
  }
  return null;
}

function jobStatus(job: Record<string, unknown>): string {
  return String(job.status ?? job.state ?? "").toLowerCase();
}

async function submit(body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${baseUrl()}/generations`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Higgsfield submit failed (${res.status}): ${detail.slice(0, 500)}`);
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error("Higgsfield submit returned no job id");
  return json.id;
}

async function poll(id: string, opts: PollOptions): Promise<GenerationResult> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const intervalMs = opts.intervalMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await fetch(`${baseUrl()}/generations/${id}`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Higgsfield poll failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    const job = (await res.json()) as Record<string, unknown>;
    const status = jobStatus(job);

    if (status === "completed" || status === "succeeded" || status === "success") {
      const outputUrl = extractOutputUrl(job);
      if (!outputUrl) throw new Error("Higgsfield job completed but no output URL found");
      return { id, outputUrl };
    }
    if (status === "failed" || status === "error" || status === "canceled") {
      throw new Error(`Higgsfield job ${id} ${status}: ${JSON.stringify(job).slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Higgsfield job ${id} timed out after ${timeoutMs}ms`);
}

/**
 * The PRESTIGO negative-prompt block, ported verbatim from the n8n Replicate
 * node — keeps cars looking real (no open doors, ghost bodies, fake plates,
 * chauffeur caps, plastic/toy look, HDR, etc.).
 */
export const PRESTIGO_NEGATIVE =
  "open car doors, transparent body, ghost car, distorted wheels, " +
  "text on license plate, watermark, logo, cartoon, illustration, CGI render, " +
  "chauffeur cap, any hat, white gloves, overexposed, flat lighting, HDR, " +
  "neon colors, lens flare, plastic look, toy car, tilt shift";

/**
 * Generate a square (1:1) still for an IG/FB post or story background.
 * Returns the hosted image URL to feed into the HCTI brand overlay.
 */
export async function generateImage(
  prompt: string,
  opts: PollOptions & { aspectRatio?: string } = {}
): Promise<GenerationResult> {
  const model = process.env.HIGGSFIELD_IMAGE_MODEL || "nano-banana-pro";
  const id = await submit({
    task: "text-to-image",
    model,
    prompt: `${prompt} — NEGATIVE: ${PRESTIGO_NEGATIVE}.`,
    aspect_ratio: opts.aspectRatio ?? "1:1",
    output_format: "jpg",
  });
  return poll(id, { timeoutMs: opts.timeoutMs ?? 180_000, intervalMs: opts.intervalMs });
}

/**
 * Generate a short vertical video for a Reel from a still + motion prompt.
 * Returns the hosted video URL to feed into the ffmpeg brand overlay.
 */
export async function generateVideo(
  prompt: string,
  inputImageUrl: string,
  opts: PollOptions & { durationSeconds?: number } = {}
): Promise<GenerationResult> {
  const model = process.env.HIGGSFIELD_VIDEO_MODEL || "kling-3.0";
  const id = await submit({
    task: "image-to-video",
    model,
    input_image: inputImageUrl,
    prompt,
    duration: opts.durationSeconds ?? 5,
    aspect_ratio: "9:16",
  });
  return poll(id, { timeoutMs: opts.timeoutMs ?? 600_000, intervalMs: opts.intervalMs ?? 8_000 });
}
