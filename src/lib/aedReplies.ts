import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { baseSubject } from "./gratitudeReplies";
import { latestMail, mailboxInfo } from "./zohoMail";
import type { CardEvent } from "./types";

/*
 * Replies to Priyanka's AedSmartx onboarding emails (owner, 14 Oct 2026). They go out from hello@thinkhealth.in, so the
 * customers' replies land in its Inbox. With each hourly sync the dashboard reads the newest emails there and records the
 * ones that answer an onboarding email — same thread, or the same subject with "Re:" (the subject carries the invoice
 * number) — as `aed_reply` events, which star the card until she opens it in Zoho Mail. Nothing else is looked at or kept.
 * Reading folders needs the ZohoMail.folders scope: hello@ was first connected without it, so Admin connects it again once.
 */

export const AED_FROM = "hello@thinkhealth.in";
const OUR_DOMAIN = "@thinkhealth.in";
const WINDOW_DAYS = 60; // onboarding emails older than this aren't watched any more

/** Finds new replies and records them. Returns how many were new; no Zoho calls when no email was sent lately. */
export async function checkAedReplies(): Promise<number> {
  const col = (await db()).collection<CardEvent & { _id: string }>("cardEvents");
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const all = await col.find({ kind: { $in: ["aed_email", "aed_reply"] }, revertedAt: { $exists: false } }).toArray();
  const sent = all.filter((e) => e.kind === "aed_email" && e.at >= since);
  if (!sent.length || !(await mailboxInfo(AED_FROM))) return 0;
  const known = new Set(all.filter((e) => e.kind === "aed_reply").map((e) => e.messageId));

  const [inbox, outbox] = await Promise.all([latestMail(AED_FROM, "inbox"), latestMail(AED_FROM, "sent")]);
  const byId = new Map(outbox.map((m) => [m.messageId, m]));
  // Each email's thread and subject (emails sent before 14 Oct don't carry their subject — Sent still has it).
  const ours = sent.map((e) => {
    const m = byId.get(e.messageId ?? "");
    return { e, thread: m?.threadId, subject: baseSubject(e.subject ?? m?.subject ?? "") };
  });
  const fresh: (CardEvent & { _id: string })[] = [];
  for (const m of inbox) {
    if (known.has(m.messageId) || m.fromAddress.endsWith(OUR_DOMAIN)) continue;
    const subject = baseSubject(m.subject);
    const match = ours
      .filter((o) => m.receivedTime > Date.parse(o.e.at) - 60_000)
      .filter((o) => (m.threadId && (m.threadId === o.thread || m.threadId === o.e.messageId)) || (o.subject && o.subject === subject))
      .at(-1);
    if (!match) continue;
    const id = randomUUID().replace(/-/g, "");
    fresh.push({
      _id: id, id, cardIds: [match.e.cardIds[0]], kind: "aed_reply", value: m.fromAddress, subject: m.subject, messageId: m.messageId,
      folderId: m.folderId, at: new Date(m.receivedTime).toISOString(), by: "Zoho Mail",
    });
    known.add(m.messageId);
  }
  if (fresh.length) await col.insertMany(fresh);
  return fresh.length;
}
