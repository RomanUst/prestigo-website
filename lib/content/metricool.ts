/**
 * Metricool client — queues/schedules approved content to Instagram & Facebook
 * via the Metricool REST API (https://app.metricool.com/api).
 *
 * Replaces Buffer (lib/content/buffer.ts, kept for reference / rollback) as of
 * 2026-08 — the team moved the social scheduling account to Metricool.
 *
 * Auth: personal API token in the `X-Mc-Auth` header, plus `userId`/`blogId`
 * query params identifying the connected brand.
 * One post is created per channel (providers takes one network at a time here
 * so each channel can carry its own cropped media), mirroring the old Buffer
 * client's per-channel call shape.
 *
 * Env:
 *   METRICOOL_API_TOKEN   personal access token (Account Settings → API)
 *   METRICOOL_USER_ID     e.g. 5067926
 *   METRICOOL_BLOG_ID     brand id, e.g. 6581736 (Prestigo)
 *   METRICOOL_TIMEZONE    (optional, default Europe/Prague)
 */

const DEFAULT_API = "https://app.metricool.com/api";
const DEFAULT_TIMEZONE = "Europe/Prague";

export type MetricoolChannel = "instagram" | "facebook";
export type MetricoolFormat = "post" | "reel" | "story" | "carousel";

function config() {
  const token = process.env.METRICOOL_API_TOKEN;
  if (!token) throw new Error("METRICOOL_API_TOKEN is not configured");
  const userId = process.env.METRICOOL_USER_ID;
  if (!userId) throw new Error("METRICOOL_USER_ID is not configured");
  const blogId = process.env.METRICOOL_BLOG_ID;
  if (!blogId) throw new Error("METRICOOL_BLOG_ID is not configured");
  return {
    token,
    userId,
    blogId,
    api: process.env.METRICOOL_API_URL?.replace(/\/$/, "") || DEFAULT_API,
    timezone: process.env.METRICOOL_TIMEZONE || DEFAULT_TIMEZONE,
  };
}

/** Metricool's per-network post "type" (POST | REEL | STORY). Carousel is a POST with multiple media. */
function postType(format: MetricoolFormat): string {
  if (format === "reel") return "REEL";
  if (format === "story") return "STORY";
  return "POST";
}

/** Render a Date (or "now + 2min" if omitted) as a local wall-clock string in `timezone`, matching Metricool's DateTimeInfo shape. */
function localDateTime(iso: string | undefined, timezone: string): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 2 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

export type CreatePostInput = {
  channel: MetricoolChannel;
  /** Caption / post text (hashtags appended by caller if desired). Stories publish without text. */
  text: string;
  /** Public media URL (HCTI image URL or branded video URL in Storage). */
  mediaUrl: string;
  mediaKind: "image" | "video";
  /** Native format. Default 'post'. */
  format?: MetricoolFormat;
  /** ISO timestamp → scheduled then. Omit → published ~2 minutes from now. */
  dueAt?: string;
};

function buildBody(input: CreatePostInput, timezone: string): Record<string, unknown> {
  const type = postType(input.format ?? "post");
  const dateTime = localDateTime(input.dueAt, timezone);

  const body: Record<string, unknown> = {
    text: input.text,
    media: [input.mediaUrl],
    mediaAltText: [],
    providers: [{ network: input.channel }],
    autoPublish: true,
    draft: false,
    shortener: false,
    smartLinkData: { ids: [] },
    publicationDate: { dateTime, timezone },
  };

  // Both networks require a post type in metadata (mirrors the old Buffer
  // requirement — "Facebook posts require a type"). IG also needs
  // showReelOnFeed so reels/posts land in the main feed, not just Reels tab.
  if (input.channel === "instagram") {
    body.instagramData = { type, showReelOnFeed: true };
  } else {
    body.facebookData = { type };
  }

  return body;
}

/** Create one Metricool scheduled post for one channel. Returns the new post id. */
export async function createMetricoolPost(input: CreatePostInput): Promise<{ postId: string }> {
  const { token, userId, blogId, api, timezone } = config();
  const url = `${api}/v2/scheduler/posts?blogId=${encodeURIComponent(blogId)}&userId=${encodeURIComponent(userId)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Mc-Auth": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildBody(input, timezone)),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Metricool API HTTP ${res.status}: ${detail.slice(0, 400)}`);
  }

  const json = (await res.json()) as { data?: { id?: number | string }; id?: number | string };
  const id = json.data?.id ?? json.id;
  if (id === undefined || id === null) throw new Error("Metricool createPost returned no id");
  return { postId: String(id) };
}

/**
 * Create posts across multiple channels (one createPost per channel).
 * Returns the created post ids keyed by channel.
 */
export async function createMetricoolPosts(
  channels: MetricoolChannel[],
  base: Omit<CreatePostInput, "channel">
): Promise<{ postIds: Record<string, string> }> {
  const postIds: Record<string, string> = {};
  for (const channel of channels) {
    const { postId } = await createMetricoolPost({ ...base, channel });
    postIds[channel] = postId;
  }
  return { postIds };
}
