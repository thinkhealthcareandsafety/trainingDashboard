import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { fileSentMail, latestMail, mailboxInfo } from "./zohoMail";
import type { CardEvent } from "./types";

/*
 * Replies to the Fulfillment gratitude emails. They're sent from learn@ (an alias on Shikha's mailbox); Zoho Mail's own
 * filter forwards every reply to digital@ for Shreya. With each hourly sync the dashboard reads the newest emails in
 * that mailbox's Inbox and records the ones that answer a gratitude email — same thread, or the same subject with
 * "Re:" — as `fulfil_reply` events, which star the card. Nothing else in the mailbox is looked at or kept.
 * Every gratitude email sent goes into the "Gratitude Emails Sent" folder (moved right after sending; any the move
 * missed — Zoho may still be saving it — are moved by the hourly check).
 */

export const GRATITUDE_FROM = "learn@thinkhealth.in";
export const GRATITUDE_FOLDER = "Gratitude Emails Sent";
const OUR_DOMAIN = "@thinkhealth.in"; // our own replies and forwards aren't the customer's
const WINDOW_DAYS = 60; // gratitude emails older than this aren't watched any more

/** "RE: Fwd: Thank you…" → "thank you…" */
export const baseSubject = (s: string) => s.replace(/^\s*((re|fwd?|aw|sv)\s*(\[\d+\])?\s*:\s*)+/i, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Finds new replies and records them. Returns how many were new; no Zoho calls when no email is awaiting one. */
export async function checkGratitudeReplies(): Promise<number> {
  const col = (await db()).collection<CardEvent & { _id: string }>("cardEvents");
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const all = await col.find({ kind: { $in: ["fulfil_email", "fulfil_reply", "fulfil_certs"] }, revertedAt: { $exists: false } }).toArray();
  const done = new Set(all.filter((e) => e.kind === "fulfil_certs").flatMap((e) => e.cardIds));
  const recent = all.filter((e) => e.kind === "fulfil_email" && e.at >= since);
  const sent = recent.filter((e) => !e.cardIds.some((id) => done.has(id))); // still waiting for the list
  if (!recent.length || !(await mailboxInfo(GRATITUDE_FROM))) return 0;
  const known = new Set(all.filter((e) => e.kind === "fulfil_reply").map((e) => e.messageId));

  const [outbox, filed] = await Promise.all([latestMail(GRATITUDE_FROM, "sent"), latestMail(GRATITUDE_FROM, { name: GRATITUDE_FOLDER })]);
  // Gratitude emails still in Sent (the move right after sending missed them) go to their folder now.
  const ours = new Set(recent.map((e) => e.messageId).filter(Boolean));
  const stray = outbox.filter((m) => ours.has(m.messageId)).map((m) => m.messageId);
  if (stray.length) await fileSentMail(GRATITUDE_FROM, stray, GRATITUDE_FOLDER).catch((e) => console.error(`[zoho mail] filing gratitude emails failed: ${e}`));
  if (!sent.length) return 0;

  const inbox = await latestMail(GRATITUDE_FROM, "inbox");
  const threadOf = new Map([...outbox, ...filed].filter((m) => m.threadId).map((m) => [m.messageId, m.threadId!]));
  const fresh: (CardEvent & { _id: string })[] = [];
  for (const m of inbox) {
    if (known.has(m.messageId) || m.fromAddress.endsWith(OUR_DOMAIN)) continue;
    const subject = baseSubject(m.subject);
    const email = sent
      .filter((e) => m.receivedTime > Date.parse(e.at) - 60_000)
      .filter((e) => (m.threadId && (m.threadId === threadOf.get(e.messageId ?? "") || m.threadId === e.messageId)) || (e.subject && baseSubject(e.subject) === subject))
      .at(-1);
    if (!email) continue;
    const id = randomUUID().replace(/-/g, "");
    fresh.push({
      _id: id, id, cardIds: email.cardIds, kind: "fulfil_reply", value: m.fromAddress, subject: m.subject, messageId: m.messageId,
      folderId: m.folderId, at: new Date(m.receivedTime).toISOString(), by: "Zoho Mail",
    });
    known.add(m.messageId);
  }
  if (fresh.length) await col.insertMany(fresh);
  return fresh.length;
}
