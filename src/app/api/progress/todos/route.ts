import { signedInMember, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSnapshot } from "@/lib/zohoSync";
import { boardsNow } from "@/lib/fulfilServer";
import { buildFulfillmentBoard } from "@/lib/pipeline";
import { buildLogisticsBoard } from "@/lib/logistics";
import { ENTRY_DONE_FROM, seesWholeCalendar } from "@/lib/roles";
import { type Comment, type PtRequest, isAdminId, teamDay } from "@/lib/progress/model";
import { commentsCol, fromDoc, requestsCol, team } from "@/lib/progress/server";
import { DONE_DAYS, buildDone, buildTodos } from "@/lib/progress/todos";
import type { CalendarEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

/*
 * Everyone's to-do (Progress tracker): each person's list, read from the boards as they stand right now (the Zoho copy
 * + the change log, the way the boards build them), their meetings / events and the requests waiting on them — and
 * their work done in the last 7 days, from the change log (`buildDone`).
 * Read-only. Admin, Shikha, Sumit and Ashish see everyone's; the others see their own (owner, 26 Oct: as the calendar).
 */

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const snap = await getSnapshot();
  if (!snap) return Response.json({ error: "The Zoho copy isn't ready yet — try again in a minute" }, { status: 503 });
  const now = new Date();
  const today = teamDay(now);
  const [members, { board, aedBoard, events }, entries, requests] = await Promise.all([
    team(),
    boardsNow(snap, true),
    // From the day meetings / events started being marked done (overdue ones are Shikha's), plus recent "done" ones.
    (await db()).collection<CalendarEntry & { _id: string }>("entries").find({ $or: [{ date: { $gte: ENTRY_DONE_FROM < today ? ENTRY_DONE_FROM : today } }, { doneAt: { $exists: true } }] }).toArray(),
    (await requestsCol()).find({ $or: [{ status: "open" }, { updatedAt: { $gte: new Date(now.getTime() - DONE_DAYS * 86_400_000).toISOString() } }] }).toArray(),
  ]);
  const ful = buildFulfillmentBoard(board, events);
  const logi = buildLogisticsBoard(board, ful, aedBoard!, events);
  const reqs = requests.map((r) => fromDoc<PtRequest>(r));
  // Who replied / was tagged in each request's thread (not the words) — for "Reply needed" / "Mentioned you".
  const comments = (await (await commentsCol()).find({ parent: { $in: reqs.map((r) => `request:${r.id}`) } }, { projection: { text: 0 } }).toArray()).map((c) => fromDoc<Comment>(c));
  const cal = entries.map((e) => ({ ...e, id: e.id ?? e._id }));
  const todos = buildTodos(today, members, { board, aedBoard: aedBoard!, ful, logi }, cal, reqs, comments, now);
  // Card names for the work-done list, from every board (a Fulfillment / Logistics card has its own id).
  const names = new Map<string, string>();
  for (const cards of [board.cards, aedBoard!.cards, ful.cards, logi.cards]) for (const c of cards.values()) if (!names.has(c.id)) names.set(c.id, c.certLocation || c.name);
  const done = buildDone(members, events, (id) => names.get(id), reqs, now, cal);
  const all = seesWholeCalendar(me);
  // No to-do list for Admin (owner, 3 Nov: "remove the tracker for admin") — Admin still sees everyone's.
  const people = (all ? members : members.filter((m) => m.id === me.id)).filter((m) => !isAdminId(m.id));
  const theirs = (who: string) => people.some((p) => p.id === who);
  return Response.json({ today, all, people, todos: todos.filter((t) => theirs(t.who)), done: done.filter((d) => theirs(d.who)) });
}
