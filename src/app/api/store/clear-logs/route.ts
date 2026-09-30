import { db, mongoConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST { pin, by }: wipes the Follow-ups change log (every card event) for the whole team.
// The PIN lives in CLEAR_LOGS_PIN on the server; cleared events are copied to cardEventsArchive first.
// Cards added by hand to Potential training (add_potential) are kept — they aren't in Zoho to come back from.
export async function POST(request: Request) {
  if (!mongoConfigured()) return Response.json({ error: "Shared storage isn't configured" }, { status: 400 });
  const expected = process.env.CLEAR_LOGS_PIN;
  if (!expected) return Response.json({ error: "Clearing logs is disabled (no PIN set on the server)" }, { status: 403 });
  const { pin, by } = (await request.json().catch(() => ({}))) as { pin?: unknown; by?: unknown };
  if (String(pin ?? "") !== expected) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return Response.json({ error: "Wrong PIN" }, { status: 403 });
  }
  try {
    const d = await db();
    const events = await d.collection("cardEvents").find({ kind: { $ne: "add_potential" } }).toArray();
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
