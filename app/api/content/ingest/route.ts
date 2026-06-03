/**
 * POST /api/content/ingest
 *
 * Agent-facing ingestion endpoint. The Claude agent generates the copy and the
 * Higgsfield visual, then POSTs a draft here. The route applies the PRESTIGO
 * brand overlay (HCTI) to stills, stores the item as `pending_approval`, and
 * sends it to the admin Telegram chat for approval.
 *
 * Auth: Bearer CONTENT_INGEST_SECRET (server-to-server; intentionally NOT under
 * /api/admin so the CSRF/Origin guard doesn't block the agent). No browser
 * session involved.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceMaxBody } from "@/lib/request-guards";
import { brandStill } from "@/lib/content/publish";
import { insertContentItem, type NewContentItem } from "@/lib/content/store";
import { sendApprovalMessage } from "@/lib/content/telegram";

const ingestSchema = z.object({
  type: z.enum(["post", "story", "reel", "blog"]),
  channels: z
    .object({
      instagram: z.boolean().optional(),
      facebook: z.boolean().optional(),
      blog: z.boolean().optional(),
    })
    .default({}),
  topic: z.string().max(300).optional(),
  gen_prompt: z.string().max(4000).optional(),
  headline: z.string().max(200).optional(),
  headline_em: z.string().max(120).optional(),
  subline: z.string().max(240).optional(),
  caption: z.string().max(4000).optional(),
  hashtags: z.string().max(1000).optional(),
  blog_mdx: z.string().max(60000).optional(),
  blog_slug: z
    .string()
    .max(120)
    .regex(/^[a-z0-9-]+$/, "slug must be kebab-case")
    .optional(),
  media_raw_url: z.string().url().optional(),
  media_kind: z.enum(["image", "video"]).optional(),
  run_id: z.string().max(64).optional(),
  scheduled_at: z.string().datetime().optional(),
});

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  // 1. Bearer auth.
  const secret = process.env.CONTENT_INGEST_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) return unauthorized();

  // 2. Body guard + validation.
  const tooBig = enforceMaxBody(request, 80_000);
  if (tooBig) return tooBig;

  const parsed = ingestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const input = parsed.data;

  // 3. Per-type requirements.
  const isStill = input.type === "post" || input.type === "story";
  if (isStill && (!input.media_raw_url || !input.headline)) {
    return NextResponse.json(
      { error: "post/story require media_raw_url and headline" },
      { status: 422 }
    );
  }
  if (input.type === "blog" && (!input.blog_slug || !input.blog_mdx)) {
    return NextResponse.json({ error: "blog requires blog_slug and blog_mdx" }, { status: 422 });
  }

  // 4. Build the draft row.
  const row: NewContentItem = {
    type: input.type,
    channels: input.channels,
    status: "pending_approval",
    run_id: input.run_id ?? null,
    topic: input.topic ?? null,
    gen_prompt: input.gen_prompt ?? null,
    headline: input.headline ?? null,
    headline_em: input.headline_em ?? null,
    subline: input.subline ?? null,
    caption: input.caption ?? null,
    hashtags: input.hashtags ?? null,
    blog_mdx: input.blog_mdx ?? null,
    blog_slug: input.blog_slug ?? null,
    media_raw_url: input.media_raw_url ?? null,
    media_kind: input.media_kind ?? (input.type === "reel" ? "video" : "image"),
    scheduled_at: input.scheduled_at ?? null,
  };

  // 5. Brand stills now (reels are branded with ffmpeg in a later step).
  try {
    if (isStill) {
      row.media_branded_url = await brandStill({
        type: input.type,
        media_raw_url: input.media_raw_url ?? null,
        headline: input.headline ?? null,
        headline_em: input.headline_em ?? null,
        subline: input.subline ?? null,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `branding failed: ${message}` }, { status: 502 });
  }

  const item = await insertContentItem(row);

  // 6. Notify the approver (best-effort — never fail ingestion on Telegram error).
  let approvalSent = false;
  const previewUrl = item.media_branded_url ?? item.media_raw_url;
  if (previewUrl && process.env.TELEGRAM_ADMIN_CHAT_ID) {
    try {
      const caption =
        `<b>${item.type.toUpperCase()}</b> — ${item.topic ?? "draft"}\n` +
        `${[item.headline, item.headline_em].filter(Boolean).join(" ")}\n\n` +
        `${(item.caption ?? "").slice(0, 600)}`;
      await sendApprovalMessage({ id: item.id, imageUrl: previewUrl, caption });
      approvalSent = true;
    } catch {
      approvalSent = false;
    }
  }

  return NextResponse.json({ ok: true, id: item.id, status: item.status, approvalSent });
}
