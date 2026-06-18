/**
 * POST /api/telegram/webhook
 *
 * Receives Telegram updates for the approval bot (@rideprestigo_ig_bot).
 * Handles inline-button taps (Approve / Reject) on draft messages.
 *
 * Auth: Telegram echoes the secret set via setWebhook in the
 * `X-Telegram-Bot-Api-Secret-Token` header — we reject any request without it.
 * (Server-to-server; not under /api/admin, so no Origin/CSRF guard applies.)
 *
 * Always returns 200 so Telegram does not retry on application errors.
 */

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import {
  parseApprovalCallback,
  answerCallbackQuery,
  finalizeApprovalMessage,
} from "@/lib/content/telegram";
import { approveContent, rejectContent } from "@/lib/content/publish";

type TelegramUpdate = {
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
  message?: { chat: { id: number }; text?: string };
};

export async function POST(request: Request) {
  // Validate the shared secret token.
  // SEC-14: timing-safe comparison to prevent secret brute-force via timing side-channel
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = request.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || !got) return NextResponse.json({ ok: false }, { status: 401 });
  const expBuf = Buffer.from(expected);
  const gotBuf = Buffer.from(got);
  if (expBuf.length !== gotBuf.length || !timingSafeEqual(expBuf, gotBuf)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  const cq = update?.callback_query;

  if (!cq?.data || !cq.message) {
    // Non-button update (e.g. a plain message). Acknowledge and ignore.
    return NextResponse.json({ ok: true });
  }

  const parsed = parseApprovalCallback(cq.data);
  if (!parsed) {
    await answerCallbackQuery(cq.id, "Unknown action").catch(() => {});
    return NextResponse.json({ ok: true });
  }

  const { action, id } = parsed;
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;

  try {
    if (action === "approve") {
      const item = await approveContent(id);
      await answerCallbackQuery(cq.id, "Approved ✅").catch(() => {});
      await finalizeApprovalMessage(
        chatId,
        messageId,
        `✅ <b>Approved</b> — ${item.status}`
      ).catch(() => {});
    } else {
      await rejectContent(id);
      await answerCallbackQuery(cq.id, "Rejected 🗑").catch(() => {});
      await finalizeApprovalMessage(chatId, messageId, "🗑 <b>Rejected</b>").catch(() => {});
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await answerCallbackQuery(cq.id, `Error: ${message.slice(0, 180)}`).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
