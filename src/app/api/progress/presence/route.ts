import { signedInMember, unauthorized } from "@/lib/auth";
import { LIMITS, type Notice, type PtRequest, isSevere } from "@/lib/progress/model";
import { fromDoc, needsReplyIds, noticesCol, presenceCol, requestsCol, touch } from "@/lib/progress/server";

export const dynamic = "force-dynamic";

/*
 * The member's own presence (plan §4). Every page sends { beat: true } every 30 s while its tab is visible — that's
 * "last seen" (one timestamp, no history) — and gets back what the sidebar badge and the pop-ups need: requests open on
 * them, and their unread notices [S15, S17]. { away: {until?} | null } and { focus: text | null } are set by the member.
 */

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { beat?: boolean; away?: { until?: string } | null; focus?: string | null };
  const now = new Date();
  if (body.beat) await touch(me, now);
  const c = await presenceCol();
  if (body.away !== undefined) {
    const until = body.away?.until && !Number.isNaN(Date.parse(body.away.until)) && Date.parse(body.away.until) > now.getTime() ? new Date(body.away.until).toISOString() : undefined;
    await c.updateOne({ _id: me.id }, body.away ? { $set: { name: me.name, away: { at: now.toISOString(), ...(until ? { until } : {}) } } } : { $set: { name: me.name, lastSeenAt: now.toISOString() }, $unset: { away: "" } }, { upsert: true });
  }
  if (body.focus !== undefined) {
    const text = typeof body.focus === "string" ? body.focus.trim().replace(/\s+/g, " ").slice(0, LIMITS.focusText) : "";
    await c.updateOne({ _id: me.id }, text ? { $set: { name: me.name, focus: { text, at: now.toISOString() } } } : { $set: { name: me.name }, $unset: { focus: "" } }, { upsert: true });
  }
  const open = (await (await requestsCol()).find({ waitingOnId: me.id, status: "open" }).toArray()).map((r) => fromDoc<PtRequest>(r));
  const notices = await (await noticesCol()).find({ to: me.id, readAt: { $exists: false } }, { projection: { expiresAt: 0 } }).sort({ at: 1 }).limit(20).toArray();
  return Response.json({
    incoming: open.length,
    severe: open.some((r) => isSevere(r, now)),
    // Tagged and not answered: the red count on Progress tracker until they reply or resolve (owner, 26 Oct).
    needs: (await needsReplyIds(me)).length,
    notices: notices.map((n) => fromDoc<Notice>(n)),
  });
}

/** Notices read (shown, closed or clicked): PATCH { ids }. Only your own. */
export async function PATCH(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { ids?: string[] };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string").slice(0, 50) : [];
  if (ids.length) await (await noticesCol()).updateMany({ _id: { $in: ids }, to: me.id }, { $set: { readAt: new Date().toISOString() } });
  return Response.json({ ok: true });
}
