import { signedInMember, unauthorized } from "@/lib/auth";
import { withBump } from "@/lib/changes";
import { db } from "@/lib/db";
import { canQuote } from "@/lib/roles";
import { itemSets, type ZItem } from "@/lib/zoho";
import { byNewest, isTrainingOnly, readCoordinator, toTrainingQuote } from "@/lib/trainingManager";
import { certificateLines, markLoginSent, newerQuotes, quoteOf, setCoordinator, staffCertificatesAllowed, staffParticipants, staffPortal, staffQuizResults, trainingDoc } from "@/lib/portalTrainings";
import { certificatePdf, sendCertificates } from "@/lib/portalCertSend";
import { certFileName } from "@/lib/portalCertRules";
import { passwordForEmail } from "@/lib/portalAuth";
import { portalTemplates } from "@/lib/templateStore";
import { declineLink, loginEmail, trainingLink } from "@/lib/portalEmail";
import { portalBase } from "@/lib/portalHost";
import { upsertCoordinator } from "@/lib/quotations";
import { sendMail } from "@/lib/zohoMail";
import { confirmPerformaInZoho, convertToPerforma, emailPerforma, readPerforma, salespersonFor, savePerforma } from "@/lib/performa";
import { declineKeyFor, markBoard, markConfirmed, markPerformaEmailed, markRejectedInZoho, markZohoConfirmed, reopen } from "@/lib/portalTrainings";
import { scheduleOnBoard } from "@/lib/boardScheduleServer";
import { forgetBoardDates } from "@/lib/boardDates";
import { forgetZohoDoc, goneInZoho, writeThroughLater } from "@/lib/writeThrough";
import { performaDeleted } from "@/lib/portalCleanup";
import { setQuoteStatus } from "@/lib/quotations";
import { editOf, piEmail, readPiEmailFields, readTrainers, textToHtml, zohoTrainer } from "@/lib/performaRules";
import { after } from "next/server";
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
 *  POST { action: "accept", id }      — Convert to PI: the quote becomes a Draft Performa in Zoho; the date is fixed
 *  GET ?pi=<id>                       — that draft, as Zoho has it now, plus the email ready to send
 *  POST { action: "pisave", id, edit } — our edit saved straight to the Zoho draft
 *  POST { action: "piconfirm", id, trainers, edit?, send?, to, cc, subject, text } — Mark confirmed (owner, 13 Nov): the
 *    trainers are required (Zoho's Trainer Name = the first; all of them on the board, so reminders go to them); Confirmed
 *    in Zoho, the portal stamps Confirmed, the training goes on the Training board; with send, then emailed (live site only)
 *  POST { action: "piemail", id, to, cc, subject, text } — the Performa emailed (again) from Zoho with its PDF (live site only)
 *  POST { action: "reopen", id }     — a rejected quotation open again (Zoho back to Sent)
 *  POST { action: "decline", id }    — retry marking a rejected quotation Declined in Zoho
 * Certificates from the quiz (owner, 14 Nov):
 *  POST { action: "sendcerts", id }  — email the passed people's certificates not yet sent (when the coordinator didn't End)
 *  GET ?cert=<id>&th=<TH001>         — one person's certificate PDF, to check it
 */
const trainingSet = async () => itemSets(((await (await db()).collection<{ _id: string; items?: ZItem[] }>("kv").findOne({ _id: "zoho_items" }))?.items) ?? []).training;
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const FROM = "learn@thinkhealth.in";

/**
 * The Performa was deleted in Zoho (owner, 13 Nov: "since I deleted the PI, everything from here should revert"): the
 * training is back to Accepted (Convert to PI again; the coordinator can change the date; no Confirmed stamp or attendance),
 * the Performa leaves our Zoho copies now (the board's card goes, so the quote stands on its own again), and the quote is
 * read again for its status. Noticed when Zoho answers "does not exist" — opening the row, or any Performa button.
 */
