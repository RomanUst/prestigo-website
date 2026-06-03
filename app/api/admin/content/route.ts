/**
 * GET /api/admin/content
 *
 * Admin-only list of content items (the approval queue / history).
 * Optional ?status=pending_approval filter.
 */

import { getAdminUser } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { listContentItems, type ContentStatus } from "@/lib/content/store";

const STATUSES: ContentStatus[] = [
  "draft",
  "pending_approval",
  "approved",
  "scheduled",
  "published",
  "failed",
  "rejected",
];

export async function GET(request: Request) {
  const { error } = await getAdminUser();
  if (error === "401") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (error === "403") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const status = STATUSES.includes(statusParam as ContentStatus)
    ? (statusParam as ContentStatus)
    : undefined;

  const items = await listContentItems({ status, limit: 100 });
  return NextResponse.json({ items });
}
