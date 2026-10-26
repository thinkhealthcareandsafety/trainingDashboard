import { signedInMember, unauthorized } from "@/lib/auth";
import { type Comment, LIMITS, isAdminId, mentionsIn } from "@/lib/progress/model";
import { commentsCol, fromDoc, newId, notify, requestsCol, team, touch } from "@/lib/progress/server";

export const dynamic = "force-dynamic";

/*
 * Threads under every request [S25] — `parent` = "request:<id>".
 * GET ?parent= · POST { parent, text } (tells the people in it) · DELETE ?id= (author or Admin; shows as "removed").
 */

async function people(parent: string): Promise<{ ids: string[]; label: string; requestId: string } | null> {
  const [kind, ...rest] = parent.split(":");
  const id = rest.join(":");
  if (kind !== "request") return null;
  const r = await (await requestsCol()).findOne({ _id: id });
  return r ? { ids: [r.requesterId, r.waitingOnId], label: `${r.ref} · ${r.task.title}`, requestId: id } : null;
}

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const parent = new URL(request.url).searchParams.get("parent") ?? "";
  const list = await (await commentsCol()).find({ parent }).sort({ at: 1 }).limit(300).toArray();
  return Response.json({ comments: list.map((c) => fromDoc<Comment>(c)).map((c) => (c.deletedAt ? { ...c, text: "" } : c)) });
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { parent?: string; text?: string };
  const text = typeof body.text === "string" ? body.text.trim().slice(0, LIMITS.comment) : "";
  if (!text) return Response.json({ error: "Write something first" }, { status: 400 });
  const parent = typeof body.parent === "string" ? body.parent : "";
  const who = await people(parent);
  if (!who) return Response.json({ error: "That thread no longer exists" }, { status: 404 });
  const c = await commentsCol();
  const now = new Date().toISOString();
  const id = newId();
  // @Name tags a teammate: they get a red count on Progress tracker until they reply here or resolve it (needsReply).
  const mentions = mentionsIn(text, await team(), me.id);
  await c.insertOne({ _id: id, parent, by: me.name, byId: me.id, text, at: now, ...(mentions.length ? { mentions } : {}) });
  // Everyone in the thread hears about it: the request's two people and earlier repliers; the tagged get "mentioned you".
  const earlier = await c.distinct("byId", { parent });
  const to = [...new Set([...who.ids, ...earlier])].filter((x) => x !== me.id && !mentions.includes(x));
  const quote = `"${text.slice(0, 100)}${text.length > 100 ? "…" : ""}"`;
  await notify([
    ...mentions.map((t) => ({ to: t, kind: "mention" as const, requestId: who.requestId, at: now, text: `${me.name} mentioned you on ${who.label}: ${quote}` })),
    ...to.map((t) => ({ to: t, kind: "comment" as const, requestId: who.requestId, at: now, text: `${me.name} replied on ${who.label}: ${quote}` })),
  ]);
  await touch(me);
  return Response.json({ ok: true, comment: { id, parent, by: me.name, byId: me.id, text, at: now, ...(mentions.length ? { mentions } : {}) } satisfies Comment });
}

export async function DELETE(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const c = await commentsCol();
  const had = await c.findOne({ _id: id });
  if (!had) return Response.json({ ok: true });
  if (had.byId !== me.id && !isAdminId(me.id)) return Response.json({ error: "Only its author or Admin can remove it" }, { status: 403 });
  await c.updateOne({ _id: id }, { $set: { deletedAt: new Date().toISOString(), text: "" } }); // the words go; "removed" stays in its place
  return Response.json({ ok: true });
}
