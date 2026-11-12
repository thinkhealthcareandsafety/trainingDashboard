import { signedInMember, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { canQuote } from "@/lib/roles";
import { itemSets, type ZItem } from "@/lib/zoho";
import { byNewest, isTrainingOnly, readCoordinator, toTrainingQuote } from "@/lib/trainingManager";
import { markLoginSent, newerQuotes, quoteOf, setCoordinator, staffParticipants, staffPortal, trainingDoc } from "@/lib/portalTrainings";
import { passwordForEmail } from "@/lib/portalAuth";
import { portalTemplates } from "@/lib/templateStore";
import { loginEmail, trainingLink } from "@/lib/portalEmail";
import { portalBase } from "@/lib/portalHost";
import { upsertCoordinator } from "@/lib/quotations";
import { sendMail } from "@/lib/zohoMail";
import { convertToPerforma, emailPerforma, readPerforma, savePerforma } from "@/lib/performa";
import { markConfirmed, markPerformaEmailed, markRejectedInZoho, reopen } from "@/lib/portalTrainings";
import { setQuoteStatus } from "@/lib/quotations";
import { piEmail, textToHtml } from "@/lib/performaRules";
import { fmtProposalDate, indiaToday } from "@/lib/portalRules";
import { piTemplate, templateOverrides } from "@/lib/templateStore";
import { signature } from "@/lib/quoteEmails";

export const dynamic = "force-dynamic";

/*
 * Training Management (docs/TRAINING_MANAGER_PLAN.md): the training-only quotes, from our copy of Zoho (zohoDocs, kept by
 * the hourly sync), with each one's Training Manager state. Those who send quotations.
 *  GET                    — the list, each with its coordinator and portal state (status, proposal, registered)
 *  GET ?people=<id>       — a training's attendee list
 *  POST { action: "coordinator", id, name, email, phone } — set the coordinator (saved on the customer in Zoho)
 *  POST { action: "sendlogin", id } — the login from learn@ (step 8): a fresh password, unless they chose their own
 * Accept date → Performa (owner, 12 Nov):
 *  POST { action: "accept", id }      — the quote becomes a Draft Performa in Zoho; the portal stamps Confirmed
 *  GET ?pi=<id>                       — that draft, as Zoho has it now, plus the email ready to send
 *  POST { action: "pisave", id, edit } — our edit saved straight to the Zoho draft
 *  POST { action: "piemail", id, to, cc, subject, text } — the Performa emailed from Zoho with its PDF (live site only)
 *  POST { action: "reopen", id }     — a rejected quotation open again (Zoho back to Sent)
 *  POST { action: "decline", id }    — retry marking a rejected quotation Declined in Zoho
 */
const trainingSet = async () => itemSets(((await (await db()).collection<{ _id: string; items?: ZItem[] }>("kv").findOne({ _id: "zoho_items" }))?.items) ?? []).training;
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const FROM = "learn@thinkhealth.in";

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!canQuote(me)) return Response.json({ error: "Only those who send quotations see Training Management" }, { status: 403 });
  try {
    const params = new URL(request.url).searchParams;
    const people = params.get("people");
    if (people) return Response.json({ list: await staffParticipants(people) });
    const pi = params.get("pi");
    if (pi) {
      const t = await trainingDoc(pi);
      const q = await quoteOf(pi);
      if (!t?.confirmed || !q) return Response.json({ error: "This training has no Performa yet" }, { status: 404 });
      const draft = await readPerforma(t.confirmed.salesorderId, await trainingSet());
      const p = t.proposal;
      const m = piEmail(await piTemplate("training"), {
        name: t.coordinator?.name ?? "", number: draft.number, quote: q.number, training: q.lines.map((l) => l.name).join(" + "),
        dates: p ? p.dates.map(fmtProposalDate).join(" + ") + (p.tentative ? " (tentative)" : "") : "", location: p?.location ?? "", people: p ? String(p.headcount) : "",
        total: inr(draft.total), sign: `Warm regards,\n${signature(q.salesperson || me.name, await templateOverrides())}`,
      });
      const to = t.coordinator?.email ? [t.coordinator.email] : q.contact?.email ? [q.contact.email] : [];
      const cc = q.contact?.email && !to.includes(q.contact.email.toLowerCase()) ? [q.contact.email.toLowerCase()] : [];
      return Response.json({ draft, email: { to, cc, subject: m.subject, text: m.text }, emailedAt: t.confirmed.emailedAt ?? null, live: process.env.VERCEL_ENV === "production" });
    }
    const d = await db();
    const items = ((await d.collection<{ _id: string; items?: ZItem[] }>("kv").findOne({ _id: "zoho_items" }))?.items) ?? [];
    const training = itemSets(items).training;
    const docs = await d.collection<{ _id: string; doc: Record<string, unknown> }>("zohoDocs")
      .find({ kind: "estimates", training: true }, { projection: { doc: 1 } }).toArray();
    const synced = docs.map((x) => x.doc).filter((doc) => isTrainingOnly(doc, training)).map((doc) => toTrainingQuote(doc, training));
    // A training quote emailed since the last hourly sync (owner, 12 Nov: "I added a new quote but don't see it").
    const quotes = [...synced, ...(await newerQuotes(new Set(docs.map((x) => String(x.doc?.estimate_id ?? "")))))].sort(byNewest);
    const ids = quotes.map((x) => x.id);
    const [portal, co] = await Promise.all([
      staffPortal(ids),
      d.collection<{ _id: string; coordinator?: { name: string; email: string; phone: string } }>("portalTrainings").find({ _id: { $in: ids } }, { projection: { coordinator: 1 } }).toArray(),
    ]);
    const coordinators = new Map(co.map((p) => [p._id, p.coordinator ?? null]));
    return Response.json({
      quotes: quotes.map((x) => ({ ...x, coordinator: coordinators.get(x.id) ?? null, portal: portal.get(x.id) ?? null })),
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't read the training quotes" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!canQuote(me)) return Response.json({ error: "Only those who send quotations use Training Management" }, { status: 403 });
  const b = (await request.json().catch(() => null)) as { action?: string; id?: unknown; name?: unknown; email?: unknown; phone?: unknown; edit?: unknown; to?: unknown; cc?: unknown; subject?: unknown; text?: unknown } | null;
  const id = String(b?.id ?? "").slice(0, 30);
  if (!/^\d+$/.test(id)) return Response.json({ error: "Unknown training" }, { status: 400 });
  try {
    const q = await quoteOf(id);
    if (!q) return Response.json({ error: "That training quote isn't in our copy of Zoho yet. Refresh in a minute." }, { status: 404 });

    if (b?.action === "coordinator") {
      const co = readCoordinator({ name: String(b.name ?? ""), email: String(b.email ?? ""), phone: String(b.phone ?? "") });
      if ("error" in co) return Response.json({ error: co.error }, { status: 400 });
      const person = await upsertCoordinator({ contactId: q.customerId, ...co });
      const coordinator = { name: [co.firstName, co.lastName].filter(Boolean).join(" "), email: co.email, phone: co.phone, contactPersonId: person.id };
      await setCoordinator(id, q.customerId, coordinator);
      console.log(`[training-management] ${me.name} set the coordinator of ${q.number}`);
      return Response.json({ ok: true, coordinator: { name: coordinator.name, email: coordinator.email, phone: coordinator.phone } });
    }

    if (b?.action === "reopen") {
      const r = await reopen(id, (x) => setQuoteStatus(x, "sent"));
      if ("error" in r) return Response.json({ error: r.error }, { status: r.status });
      console.log(`[training-management] ${me.name} reopened ${q.number}`);
      return Response.json({ ok: true });
    }

    if (b?.action === "decline") {
      const t = await trainingDoc(id);
      if (!t?.rejected) return Response.json({ error: "This quotation isn't rejected" }, { status: 400 });
      await setQuoteStatus(id, "declined");
      await markRejectedInZoho(id);
      return Response.json({ ok: true });
    }

    if (b?.action === "accept") {
      const t = await trainingDoc(id);
      if (t?.rejected) return Response.json({ error: "The coordinator rejected this quotation. Reopen it first." }, { status: 409 });
      if (!t?.proposal) return Response.json({ error: "The coordinator hasn't accepted with a date yet" }, { status: 400 });
      if (t.confirmed) return Response.json({ error: `Already accepted: ${t.confirmed.number}` }, { status: 409 });
      const draft = await convertToPerforma(id, t.proposal, await trainingSet(), indiaToday());
      await markConfirmed(id, { at: new Date().toISOString(), by: me.name, salesorderId: draft.salesorderId, number: draft.number });
      console.log(`[training-management] ${me.name} accepted ${q.number}'s date: ${draft.number} (draft)`);
      return Response.json({ ok: true, draft });
    }

    if (b?.action === "pisave") {
      const t = await trainingDoc(id);
      if (!t?.confirmed) return Response.json({ error: "This training has no Performa yet" }, { status: 404 });
      const r = await savePerforma(t.confirmed.salesorderId, b.edit, await trainingSet());
      return "error" in r ? Response.json({ error: r.error }, { status: 400 }) : Response.json({ ok: true, draft: r });
    }

    if (b?.action === "piemail") {
      const t = await trainingDoc(id);
      if (!t?.confirmed) return Response.json({ error: "This training has no Performa yet" }, { status: 404 });
      if (process.env.VERCEL_ENV !== "production") return Response.json({ error: "Only the live site sends email" }, { status: 409 });
      const mails = (v: unknown) => String(v ?? "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
      const to = mails(b.to), cc = mails(b.cc).filter((m) => !to.includes(m));
      const subject = String(b.subject ?? "").trim().slice(0, 300), text = String(b.text ?? "").slice(0, 20000);
      const bad = [...to, ...cc].find((m) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m));
      if (!to.length) return Response.json({ error: "Add who it goes to" }, { status: 400 });
      if (bad) return Response.json({ error: `${bad} doesn't look like an email` }, { status: 400 });
      if (!subject || !text.trim()) return Response.json({ error: "Type the subject and the message" }, { status: 400 });
      await emailPerforma(t.confirmed.salesorderId, { to, cc, subject, body: textToHtml(text) });
      await markPerformaEmailed(id);
      console.log(`[training-management] ${me.name} emailed ${t.confirmed.number}`);
      return Response.json({ ok: true });
    }

    if (b?.action === "sendlogin") {
      const t = await trainingDoc(id);
      if (!t?.coordinator?.email) return Response.json({ error: "Add the training coordinator first" }, { status: 400 });
      // Like the other emails: only the live site sends them, so a local copy can't email a client by accident.
      if (process.env.VERCEL_ENV !== "production") return Response.json({ error: "Only the live site sends email" }, { status: 409 });
      const email = t.coordinator.email.toLowerCase();
      const { password, undo } = await passwordForEmail(email, t.coordinator.name);
      const m = loginEmail(await portalTemplates(), { name: t.coordinator.name, training: q.lines.map((l) => l.name).join(" + ") || "your training", number: q.number }, { link: trainingLink(portalBase(), q.number), email, password });
      try { await sendMail(FROM, { to: email, subject: m.subject, html: m.html }); } catch (e) { await undo().catch(() => undefined); throw e; }
      await markLoginSent(id);
      console.log(`[training-management] ${me.name} sent the Training Manager login for ${q.number}`);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("[training-management]", e);
    return Response.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 502 });
  }
}
