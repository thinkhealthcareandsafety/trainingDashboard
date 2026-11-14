import { portalToken, portalUser } from "@/lib/portalAuth";
import { withBump } from "@/lib/changes";
import { addPeople, endTraining, newAttendKey, newJoinKey, participants, propose, quizResults, reject, removePerson, startTraining, tick } from "@/lib/portalTrainings";
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
 *            End on the last day emails the passed people's certificates (owner, 14 Nov)
 *  "results" — the quiz's live leaderboard and per-question analytics
 * Only on their own trainings.
 */
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
      : b?.action === "results" ? await quizResults(me.email, b.id)
      : { error: "Unknown action", status: 400 };
    return "error" in r ? Response.json({ error: r.error }, { status: r.status }) : Response.json(r);
  } catch (e) {
    console.error("[portal/training]", e);
    return Response.json({ error: "Something went wrong on our side. Try again in a minute." }, { status: 500 });
  }
}

// Live refresh (owner, 13 Nov): a change here shows in every open tab within seconds.
export const POST = withBump(["work"], handlePOST);
