import { signedInMember, unauthorized } from "@/lib/auth";
import { type Action, CATEGORIES, type Category, LIMITS, type LogLine, type Priority, type PtRequest, canDo, fmtSpan, waitingMs } from "@/lib/progress/model";
import { fromDoc, newId, nextRef, notify, requestsCol, team, touch } from "@/lib/progress/server";

export const dynamic = "force-dynamic";

/*
 * Requests ("Unblock me", PROGRESS-TRACKER-PLAN.md §3). The server stamps who did it (never the browser) and keeps to
 * the plan's permission table (§3.5, `canDo`). POST = a new request; PATCH {id, action, …} = seen / ping / resolve /
 * withdraw / reopen / priority. Every change is a log line on the request; the other person gets a notice [S15–S17].
 */

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").slice(0, n) : "");
const CARD_ID = /^(lead|quote|pi|invoice|payment|potential|aed|aedcustomer|fulfil|logi|logipay)(:[\w.-]+)+$/;

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { category?: Category; priority?: Priority; waitingOnId?: string; title?: string; note?: string; cardId?: string; search?: string };
  const category = body.category && body.category in CATEGORIES ? body.category : null;
  if (!category) return Response.json({ error: "Pick what kind of request it is" }, { status: 400 });
  const priority: Priority = body.priority === "urgent" ? "urgent" : "normal";
  const title = clip(body.title, LIMITS.title);
  if (!title) return Response.json({ error: "Say what it's about" }, { status: 400 });
  const them = (await team()).find((m) => m.id === body.waitingOnId);
  if (!them) return Response.json({ error: "Pick who you're waiting on" }, { status: 400 });
  if (them.id === me.id) return Response.json({ error: "That's you — pick someone else" }, { status: 400 });
  const cardId = typeof body.cardId === "string" && body.cardId.length <= 80 && CARD_ID.test(body.cardId) ? body.cardId : undefined;
  const now = new Date().toISOString();
  const r: PtRequest = {
    id: newId(),
    ref: await nextRef(),
    category,
    priority,
    requesterId: me.id,
    requesterName: me.name,
    waitingOnId: them.id,
    waitingOnName: them.name,
    task: cardId ? { kind: "board", title, cardId, search: clip(body.search, 120) || undefined } : { kind: "free", title },
    note: clip(body.note, LIMITS.note) || undefined,
    status: "open",
    createdAt: now,
    pings: [],
    log: [{ at: now, by: me.name, action: "created", detail: `${CATEGORIES[category].label}${priority === "urgent" ? " · Urgent" : ""}` }],
    updatedAt: now,
  };
  const { id, ...doc } = r;
  await (await requestsCol()).insertOne({ _id: id, ...doc });
  await notify([{ to: them.id, kind: "request", requestId: id, at: now, urgent: priority === "urgent" || category === "critical", text: `${me.name} is waiting on you — ${CATEGORIES[category].label}${priority === "urgent" ? " · Urgent" : ""}: ${title} (${r.ref})` }]);
  await touch(me);
  return Response.json({ ok: true, request: r });
}

export async function PATCH(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { id?: string; action?: Action; note?: string; priority?: Priority };
  const c = await requestsCol();
  const doc = body.id ? await c.findOne({ _id: body.id }) : null;
  if (!doc) return Response.json({ error: "That request no longer exists" }, { status: 404 });
  const r = fromDoc<PtRequest>(doc);
  const action = body.action;
  const nowD = new Date();
  if (!action || !canDo(me, r, action, nowD)) {
    const why = action === "ping" && r.status === "open" && r.requesterId === me.id ? "You can ping again a little later" : "You can't do that on this request (any more)";
    return Response.json({ error: why }, { status: 403 });
  }
  const now = nowD.toISOString();
  const line = (a: LogLine["action"], detail?: string): LogLine => ({ at: now, by: me.name, action: a, ...(detail ? { detail } : {}) });
  const note = clip(body.note, LIMITS.note);
  const cat = CATEGORIES[r.category];
  const waited = fmtSpan(waitingMs(r, nowD));
  let set: Record<string, unknown> = { updatedAt: now };
  let unset: Record<string, ""> | undefined;
  let push: LogLine = line("seen");
  const notices: Parameters<typeof notify>[0] = [];
  switch (action) {
    case "seen":
      set = { seenAt: now }; // not a change anyone needs to hear about — no updatedAt / notice
      break;
    case "ping":
      push = line("pinged");
      set.pings = [...r.pings, { at: now, by: me.name }];
      notices.push({ to: r.waitingOnId, kind: "ping", requestId: r.id, at: now, urgent: r.priority === "urgent" || r.category === "critical", text: `Gentle reminder from ${me.name}: ${r.task.title} (${r.ref}) · waiting ${waited}` });
      break;
    case "resolve":
      push = line("resolved", note || undefined);
      Object.assign(set, { status: "resolved", resolvedAt: now, resolvedBy: me.name, ...(note ? { resolution: note } : {}) });
      if (!note) unset = { resolution: "" };
      // The requester is told to resume [S17]; if they closed it themselves, the person they waited on hears it instead.
      if (me.id !== r.requesterId) notices.push({ to: r.requesterId, kind: "resolved", requestId: r.id, at: now, text: `${me.name} ${me.id === r.waitingOnId ? cat.resumeText : "resolved it"} — you can resume: ${r.task.title} (${r.ref})${note ? ` · "${note.slice(0, 120)}"` : ""}` });
      if (me.id !== r.waitingOnId) notices.push({ to: r.waitingOnId, kind: "resolved", requestId: r.id, at: now, text: `${me.name} closed ${r.ref} — no longer waiting on you: ${r.task.title}` });
      break;
    case "withdraw":
      push = line("withdrawn", note || undefined);
      Object.assign(set, { status: "withdrawn", withdrawnAt: now, withdrawnBy: me.name });
      break; // quiet: their badge just goes down [A29]
    case "reopen":
      push = line("reopened", note || undefined);
      Object.assign(set, { status: "open", reopenedAt: now });
      unset = { resolvedAt: "", resolvedBy: "", resolution: "" };
      notices.push({ to: r.waitingOnId, kind: "reopened", requestId: r.id, at: now, urgent: r.priority === "urgent" || r.category === "critical", text: `${me.name} reopened ${r.ref} — still waiting on you: ${r.task.title}` });
      break;
    case "priority": {
      const p: Priority = body.priority === "urgent" ? "urgent" : "normal";
      if (p === r.priority) return Response.json({ ok: true });
      push = line("priority", p === "urgent" ? "Urgent" : "Normal");
      set.priority = p;
      break;
    }
  }
  // Only if nobody changed its status in the meantime (two people resolving at once).
  const res = await c.updateOne({ _id: r.id, status: r.status }, { $set: set, ...(unset ? { $unset: unset } : {}), $push: { log: push } });
  if (!res.matchedCount) return Response.json({ error: "Someone changed this request a moment ago — have a look again" }, { status: 409 });
  await notify(notices);
  await touch(me);
  return Response.json({ ok: true });
}
