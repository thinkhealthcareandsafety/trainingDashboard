import { db, mongoConfigured } from "@/lib/db";
import { signedInMember, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

/*
 * The calendar reminders each member has seen today (owner, 19 Oct: "each user only sees them once a day") — kept on
 * the server so a second device doesn't show them again. One small doc per member per day, gone after 3 days.
 */

type Seen = { _id: string; member: string; day: string; ids: string[]; at: Date };
const istDay = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const G = globalThis as unknown as { __thSeenIndex?: Promise<unknown> };
async function seenCol() {
  const c = (await db()).collection<Seen>("reminderSeen");
  G.__thSeenIndex ??= c.createIndex({ at: 1 }, { expireAfterSeconds: 3 * 86_400 }).catch(() => (G.__thSeenIndex = undefined));
  return c;
}

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const day = istDay();
  if (!mongoConfigured()) return Response.json({ day, ids: [] });
  try {
    const doc = await (await seenCol()).findOne({ _id: `${me.id}:${day}` });
    return Response.json({ day, ids: doc?.ids ?? [] });
  } catch (e) {
    return Response.json({ day, ids: [], error: e instanceof Error ? e.message : "Database error" }, { status: 502 });
  }
}

// POST { ids }: these reminders were shown to the signed-in member today.
export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const { ids } = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && x.length < 200).slice(0, 100) : [];
  if (!list.length || !mongoConfigured()) return Response.json({ ok: true });
  const day = istDay();
  try {
    await (await seenCol()).updateOne(
      { _id: `${me.id}:${day}` },
      { $addToSet: { ids: { $each: list } }, $set: { member: me.name, day, at: new Date() } },
      { upsert: true },
    );
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Database error" }, { status: 502 });
  }
}
