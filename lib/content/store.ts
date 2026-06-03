/**
 * Data access for the content_items queue (migration 042).
 * Service-role only — these run server-side in API routes.
 */

import { createSupabaseServiceClient } from "@/lib/supabase";

export type ContentType = "post" | "story" | "reel" | "blog";
export type ContentStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "scheduled"
  | "published"
  | "failed"
  | "rejected";

export type ContentChannels = {
  instagram?: boolean;
  facebook?: boolean;
  blog?: boolean;
};

export type ContentItem = {
  id: string;
  run_id: string | null;
  type: ContentType;
  status: ContentStatus;
  channels: ContentChannels;
  topic: string | null;
  gen_prompt: string | null;
  headline: string | null;
  headline_em: string | null;
  subline: string | null;
  caption: string | null;
  hashtags: string | null;
  blog_mdx: string | null;
  blog_slug: string | null;
  media_raw_url: string | null;
  media_branded_url: string | null;
  /** Per-channel branded media, e.g. { instagram, facebook, story }. */
  media_variants: Record<string, string>;
  media_kind: "image" | "video" | null;
  buffer_update_ids: Record<string, string> | null;
  github_commit_sha: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type NewContentItem = Partial<ContentItem> &
  Pick<ContentItem, "type" | "channels">;

const TABLE = "content_items";

export async function insertContentItem(row: NewContentItem): Promise<ContentItem> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.from(TABLE).insert([row]).select("*").single();
  if (error) throw new Error(`content insert failed: ${error.message}`);
  return data as ContentItem;
}

export async function getContentItem(id: string): Promise<ContentItem | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`content read failed: ${error.message}`);
  return (data as ContentItem) ?? null;
}

export async function updateContentItem(
  id: string,
  patch: Partial<ContentItem>
): Promise<ContentItem> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`content update failed: ${error.message}`);
  return data as ContentItem;
}

export async function listContentItems(
  opts: { status?: ContentStatus; limit?: number } = {}
): Promise<ContentItem[]> {
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.status) query = query.eq("status", opts.status);
  const { data, error } = await query;
  if (error) throw new Error(`content list failed: ${error.message}`);
  return (data as ContentItem[]) ?? [];
}
