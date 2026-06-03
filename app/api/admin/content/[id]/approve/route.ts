/**
 * POST /api/admin/content/[id]/approve
 *
 * Admin-only manual approval (the alternative to the Telegram button).
 * Publishes the item to its channels via the shared approveContent orchestrator.
 */

import { getAdminUser } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { approveContent } from "@/lib/content/publish";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await getAdminUser();
  if (error === "401") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (error === "403") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  try {
    const item = await approveContent(id);
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
