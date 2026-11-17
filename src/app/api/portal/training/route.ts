import { portalToken, portalUser } from "@/lib/portalAuth";
import { withBump } from "@/lib/changes";
import { addPeople, closeTraining, endTraining, selfAnswer, selfRegister, newAttendKey, newJoinKey, participants, propose, quizResults, quotePdfFor, reject, removePerson, startTraining, tick } from "@/lib/portalTrainings";
import { estimatePdf } from "@/lib/zoho";
import { coordinatorCertificates } from "@/lib/portalTrainings";
import { certificatePdf } from "@/lib/portalCertSend";
import { certFileName } from "@/lib/portalCertRules";
import { uniqueNames, zip } from "@/lib/zip";
import { setQuoteStatus } from "@/lib/quotations";
import { certificatesLater } from "@/lib/portalCertLater";

export const dynamic = "force-dynamic";

/*
 * What a signed-in coordinator does on one of their trainings (docs/TRAINING_MANAGER_PLAN.md steps 5–7). POST { id, action }:
 *  "propose"  { dates: [{ date, time }], tentative, location, headcount } — accepts the quotation (stamped Accepted); location = "course conducted at"
 *  "reject"   { reason? } — declines the quotation (stamped Rejected; Zoho marks it Declined)
 *  "people"   — the attendee list
 *  "add"      { people: [{ name, phone, email? }], source: "typed" | "excel" }
 *  "remove"   { th }
 *  "newlink"  — a new QR / join link; the old one stops working
 *  "tick"     { th, day, on } — mark someone present (on: true) or not, on a training day that has come (owner, 13 Nov)
 *  "newattend" — a new attendance QR; the old one stops working
 *  "start" / "end" — Start training / End training today (owner, 13 Nov): attendance and the quiz run only in between;
 *            (certificates go as each person passes, owner 16 Nov; End sends any that didn't go)
 *  "results" — the quiz's live leaderboard and per-question analytics
 *  "self" { person: { name, phone, email? } } / "selfskip" / "teamdone" — the once-only asks after Mark confirmed (owner, 16 Nov)
 * Only on their own trainings. GET ?pdf=<id>: the quotation's PDF (below).
 */
/**
 * GET ?pdf=<id>: the quotation as Zoho's own PDF (owner, 16 Nov: see it before accepting), for its coordinator only.
 * GET ?cert=<id>&th=<TH001>: one person's official certificate; GET ?certs=<id>: all of them as a ZIP (owner, 16 Nov:
 * only once the training is fully paid; each download is marked).
 */
export async function GET(request: Request) {
  try {
    const me = await portalUser(portalToken(request));
    if (!me) return Response.json({ error: "Please sign in again" }, { status: 401 });
    const s = new URL(request.url).searchParams;
    const certFor = s.get("cert") ?? s.get("certs");
    if (certFor) {
      const lines = await coordinatorCertificates(me.email, certFor, s.get("cert") ? s.get("th") ?? "" : undefined);
      if ("error" in lines) return Response.json({ error: lines.error }, { status: lines.status });
      if (s.get("cert")) {
        const c = lines[0];
        return new Response(Buffer.from(await certificatePdf(c)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${certFileName(c.name).replace(/"/g, "")}"`, "Cache-Control": "private, no-store" } });
      }
      const names = uniqueNames(lines.map((c) => certFileName(c.name)));
      const files = [];
      for (const [i, c] of lines.entries()) files.push({ name: names[i], data: await certificatePdf(c) });
      const label = (lines[0]?.number ?? "Training").replace(/[^A-Za-z0-9_-]/g, "");
      return new Response(Buffer.from(zip(files)), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="Certificates ${label}.zip"`, "Cache-Control": "private, no-store" } });
    }
    const q = await quotePdfFor(me.email, new URL(request.url).searchParams.get("pdf"));
    if (!q) return Response.json({ error: "That training isn't on your list" }, { status: 404 });
    const name = q.number.replace(/[^A-Za-z0-9_-]/g, "") || "Quotation";
    return new Response(await estimatePdf(q.estimateId), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[portal/training] quote pdf", e);
    return Response.json({ error: "Couldn't get the PDF from our system just now. Try again in a minute." }, { status: 502 });
  }
}

async function handlePOST(request: Request) {
  try {
    const me = await portalUser(portalToken(request));
    if (!me) return Response.json({ error: "Please sign in again" }, { status: 401 });
    const b = (await request.json().catch(() => null)) as { id?: unknown; action?: string; people?: unknown; source?: unknown; th?: unknown; reason?: unknown; day?: unknown; on?: unknown } | null;
    const r = b?.action === "propose" ? await propose(me.email, b.id, b, (id) => setQuoteStatus(id, "accepted"))
      : b?.action === "reject" ? await reject(me.email, b.id, b.reason, (id) => setQuoteStatus(id, "declined"))
      : b?.action === "people" ? await participants(me.email, b.id)
      : b?.action === "add" ? await addPeople(me.email, b.id, b.people, b.source)
      : b?.action === "remove" ? await removePerson(me.email, b.id, b.th)
      : b?.action === "newlink" ? await newJoinKey(me.email, b.id)
      : b?.action === "tick" ? await tick(me.email, b.id, b.th, b.day, b.on)
      : b?.action === "newattend" ? await newAttendKey(me.email, b.id)
      : b?.action === "start" ? await startTraining(me.email, b.id)
      : b?.action === "end" ? await endTraining(me.email, b.id).then((x) => { if (!("error" in x) && x.certificates) certificatesLater(x.trainingId, me.email); return x; })
      : b?.action === "results" ? await quizResults(me.email, b.id).then((x) => { if ("state" in x && x.state === "revealed" && x.certificates.list.some((c) => c.email && !c.emailedAt)) certificatesLater(String(b.id), me.email); return x; })
      : b?.action === "self" ? await selfRegister(me.email, b.id, (b as { person?: unknown }).person)
      : b?.action === "close" ? await closeTraining(me.email, b.id)
      : b?.action === "selfskip" ? await selfAnswer(me.email, b.id, "skip")
      : b?.action === "teamdone" ? await selfAnswer(me.email, b.id, "team")
      : { error: "Unknown action", status: 400 };
    return "error" in r ? Response.json({ error: r.error }, { status: r.status }) : Response.json(r);
  } catch (e) {
    console.error("[portal/training]", e);
    return Response.json({ error: "Something went wrong on our side. Try again in a minute." }, { status: 500 });
  }
}

// Live refresh (owner, 13 Nov): a change here shows in every open tab within seconds.
export const POST = withBump(["work"], handlePOST);
