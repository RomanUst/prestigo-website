/**
 * POST /api/admin/content/[id]/reject
 *
 * Admin-only manual rejection. Marks the item rejected; nothing is published.
 */

import { getAdminUser } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { rejectContent } from "@/lib/content/publish";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await getAdminUser();
  if (error === "401") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (error === "403") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  try {
    const item = await rejectContent(id);
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
