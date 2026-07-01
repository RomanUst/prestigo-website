/**
 * POST /api/content/upload-media
 *
 * Agent-facing media host. The Claude agent brands a Reel locally (Higgsfield
 * video → ffmpeg overlay) and uploads the finished mp4 here; the route stores
 * it in the public Supabase Storage bucket `content-media` (using the server's
 * service-role key) and returns a public URL that Buffer can fetch.
 *
 * Auth: Bearer CONTENT_INGEST_SECRET (server-to-server; not under /api/admin).
 * Body: multipart/form-data with a `file` field, optional `path` and `contentType`.
 */

import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { enforceMaxBody } from "@/lib/request-guards";

const BUCKET = "content-media";
const MAX_BYTES = 120_000_000; // 120 MB ceiling (bucket enforces 100 MB)

const EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  const secret = process.env.CONTENT_INGEST_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) return unauthorized();

  const tooBig = enforceMaxBody(request, MAX_BYTES);
  if (tooBig) return tooBig;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file" }, { status: 422 });
  }

  const contentType = (form.get("contentType") as string) || file.type || "application/octet-stream";
  if (!EXT[contentType]) {
    return NextResponse.json({ error: `Unsupported contentType ${contentType}` }, { status: 422 });
  }

  // Sanitise the path: allow a caller-provided kebab name, else generate one.
  const provided = (form.get("path") as string) || "";
  const safe = provided.replace(/[^a-zA-Z0-9._/-]/g, "");
  const path =
    safe && /\.[a-z0-9]+$/i.test(safe)
      ? safe
      : `reels/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${EXT[contentType]}`;

  const bytes = new Uint8Array(await file.arrayBuffer());

  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) {
    return NextResponse.json({ error: `upload failed: ${error.message}` }, { status: 502 });
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ ok: true, path, url: data.publicUrl });
}
