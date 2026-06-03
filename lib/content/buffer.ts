/**
 * Buffer client — queues/schedules approved content to Instagram & Facebook
 * via the Buffer GraphQL API (https://api.buffer.com).
 *
 * Auth: personal API key as a Bearer token.
 * One post is created per channel (createPost takes a single channelId), so a
 * post targeting IG + FB results in two createPost calls.
 *
 * Native format support (PostType enum): post | reel | story | carousel.
 *
 * Env:
 *   BUFFER_ACCESS_TOKEN
 *   BUFFER_PROFILE_IG   Instagram channel id
 *   BUFFER_PROFILE_FB   Facebook channel id
 *   BUFFER_API_URL      (optional, default https://api.buffer.com)
 */

const DEFAULT_API = "https://api.buffer.com";

export type BufferChannel = "instagram" | "facebook";
export type BufferFormat = "post" | "reel" | "story" | "carousel";

function config() {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  if (!token) throw new Error("BUFFER_ACCESS_TOKEN is not configured");
  return {
    token,
    api: process.env.BUFFER_API_URL?.replace(/\/$/, "") || DEFAULT_API,
    ig: process.env.BUFFER_PROFILE_IG,
    fb: process.env.BUFFER_PROFILE_FB,
  };
}

function channelId(channel: BufferChannel): string {
  const { ig, fb } = config();
  if (channel === "instagram") {
    if (!ig) throw new Error("BUFFER_PROFILE_IG is not configured");
    return ig;
  }
  if (!fb) throw new Error("BUFFER_PROFILE_FB is not configured");
  return fb;
}

/** Execute a GraphQL request against the Buffer API. */
async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const { token, api } = config();
  const res = await fetch(api, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Buffer API HTTP ${res.status}: ${detail.slice(0, 400)}`);
  }
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`Buffer GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) throw new Error("Buffer GraphQL returned no data");
  return json.data;
}

const CREATE_POST = `
mutation CreatePost($input: CreatePostInput!) {
  createPost(input: $input) {
    __typename
    ... on PostActionSuccess { post { id dueAt } }
    ... on NotFoundError { message }
    ... on UnauthorizedError { message }
    ... on UnexpectedError { message }
    ... on RestProxyError { message }
    ... on LimitReachedError { message }
    ... on InvalidInputError { message }
  }
}`;

const DELETE_POST = `
mutation DeletePost($id: PostId!) {
  deletePost(input: { id: $id }) {
    __typename
    ... on PostActionSuccess { post { id } }
    ... on NotFoundError { message }
    ... on UnauthorizedError { message }
    ... on UnexpectedError { message }
  }
}`;

export type CreatePostInput = {
  channel: BufferChannel;
  /** Caption / post text (hashtags appended by caller if desired). */
  text: string;
  /** Public media URL (HCTI image URL or branded video URL in Storage). */
  mediaUrl: string;
  mediaKind: "image" | "video";
  /** Native Buffer format. Default 'post'. */
  format?: BufferFormat;
  /** ISO timestamp → custom-scheduled. Omit → added to the channel's queue. */
  dueAt?: string;
  /** Optional thumbnail (for video). */
  thumbnailUrl?: string;
};

function buildInput(input: CreatePostInput): Record<string, unknown> {
  const format = input.format ?? "post";

  const asset =
    input.mediaKind === "image"
      ? { image: { url: input.mediaUrl, thumbnailUrl: input.thumbnailUrl ?? input.mediaUrl } }
      : { video: { url: input.mediaUrl, thumbnailUrl: input.thumbnailUrl ?? input.mediaUrl } };

  const gqlInput: Record<string, unknown> = {
    channelId: channelId(input.channel),
    text: input.text,
    schedulingType: "automatic",
    mode: input.dueAt ? "customScheduled" : "addToQueue",
    assets: [asset],
  };
  if (input.dueAt) gqlInput.dueAt = input.dueAt;

  // Both networks require a post type in metadata (Buffer rejects FB/IG posts
  // without it — "Facebook posts require a type"). IG also needs shouldShareToFeed.
  // PostTypeFacebook / Instagram PostType both accept post | story | reel.
  if (input.channel === "instagram") {
    gqlInput.metadata = { instagram: { type: format, shouldShareToFeed: true } };
  } else if (input.channel === "facebook") {
    gqlInput.metadata = { facebook: { type: format } };
  }

  return gqlInput;
}

type CreatePostResponse = {
  createPost: { __typename: string; post?: { id: string; dueAt?: string }; message?: string };
};

/** Create one Buffer post for one channel. Returns the new post id. */
export async function createBufferPost(input: CreatePostInput): Promise<{ postId: string }> {
  const data = await graphql<CreatePostResponse>(CREATE_POST, { input: buildInput(input) });
  const r = data.createPost;
  if (r.__typename !== "PostActionSuccess" || !r.post) {
    throw new Error(`Buffer createPost failed (${r.__typename}): ${r.message ?? "unknown"}`);
  }
  return { postId: r.post.id };
}

/**
 * Create posts across multiple channels (one createPost per channel).
 * Returns the created post ids keyed by channel.
 */
export async function createBufferPosts(
  channels: BufferChannel[],
  base: Omit<CreatePostInput, "channel">
): Promise<{ postIds: Record<string, string> }> {
  const postIds: Record<string, string> = {};
  for (const channel of channels) {
    const { postId } = await createBufferPost({ ...base, channel });
    postIds[channel] = postId;
  }
  return { postIds };
}

/** Delete a Buffer post (used to clean up test posts). */
export async function deleteBufferPost(id: string): Promise<void> {
  const data = await graphql<{ deletePost: { __typename: string; message?: string } }>(
    DELETE_POST,
    { id }
  );
  if (data.deletePost.__typename !== "PostActionSuccess") {
    throw new Error(`Buffer deletePost failed (${data.deletePost.__typename}): ${data.deletePost.message ?? ""}`);
  }
}
