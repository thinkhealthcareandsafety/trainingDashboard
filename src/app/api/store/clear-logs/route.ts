import { db, mongoConfigured } from "@/lib/db";
import { memberIdOf } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST { pin, by, cardIds? }: wipes the Follow-ups change log for the whole team — everything, or only the events
// touching cardIds (one customer, or one deal cycle). Admin only: the button shows for Admin, and the PIN is checked here.
// The PIN lives in CLEAR_LOGS_PIN (or, if unset, ADMIN_PIN) on the server; cleared events are copied to cardEventsArchive first.
// Cards added by hand to Potential training (add_potential) are kept — they aren't in Zoho to come back from.
export async function POST(request: Request) {
  // Admin only: signed in as Admin, and the PIN again.
  if (memberIdOf(request) !== "admin") return Response.json({ error: "Only Admin can clear logs" }, { status: 403 });
  if (!mongoConfigured()) return Response.json({ error: "Shared storage isn't configured" }, { status: 400 });
  const expected = process.env.CLEAR_LOGS_PIN || process.env.ADMIN_PIN;
  if (!expected) return Response.json({ error: "Clearing logs is disabled (no PIN set on the server)" }, { status: 403 });
  const { pin, by, cardIds } = (await request.json().catch(() => ({}))) as { pin?: unknown; by?: unknown; cardIds?: unknown };
  const scope = Array.isArray(cardIds) ? cardIds.filter((x): x is string => typeof x === "string") : null;
  if (scope && !scope.length) return Response.json({ error: "Nothing selected to clear" }, { status: 400 });
  if (String(pin ?? "") !== expected) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return Response.json({ error: "Wrong PIN" }, { status: 403 });
  }
  try {
    const d = await db();
    const events = await d.collection("cardEvents").find({ kind: { $ne: "add_potential" }, ...(scope ? { cardIds: { $in: scope } } : {}) }).toArray();
    if (events.length) {
      const clearedAt = new Date().toISOString();
      const clearedBy = typeof by === "string" ? by : "";
      await d.collection("cardEventsArchive").insertMany(events.map(({ _id, ...e }) => ({ ...e, eventId: _id, clearedAt, clearedBy })));
      await d.collection("cardEvents").deleteMany({ _id: { $in: events.map((e) => e._id) } });
    }
    return Response.json({ ok: true, cleared: events.length });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Database error" }, { status: 502 });
  }
}
