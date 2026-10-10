import { buildMail, getTemplate } from "@/lib/mailTemplates";
import { fileSentMail, mailContent, mailboxInfo, sendMail } from "@/lib/zohoMail";
import { GRATITUDE_FOLDER } from "@/lib/gratitudeReplies";
import { eventsCol, fulfilContext, recordServerEvent } from "@/lib/fulfilServer";
import { fmtDays } from "@/lib/pipeline";
import type { CardView } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

// Fulfillment · the gratitude email, sent from Zoho Mail as learn@thinkhealth.in (an alias on Shikha's mailbox) to the
// concerned person's email. GET ?card= previews it; POST { card, to } sends it once and records it (only the server
// records sent emails); POST { …, testTo } sends a [TEST] copy that isn't recorded.
// GET ?card=&reply=<event id> reads a reply the hourly check found (for the popup when a starred card is opened).
// Every email sent from here (tests too) is moved to the "Gratitude Emails Sent" folder in the sending mailbox.

const TEMPLATE = "fulfil_gratitude";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Into the folder; if Zoho hasn't finished saving it yet, the hourly check moves it (the email is sent either way). */
async function file(from: string, messageId?: string) {
  if (!messageId) return;
  await fileSentMail(from, [messageId], GRATITUDE_FOLDER).catch((e) => console.warn(`[zoho mail] couldn't file the gratitude email yet: ${e instanceof Error ? e.message : e}`));
}

const varsOf = (card: CardView) => ({
  location: card.certAlias || card.name,
  customer: card.name,
  ref: card.docNumber ?? "",
  course: card.training.map((t) => t.name).join(", ") || "training",
  dates: card.schedule?.dates.length ? fmtDays(card.schedule.dates.join(",")) : "",
  people: String(card.training[0]?.qty ?? ""),
});

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  try {
    const c = await fulfilContext(request, q.get("card"));
    if ("error" in c) return c.error;
    const template = await getTemplate(TEMPLATE);
    const replyId = q.get("reply");
    if (replyId) {
      const r = await (await eventsCol()).findOne({ _id: replyId, kind: "fulfil_reply", cardIds: c.card.id });
      if (!r?.messageId || !r.folderId) return Response.json({ error: "That reply isn't on this card" }, { status: 404 });
      return Response.json({ from: r.value, subject: r.subject, at: r.at, html: await mailContent(template.from, r.folderId, r.messageId) });
    }
    const mail = buildMail(template, 1, varsOf(c.card), []);
    return Response.json({
      connected: Boolean(await mailboxInfo(template.from)), from: template.from, to: c.card.concernedEmail ?? "", subject: mail.subject, text: mail.text,
      sent: c.card.fulfillment!.email ?? null,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't prepare the email" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { card?: string; to?: string; testTo?: string };
  try {
    const c = await fulfilContext(request, body.card);
    if ("error" in c) return c.error;
    const template = await getTemplate(TEMPLATE);
    const mail = buildMail(template, 1, varsOf(c.card), []);
    if (body.testTo !== undefined) {
      const testTo = body.testTo.trim();
      if (!EMAIL.test(testTo)) return Response.json({ error: "Enter a valid email for the test" }, { status: 400 });
      const test = await sendMail(template.from, { to: testTo, subject: `[TEST] ${mail.subject}`, html: mail.html });
      await file(template.from, test.messageId);
      return Response.json({ ok: true, test: true });
    }
    // Once per training, to the concerned email shown in the popup (set when scheduling, or changed there just before —
    // that change may still be on its way to the server, so the popup's address is the one used).
    if (c.card.fulfillment!.email) return Response.json({ error: "The gratitude email was already sent for this training" }, { status: 409 });
    const to = (body.to ?? "").trim();
    if (!EMAIL.test(to)) return Response.json({ error: "Set the concerned person's email first" }, { status: 400 });
    const sent = await sendMail(template.from, { to, subject: mail.subject, html: mail.html });
    const event = await recordServerEvent({ cardIds: [c.card.id], kind: "fulfil_email", value: to, subject: mail.subject, messageId: sent.messageId, at: new Date().toISOString(), by: c.me.name });
    await file(template.from, sent.messageId);
    return Response.json({ ok: true, event });
  } catch (e) {
    console.error("[zoho mail] gratitude email failed:", e);
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't send the email" }, { status: 502 });
  }
}
