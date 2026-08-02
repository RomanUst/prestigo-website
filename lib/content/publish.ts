/**
 * Orchestration: brand a draft's media, and on approval publish it to the
 * chosen channels (Buffer for social, GitHub for blog).
 *
 * Called by both the admin API routes and the Telegram webhook so the two
 * approval surfaces share identical behaviour.
 */

import { renderPostHTML, renderStoryHTML, type BrandCopy } from "@/lib/content/brand-template";
import { renderHtmlToImage } from "@/lib/content/hcti";
import { createMetricoolPost, type MetricoolChannel, type MetricoolFormat } from "@/lib/content/metricool";
import { publishBlogToGitHub } from "@/lib/content/github-publish";
import { getContentItem, updateContentItem, type ContentItem } from "@/lib/content/store";

/** Map a content type to the Metricool post format. */
function metricoolFormat(type: ContentItem["type"]): MetricoolFormat {
  if (type === "reel") return "reel";
  if (type === "story") return "story";
  return "post";
}

function socialChannels(item: ContentItem): MetricoolChannel[] {
  const out: MetricoolChannel[] = [];
  if (item.channels.instagram) out.push("instagram");
  if (item.channels.facebook) out.push("facebook");
  return out;
}

/** Compose the post caption from caption + hashtags. */
function composeCaption(item: ContentItem): string {
  return [item.caption?.trim(), item.hashtags?.trim()].filter(Boolean).join("\n\n");
}

/**
 * Resolve the branded media to use for a specific channel. Prefers the
 * per-channel variant (e.g. instagram=1080×1080, facebook=1200×630), then the
 * generic branded image, then the raw image.
 */
function mediaForChannel(item: ContentItem, channel: MetricoolChannel): string | null {
  return item.media_variants?.[channel] ?? item.media_branded_url ?? item.media_raw_url ?? null;
}

/**
 * Render the PRESTIGO brand overlay over a still (post/story) via HCTI.
 * Returns the hosted branded image URL. (Reels are branded with ffmpeg in a
 * separate Phase 3 step and are not handled here.)
 */
export async function brandStill(
  item: Pick<ContentItem, "type" | "media_raw_url" | "headline" | "headline_em" | "subline">
): Promise<string> {
  if (!item.media_raw_url) throw new Error("media_raw_url is required to brand a still");
  const copy: BrandCopy = {
    imageUrl: item.media_raw_url,
    headline: item.headline ?? "",
    headlineEm: item.headline_em ?? "",
    subline: item.subline ?? "",
  };
  const isStory = item.type === "story";
  const html = isStory ? renderStoryHTML(copy) : renderPostHTML(copy);
  const { url } = await renderHtmlToImage(html, {
    viewportWidth: 1080,
    viewportHeight: isStory ? 1920 : 1080,
    msDelay: 1200,
  });
  return url;
}

/** Fetch a remote image and return its base64 body (for committing as a blog cover). */
async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch media (${res.status}) for blog cover`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString("base64");
}

/**
 * Approve a draft and publish it. Social → Buffer; blog → GitHub commit.
 * Idempotency: only acts on items in pending_approval/approved/failed.
 */
export async function approveContent(id: string): Promise<ContentItem> {
  const item = await getContentItem(id);
  if (!item) throw new Error(`content item ${id} not found`);
  if (!["pending_approval", "approved", "failed"].includes(item.status)) {
    throw new Error(`content item ${id} is ${item.status}, cannot approve`);
  }

  try {
    if (item.type === "blog") {
      if (!item.blog_slug || !item.blog_mdx) throw new Error("blog item missing slug/mdx");
      const cover = item.media_branded_url
        ? {
            fileName: `${item.blog_slug}-cover.jpg`,
            base64: await fetchAsBase64(item.media_branded_url),
          }
        : undefined;
      const { commitSha } = await publishBlogToGitHub({
        slug: item.blog_slug,
        mdx: item.blog_mdx,
        cover,
      });
      return updateContentItem(id, {
        status: "published",
        github_commit_sha: commitSha,
        published_at: new Date().toISOString(),
        error: null,
      });
    }

    // Social (post / story / reel). One Metricool post per channel, each with
    // the platform-specific media (IG square / FB landscape) when available.
    const channels = socialChannels(item);
    if (channels.length === 0) throw new Error("no social channels selected");
    // Stories carry no caption of their own — Metricool rejects/ignores text there.
    const text = item.type === "story" ? "" : composeCaption(item);
    const mediaKind = item.type === "reel" ? "video" : "image";
    const format = metricoolFormat(item.type);

    const postIds: Record<string, string> = {};
    for (const channel of channels) {
      const mediaUrl = mediaForChannel(item, channel);
      if (!mediaUrl) throw new Error(`no media to publish for ${channel}`);
      const { postId } = await createMetricoolPost({
        channel,
        text,
        mediaUrl,
        mediaKind,
        format,
        dueAt: item.scheduled_at ?? undefined,
      });
      postIds[channel] = postId;
    }

    return updateContentItem(id, {
      status: item.scheduled_at ? "scheduled" : "published",
      buffer_update_ids: postIds,
      published_at: item.scheduled_at ? null : new Date().toISOString(),
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateContentItem(id, { status: "failed", error: message });
    throw err;
  }
}

export async function rejectContent(id: string): Promise<ContentItem> {
  return updateContentItem(id, { status: "rejected" });
}
