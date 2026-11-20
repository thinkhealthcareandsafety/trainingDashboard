import { signedInMember, unauthorized } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { addComment, boardFor, connectSprints, createTask, deleteTask, mayTouch, moveTask, sprintsInfo, SPRINTS_SCOPES, taskComments, taskDetail, updateTask, type TaskInput } from "@/lib/zohoSprints";

export const dynamic = "force-dynamic";

/*
 * Sprints (owner, 18 Nov): project P5's board, read from and written to Zoho Sprints. Sumit, Admin, Shikha and Nikita
 * see and change every task; everyone else sees and changes only the tasks they are on (and creates tasks). Only Admin
 * connects.
 *  GET                                      — { connected, canConnect, needsReconnect, scopes, board? }
 *  GET ?item=<id>&sprint=<id>               — a task's description, custom fields and tags
 *  GET ?item=<id>&sprint=<id>&comments=1    — its comments (owner, 20 Nov), oldest first
 *  POST { action: "connect", code, … }      — Admin: connect Zoho Sprints (again when scopes were added)
 *  POST { action: "create", sprint, task }  — Create Task
 *  POST { action: "update", sprint, item, task } — a task edited (task.users with task.was = owners before)
 *  POST { action: "move", sprint, item, status } — a card dragged to another column
 *  POST { action: "delete", sprint, item }  — a task deleted
 *  POST { action: "comment", sprint, item, text } — a comment, written to the task in Zoho Sprints under the writer's name
 */
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const fail = (e: unknown, fallback: string) => json({ error: e instanceof Error ? e.message : fallback }, 502);

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const q = new URL(request.url).searchParams;
  if (q.get("item")) {
    try {
      if (!(await mayTouch(me, q.get("item")))) return json({ error: "That task isn't yours." }, 403);
      if (q.get("comments")) return json({ comments: await taskComments(q.get("sprint"), q.get("item")) });
      return json(await taskDetail(q.get("sprint"), q.get("item")));
    } catch (e) { return fail(e, "Couldn't read the task"); }
  }
  const info = await sprintsInfo();
  const base = { connected: Boolean(info), canConnect: isAdmin(me), needsReconnect: Boolean(info?.needsReconnect), scopes: SPRINTS_SCOPES };
  if (!info) return json(base);
  try {
    return json({ ...base, board: await boardFor(me) });
  } catch (e) {
    return json({ ...base, error: e instanceof Error ? e.message : "Couldn't read Zoho Sprints" }, 502);
  }
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const b = (await request.json().catch(() => null)) as { action?: string; code?: unknown; clientId?: unknown; clientSecret?: unknown; sprint?: unknown; item?: unknown; status?: unknown; text?: unknown; task?: TaskInput & { was?: string[] } } | null;
  try {
    switch (b?.action) {
      case "connect":
        if (!isAdmin(me)) return json({ error: "Only Admin connects Zoho Sprints" }, 403);
        return json(await connectSprints({ code: String(b.code ?? ""), clientId: b.clientId ? String(b.clientId) : undefined, clientSecret: b.clientSecret ? String(b.clientSecret) : undefined }, me.name));
      case "create": return json(await createTask(b.sprint, b.task ?? {}, me));
      case "update": case "move": case "delete": case "comment":
        if (!(await mayTouch(me, b.item))) return json({ error: "That task isn't yours." }, 403);
        break;
    }
    switch (b?.action) {
      case "update": await updateTask(b.sprint, b.item, b.task ?? {}); return json({ ok: true });
      case "move": await moveTask(b.sprint, b.item, b.status); return json({ ok: true });
      case "delete": await deleteTask(b.sprint, b.item); return json({ ok: true });
      case "comment": await addComment(b.sprint, b.item, b.text, me); return json({ comments: await taskComments(b.sprint, b.item) });
      default: return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    return fail(e, "Zoho Sprints didn't take that");
  }
}