async function performaGone(id: string, salesorderId: string): Promise<Response> {
  const was = (await trainingDoc(id))?.confirmed;
  await performaDeleted(salesorderId); // back to Accepted, attendance cleared (portalCleanup.ts)
  await forgetZohoDoc("salesorders", salesorderId);
  writeThroughLater([{ kind: "estimates", id }]);
  forgetBoardDates();
  console.log(`[training-management] ${was?.number ?? salesorderId} was deleted in Zoho: the training is back to Accepted`);
  return Response.json({ gone: true, error: `${was?.number ?? "This Performa"} was deleted in Zoho, so the training is back to Accepted. Convert to PI again when it's ready.` }, { status: 410 });
}

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!canQuote(me)) return Response.json({ error: "Only those who send quotations see Training Management" }, { status: 403 });
  try {
    const params = new URL(request.url).searchParams;
    const people = params.get("people");
    if (people) return Response.json({ list: await staffParticipants(people) });
    // The quiz's results, read only (owner, 13 Nov: "everyone else can see the same results too").
    const quiz = params.get("quiz");
    if (quiz) return Response.json({ results: await staffQuizResults(quiz) });
    const cert = params.get("cert");
    if (cert) {
      const c = (await certificateLines(cert)).find((x) => x.th === String(params.get("th") ?? "").toUpperCase());
      if (!c) return Response.json({ error: "No certificate for that person" }, { status: 404 });
      return new Response(Buffer.from(await certificatePdf(c)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${certFileName(c.name).replace(/"/g, "")}"`, "Cache-Control": "private, no-store" } });
    }
    const pi = params.get("pi");
    if (pi) {
      const t = await trainingDoc(pi);
      const q = await quoteOf(pi);
      if (!t?.confirmed || !q) return Response.json({ error: "This training has no Performa yet" }, { status: 404 });
      const draft = await readPerforma(t.confirmed.salesorderId, await trainingSet()).catch((e) => { if (goneInZoho(e)) return null; throw e; });
      if (!draft) return performaGone(pi, t.confirmed.salesorderId);
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

async function handlePOST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!canQuote(me)) return Response.json({ error: "Only those who send quotations use Training Management" }, { status: 403 });
  const b = (await request.json().catch(() => null)) as { action?: string; id?: unknown; name?: unknown; email?: unknown; phone?: unknown; edit?: unknown; send?: unknown; trainers?: unknown; to?: unknown; cc?: unknown; subject?: unknown; text?: unknown } | null;
  const id = String(b?.id ?? "").slice(0, 30);
  if (!/^\d+$/.test(id)) return Response.json({ error: "Unknown training" }, { status: 400 });
  try {
    const q = await quoteOf(id);
    if (!q) return Response.json({ error: "That training quote isn't in our copy of Zoho yet. Refresh in a minute." }, { status: 404 });

    if (b?.action === "sendcerts") {
      if (process.env.VERCEL_ENV !== "production") return Response.json({ error: "Only the live site sends certificates." }, { status: 409 });
      if (!(await staffCertificatesAllowed(id))) return Response.json({ error: "Certificates go once the training's last day has come and it isn't running." }, { status: 409 });
      const r = await sendCertificates(id, me.name);
      console.log(`[training-management] ${me.name} sent ${q.number}'s certificates: ${r.sent} sent, ${r.noEmail} without email, ${r.failed.length} failed`);
      return Response.json({ ok: true, ...r });
    }

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
      // Zoho converts only an Accepted quote: marked when the coordinator accepted; again here in case that didn't go through.
      if (q.status !== "accepted") await setQuoteStatus(id, "accepted").catch((e) => console.error("[training-management] couldn't mark the quote Accepted:", e));
      const draft = await convertToPerforma(id, t.proposal, await trainingSet(), indiaToday(), await salespersonFor(me));
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
      const m = readPiEmailFields(b);
      if ("error" in m) return Response.json({ error: m.error }, { status: 400 });
      await emailPerforma(t.confirmed.salesorderId, { to: m.to, cc: m.cc, subject: m.subject, body: textToHtml(m.text) });
      await markPerformaEmailed(id);
      console.log(`[training-management] ${me.name} emailed ${t.confirmed.number}`);
      return Response.json({ ok: true });
    }

    // Mark confirmed (owner, 13 Nov): unsaved edits saved first, the Draft marked Confirmed in Zoho, the portal stamps
    // Confirmed, the training goes on the Training board; with `send`, the Performa is then emailed.
    if (b?.action === "piconfirm") {
      const t = await trainingDoc(id);
      if (!t?.confirmed) return Response.json({ error: "This training has no Performa yet" }, { status: 404 });
      const send = b.send === true;
      const m = send ? readPiEmailFields(b) : null;
      if (send && process.env.VERCEL_ENV !== "production") return Response.json({ error: "Only the live site sends email. Use Mark confirmed." }, { status: 409 });
      if (m && "error" in m) return Response.json({ error: m.error }, { status: 400 });
      const trainers = readTrainers(b.trainers);
      if ("error" in trainers) return Response.json({ error: trainers.error }, { status: 400 });
      const items = await trainingSet();
      // Zoho changes only a draft: the edits and the Trainer Name go in first, then it's marked Confirmed.
      const now = await readPerforma(t.confirmed.salesorderId, items);
      if (now.status === "draft") {
        const base = b.edit && typeof b.edit === "object" ? (b.edit as { fields?: Record<string, unknown> }) : editOf(now);
        const r = await savePerforma(t.confirmed.salesorderId, { ...base, fields: { ...(base.fields ?? {}), trainer: zohoTrainer(trainers) } }, items);
        if ("error" in r) return Response.json({ error: r.error }, { status: 400 });
      }
      const draft = await confirmPerformaInZoho(t.confirmed.salesorderId, items);
      await markZohoConfirmed(id, me.name);
      console.log(`[training-management] ${me.name} marked ${t.confirmed.number} Confirmed`);
      let board = t.confirmed.board;
      if (board?.state !== "scheduled" && board?.state !== "skipped" && t.proposal) {
        board = await scheduleOnBoard({
          estimateId: id, salesorderId: t.confirmed.salesorderId, quoteNumber: q.number, piNumber: t.confirmed.number,
          customerId: q.customerId, proposal: t.proposal, coordinator: t.coordinator, by: me.name, trainers,
        });
        // A date with trainers can start reminder emails (to the trainers only): checked now, not at the next hourly run.
        if (board.state === "scheduled") after(() => import("@/lib/trainingReminders").then((r) => r.runTrainingReminders()).then(() => undefined, (e) => console.error(`[reminders] failed: ${e instanceof Error ? e.message : e}`)));
        await markBoard(id, board);
        forgetBoardDates(); // the portal's dates follow the board from now on
        console.log(`[training-management] ${q.number} on the Training board: ${board.state} — ${board.note}`);
      }
      let emailError = "";
      if (m && !("error" in m)) {
        try {
          await emailPerforma(t.confirmed.salesorderId, { to: m.to, cc: m.cc, subject: m.subject, body: textToHtml(m.text) });
          await markPerformaEmailed(id);
          console.log(`[training-management] ${me.name} emailed ${t.confirmed.number}`);
        } catch (e) {
          emailError = `Confirmed, but the email didn't go: ${e instanceof Error ? e.message : e}`;
        }
      }
      return Response.json({ ok: true, draft, board: board ?? null, emailed: send && !emailError, emailError });
    }

    if (b?.action === "sendlogin") {
      const t = await trainingDoc(id);
      if (!t?.coordinator?.email) return Response.json({ error: "Add the training coordinator first" }, { status: 400 });
      // Like the other emails: only the live site sends them, so a local copy can't email a client by accident.
      if (process.env.VERCEL_ENV !== "production") return Response.json({ error: "Only the live site sends email" }, { status: 409 });
      const email = t.coordinator.email.toLowerCase();
      const { password, undo } = await passwordForEmail(email, t.coordinator.name);
      const m = loginEmail(await portalTemplates(), { name: t.coordinator.name, training: q.lines.map((l) => l.name).join(" + ") || "your training", number: q.number }, { link: trainingLink(portalBase(), q.number), email, password, ...(t.confirmed || t.rejected ? {} : { declineLink: declineLink(portalBase(), q.number, await declineKeyFor(id)) }) });
      try { await sendMail(FROM, { to: email, subject: m.subject, html: m.html }); } catch (e) { await undo().catch(() => undefined); throw e; }
      await markLoginSent(id);
      console.log(`[training-management] ${me.name} sent the Training Manager login for ${q.number}`);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    // A Performa button on one that was deleted in Zoho: revert instead of an error.
    if (goneInZoho(e) && ["pisave", "piemail", "piconfirm"].includes(String(b?.action))) {
      const t = await trainingDoc(id).catch(() => null);
      if (t?.confirmed) return performaGone(id, t.confirmed.salesorderId);
    }
    console.error("[training-management]", e);
    return Response.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 502 });
  }
}

// Live refresh (owner, 13 Nov): a change here shows in every open tab within seconds.
export const POST = withBump(["work"], handlePOST);
