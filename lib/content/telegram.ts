/**
 * Telegram helper for the content approval gate.
 *
 * Sends a draft (branded image + copy) to the admin chat with inline
 * Approve / Reject buttons, and exposes helpers the webhook uses to answer
 * callback queries and disable the buttons after a decision.
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN      bot @rideprestigo_ig_bot
 *   TELEGRAM_ADMIN_CHAT_ID  chat that receives drafts / may approve
 *   TELEGRAM_WEBHOOK_SECRET shared secret echoed in the webhook header
 */

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return t;
}

function api(method: string): string {
  return `https://api.telegram.org/bot${token()}/${method}`;
}

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(api(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
  return json.result as T;
}

/** callback_data is limited to 64 bytes — keep it "<action>:<id>". */
export function approvalCallbackData(action: "approve" | "reject", id: string): string {
  return `${action}:${id}`;
}

export function parseApprovalCallback(
  data: string
): { action: "approve" | "reject"; id: string } | null {
  const m = /^(approve|reject):(.+)$/.exec(data);
  if (!m) return null;
  return { action: m[1] as "approve" | "reject", id: m[2] };
}

/**
 * Send a draft to the admin chat for approval. Returns the sent message id so
 * the webhook can edit it after a decision.
 */
export async function sendApprovalMessage(input: {
  id: string;
  imageUrl: string;
  caption: string;
}): Promise<{ messageId: number }> {
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chatId) throw new Error("TELEGRAM_ADMIN_CHAT_ID is not configured");

  const result = await call<{ message_id: number }>("sendPhoto", {
    chat_id: chatId,
    photo: input.imageUrl,
    caption: input.caption.slice(0, 1024),
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Approve", callback_data: approvalCallbackData("approve", input.id) },
          { text: "🗑 Reject", callback_data: approvalCallbackData("reject", input.id) },
        ],
      ],
    },
  });
  return { messageId: result.message_id };
}

/** Acknowledge a button tap (stops the spinner; optional toast text). */
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await call("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

/** Replace a message's caption and remove its buttons after a decision. */
export async function finalizeApprovalMessage(
  chatId: number | string,
  messageId: number,
  newCaption: string
): Promise<void> {
  await call("editMessageCaption", {
    chat_id: chatId,
    message_id: messageId,
    caption: newCaption.slice(0, 1024),
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [] },
  });
}

/** Register our webhook with Telegram (one-time setup / re-point from n8n). */
export async function setWebhook(url: string): Promise<void> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  await call("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["callback_query", "message"],
  });
}
