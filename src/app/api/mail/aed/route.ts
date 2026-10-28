import { randomUUID } from "node:crypto";
import { signedInMember, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { boardsFor } from "@/lib/roles";
import { buildMail, getTemplate } from "@/lib/mailTemplates";
import { mailContent, mailboxInfo, sendMail } from "@/lib/zohoMail";
import { AED_FROM } from "@/lib/aedReplies";
import { aedData, getSnapshot } from "@/lib/zohoSync";
import type { CardEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

// AedSmartx Contacted: the onboarding emails, sent from Zoho Mail (hello@thinkhealth.in). GET previews one; POST sends
// it and records it in the change log (only the server records sent emails — they can't be reverted).
// Priyanka picks the template (owner, 14 Oct 2026 — first contact or any reminder; the next in line by default). The
// first email starts the thread; every later one replies to it, whichever template it uses.

const TEMPLATE = "aed_onboarding";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function context(request: Request, card: string | null, to: string | null, pick?: number | null) {
  const me = await signedInMember(request);
  if (!me) return { error: unauthorized() };
  if (!boardsFor(me).includes("aed")) return { error: Response.json({ error: "Only the AedSmartx board sends these emails" }, { status: 403 }) };
  if (!card?.startsWith("aed:")) return { error: Response.json({ error: "Unknown card" }, { status: 400 }) };
  if (!to || !EMAIL.test(to.trim())) return { error: Response.json({ error: "Add a valid email first" }, { status: 400 }) };
  const snap = await getSnapshot();
  const inv = snap && aedData(snap).invoices.find((i) => `aed:${i.invoiceId}` === card);
  if (!inv) return { error: Response.json({ error: "That invoice isn't on the AedSmartx board" }, { status: 404 }) };
  const template = await getTemplate(TEMPLATE);
  const events = (await db()).collection<CardEvent & { _id: string }>("cardEvents");
  // Emails she sent from Zoho Mail herself and marked as sent (owner, 28 Oct 2026) count towards the next in line, but
  // aren't quoted or replied to — the dashboard doesn't have them.
  const earlier = await events.find({ kind: { $in: ["aed_email", "aed_email_marked"] }, cardIds: card, revertedAt: { $exists: false } }).sort({ at: 1 }).toArray();
  const ours = earlier.filter((e) => e.kind === "aed_email");
  const steps = template.steps.map((s) => s.label);
  const next = Math.min(earlier.length + 1, steps.length); // past the last template the last one repeats
  const step = pick && Number.isInteger(pick) && pick >= 1 && pick <= steps.length ? pick : next;
  const mail = buildMail(template, step, { invoice: inv.number }, ours.map((e) => ({ at: e.at, step: e.step ?? 1 })), ours.length > 0);
  return { me, card, to: to.trim(), inv, template, events, earlier, ours, step, next, steps, mail };
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  try {
    // ?card=&reply=<event id>: a customer's reply (found by the hourly check in hello@'s Inbox), to show on the card.
    const replyId = q.get("reply");
    if (replyId) {
      const me = await signedInMember(request);
      if (!me) return unauthorized();
      if (!boardsFor(me).includes("aed")) return Response.json({ error: "Only the AedSmartx board reads these replies" }, { status: 403 });
      const r = await (await db()).collection<CardEvent & { _id: string }>("cardEvents").findOne({ _id: replyId, kind: "aed_reply", cardIds: q.get("card") ?? "" });
      if (!r?.messageId || !r.folderId) return Response.json({ error: "That reply isn't on this card" }, { status: 404 });
      return Response.json({ from: r.value, subject: r.subject, at: r.at, html: await mailContent(AED_FROM, r.folderId, r.messageId) });
    }
    const c = await context(request, q.get("card"), q.get("to"), Number(q.get("template")) || null);
    if ("error" in c) return c.error;
    const box = await mailboxInfo(c.template.from);
    return Response.json({
      connected: Boolean(box), from: c.template.from, to: c.to, step: c.step, next: c.next, steps: c.steps, label: c.mail.label, subject: c.mail.subject, text: c.mail.text,
      replyTo: c.ours[0] ? { at: c.ours[0].at, messageId: c.ours[0].messageId } : null, count: c.earlier.length,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't prepare the email" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  // template = the chosen template (1-based); count = emails already sent, as the preview showed. (A tab from before
  // 14 Oct sends only step = count + 1, which was also the template.)
  const body = (await request.json().catch(() => ({}))) as { card?: string; to?: string; template?: number; count?: number; step?: number; testTo?: string };
  try {
    const c = await context(request, body.card ?? null, body.to ?? null, body.template ?? body.step ?? null);
    if ("error" in c) return c.error;
    // A test: the same email to someone of ours, marked [TEST], as a new email — not counted, not in the change log.
    if (body.testTo !== undefined) {
      const testTo = body.testTo.trim();
      if (!EMAIL.test(testTo)) return Response.json({ error: "Enter a valid email for the test" }, { status: 400 });
      await sendMail(c.template.from, { to: testTo, subject: `[TEST] ${c.mail.subject}`, html: c.mail.html });
      return Response.json({ ok: true, test: true });
    }
    // The preview she saw must still be the next email (someone else may have just sent one), and no double clicks.
    if ((body.count ?? (body.step ?? 0) - 1) !== c.earlier.length) return Response.json({ error: "Another email was just sent for this invoice — check it and try again" }, { status: 409 });
    const thread = c.ours.find((e) => e.messageId);
    const sent = await sendMail(c.template.from, { to: c.to, subject: c.mail.subject, html: c.mail.html, replyTo: thread?.messageId });
    const event: CardEvent = {
      id: randomUUID().replace(/-/g, ""), cardIds: [c.card], kind: "aed_email", value: c.to, step: c.step, subject: c.mail.subject,
      messageId: sent.messageId, threaded: sent.threaded, at: new Date().toISOString(), by: c.me.name,
    };
    await c.events.insertOne({ ...event, _id: event.id });
    return Response.json({ ok: true, event, label: c.mail.label });
  } catch (e) {
    console.error("[zoho mail] send failed:", e);
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't send the email" }, { status: 502 });
  }
}
