/**
 * GitHub publisher — commits a blog article (MDX + cover image) to the site
 * repo so Vercel rebuilds and the post appears at /blog/<slug>.
 *
 * The blog is static MDX (content/blog/*.mdx, generateStaticParams from MDX
 * only — invariant ART-02), so "publishing" = a single multi-file commit:
 *   - content/blog/<slug>.mdx
 *   - public/<coverImageFileName>   (cover referenced by frontmatter coverImage)
 *
 * Uses the GitHub Git Data API to build one atomic commit (blobs → tree →
 * commit → update ref).
 *
 * Env:
 *   GITHUB_TOKEN   (contents:write on the repo)
 *   GITHUB_REPO    "owner/name"
 *   GITHUB_BRANCH  deploy branch (e.g. "main")
 */

const API = "https://api.github.com";

type FileToCommit = {
  /** Repo-relative path, e.g. "content/blog/prague-vienna.mdx". */
  path: string;
  /** File contents. */
  content: string;
  /** How `content` is encoded for the blob API. */
  encoding: "utf-8" | "base64";
};

function config() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!token || !repo) {
    throw new Error("GITHUB_TOKEN / GITHUB_REPO are not configured");
  }
  return { token, repo, branch };
}

async function gh<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`GitHub ${method} ${path} failed (${res.status}): ${detail.slice(0, 400)}`);
  }
  return (await res.json()) as T;
}

export type PublishBlogInput = {
  slug: string;
  /** Full MDX file content (frontmatter + body). */
  mdx: string;
  /** Optional cover image to commit under /public. */
  cover?: {
    /** File name only, e.g. "prague-vienna-cover.jpg" — must match frontmatter coverImage "/prague-vienna-cover.jpg". */
    fileName: string;
    /** Base64-encoded image bytes. */
    base64: string;
  };
  /** Commit message. Defaults to a sensible one. */
  message?: string;
};

/**
 * Commit a blog post (and optional cover) to the repo in one atomic commit.
 * Returns the new commit SHA. Vercel auto-deploys on push.
 */
export async function publishBlogToGitHub(input: PublishBlogInput): Promise<{ commitSha: string }> {
  const { token, repo, branch } = config();

  const files: FileToCommit[] = [
    { path: `content/blog/${input.slug}.mdx`, content: input.mdx, encoding: "utf-8" },
  ];
  if (input.cover) {
    files.push({
      path: `public/${input.cover.fileName}`,
      content: input.cover.base64,
      encoding: "base64",
    });
  }

  // 1. Current branch head → latest commit + its tree.
  const ref = await gh<{ object: { sha: string } }>(
    token,
    "GET",
    `/repos/${repo}/git/ref/heads/${branch}`
  );
  const headSha = ref.object.sha;
  const headCommit = await gh<{ tree: { sha: string } }>(
    token,
    "GET",
    `/repos/${repo}/git/commits/${headSha}`
  );
  const baseTreeSha = headCommit.tree.sha;

  // 2. Create a blob per file.
  const treeItems = await Promise.all(
    files.map(async (f) => {
      const blob = await gh<{ sha: string }>(token, "POST", `/repos/${repo}/git/blobs`, {
        content: f.content,
        encoding: f.encoding,
      });
      return { path: f.path, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
    })
  );

  // 3. New tree on top of the current one.
  const tree = await gh<{ sha: string }>(token, "POST", `/repos/${repo}/git/trees`, {
    base_tree: baseTreeSha,
    tree: treeItems,
  });

  // 4. New commit.
  const commit = await gh<{ sha: string }>(token, "POST", `/repos/${repo}/git/commits`, {
    message: input.message ?? `blog: publish ${input.slug}`,
    tree: tree.sha,
    parents: [headSha],
  });

  // 5. Move the branch ref to the new commit.
  await gh(token, "PATCH", `/repos/${repo}/git/refs/heads/${branch}`, {
    sha: commit.sha,
    force: false,
  });

  return { commitSha: commit.sha };
}
