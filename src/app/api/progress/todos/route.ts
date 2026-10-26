import { signedInMember, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSnapshot } from "@/lib/zohoSync";
import { boardsNow } from "@/lib/fulfilServer";
import { buildFulfillmentBoard } from "@/lib/pipeline";
import { buildLogisticsBoard } from "@/lib/logistics";
import { seesWholeCalendar } from "@/lib/roles";
import { type PtRequest, teamDay } from "@/lib/progress/model";
import { fromDoc, requestsCol, team } from "@/lib/progress/server";
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
    (await db()).collection<CalendarEntry & { _id: string }>("entries").find({ date: { $gte: today } }).toArray(),
    (await requestsCol()).find({ $or: [{ status: "open" }, { updatedAt: { $gte: new Date(now.getTime() - DONE_DAYS * 86_400_000).toISOString() } }] }).toArray(),
  ]);
  const ful = buildFulfillmentBoard(board, events);
  const logi = buildLogisticsBoard(board, ful, aedBoard!, events);
  const reqs = requests.map((r) => fromDoc<PtRequest>(r));
  const todos = buildTodos(today, members, { board, aedBoard: aedBoard!, ful, logi }, entries.map((e) => ({ ...e, id: e.id ?? e._id })), reqs, now);
  // Card names for the work-done list, from every board (a Fulfillment / Logistics card has its own id).
  const names = new Map<string, string>();
  for (const cards of [board.cards, aedBoard!.cards, ful.cards, logi.cards]) for (const c of cards.values()) if (!names.has(c.id)) names.set(c.id, c.certLocation || c.name);
  const done = buildDone(members, events, (id) => names.get(id), reqs, now);
  const all = seesWholeCalendar(me);
  const people = all ? members : members.filter((m) => m.id === me.id);
  const theirs = (who: string) => people.some((p) => p.id === who);
  return Response.json({ today, all, people, todos: todos.filter((t) => theirs(t.who)), done: done.filter((d) => theirs(d.who)) });
}
