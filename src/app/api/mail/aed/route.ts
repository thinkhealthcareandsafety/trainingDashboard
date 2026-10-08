import { randomUUID } from "node:crypto";
import { signedInMember, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { boardsFor } from "@/lib/roles";
import { buildMail, getTemplate } from "@/lib/mailTemplates";
import { mailboxInfo, sendMail } from "@/lib/zohoMail";
import { aedData, getSnapshot } from "@/lib/zohoSync";
import type { CardEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

// AedSmartx Contacted: the onboarding emails, sent from Zoho Mail (hello@thinkhealth.in). GET previews the next one;
// POST sends it and records it in the change log (only the server records sent emails — they can't be reverted).
// The first email starts the thread; each later one replies to it, with the next template.

const TEMPLATE = "aed_onboarding";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function context(request: Request, card: string | null, to: string | null) {
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
  const earlier = await events.find({ kind: "aed_email", cardIds: card, revertedAt: { $exists: false } }).sort({ at: 1 }).toArray();
  const step = earlier.length + 1;
  const mail = buildMail(template, step, { invoice: inv.number }, earlier.map((e) => ({ at: e.at, step: e.step ?? 1 })));
  return { me, card, to: to.trim(), inv, template, events, earlier, step, mail };
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  try {
    const c = await context(request, q.get("card"), q.get("to"));
    if ("error" in c) return c.error;
    const box = await mailboxInfo(c.template.from);
    return Response.json({
      connected: Boolean(box), from: c.template.from, to: c.to, step: c.step, label: c.mail.label, subject: c.mail.subject, text: c.mail.text,
      replyTo: c.earlier[0] ? { at: c.earlier[0].at, messageId: c.earlier[0].messageId } : null, count: c.earlier.length,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't prepare the email" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { card?: string; to?: string; step?: number; testTo?: string };
  try {
    const c = await context(request, body.card ?? null, body.to ?? null);
    if ("error" in c) return c.error;
    // A test: the same email to someone of ours, marked [TEST], as a new email — not counted, not in the change log.
    if (body.testTo !== undefined) {
      const testTo = body.testTo.trim();
      if (!EMAIL.test(testTo)) return Response.json({ error: "Enter a valid email for the test" }, { status: 400 });
      await sendMail(c.template.from, { to: testTo, subject: `[TEST] ${c.mail.subject}`, html: c.mail.html });
      return Response.json({ ok: true, test: true });
    }
    // The preview she saw must still be the next email (someone else may have just sent one), and no double clicks.
    if (body.step !== c.step) return Response.json({ error: "Another email was just sent for this invoice — check it and try again" }, { status: 409 });
    const thread = c.earlier.find((e) => e.messageId);
    const sent = await sendMail(c.template.from, { to: c.to, subject: c.mail.subject, html: c.mail.html, replyTo: thread?.messageId });
    const event: CardEvent = {
      id: randomUUID().replace(/-/g, ""), cardIds: [c.card], kind: "aed_email", value: c.to, step: c.step,
      messageId: sent.messageId, threaded: sent.threaded, at: new Date().toISOString(), by: c.me.name,
    };
    await c.events.insertOne({ ...event, _id: event.id });
    return Response.json({ ok: true, event, label: c.mail.label });
  } catch (e) {
    console.error("[zoho mail] send failed:", e);
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't send the email" }, { status: 502 });
  }
}
