import { portalToken, portalUser } from "@/lib/portalAuth";
import { addPeople, newJoinKey, participants, propose, removePerson } from "@/lib/portalTrainings";

export const dynamic = "force-dynamic";

/*
 * What a signed-in coordinator does on one of their trainings (docs/TRAINING_MANAGER_PLAN.md steps 5–7). POST { id, action }:
 *  "propose"  { dates: [{ date, time }], tentative, location, headcount } — sends it to Think Health (stamped Proposed)
 *  "people"   — the attendee list
 *  "add"      { people: [{ name, phone, email? }], source: "typed" | "excel" }
 *  "remove"   { th }
 *  "newlink"  — a new QR / join link; the old one stops working
 * Only on their own trainings.
 */
export async function POST(request: Request) {
  try {
    const me = await portalUser(portalToken(request));
    if (!me) return Response.json({ error: "Please sign in again" }, { status: 401 });
    const b = (await request.json().catch(() => null)) as { id?: unknown; action?: string; people?: unknown; source?: unknown; th?: unknown } | null;
    const r = b?.action === "propose" ? await propose(me.email, b.id, b)
      : b?.action === "people" ? await participants(me.email, b.id)
      : b?.action === "add" ? await addPeople(me.email, b.id, b.people, b.source)
      : b?.action === "remove" ? await removePerson(me.email, b.id, b.th)
      : b?.action === "newlink" ? await newJoinKey(me.email, b.id)
      : { error: "Unknown action", status: 400 };
    return "error" in r ? Response.json({ error: r.error }, { status: r.status }) : Response.json(r);
  } catch (e) {
    console.error("[portal/training]", e);
    return Response.json({ error: "Something went wrong on our side. Try again in a minute." }, { status: 500 });
  }
}
