import { signedInMember, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/roles";
import { type LinkApp, MAX_APPS, appName, cleanUrl } from "@/lib/apps";

export const dynamic = "force-dynamic";

/*
 * The applications on the main page beside Training Dashboard (owner, 23 Nov: "I add them: a link that opens their
 * website on this same page"). Everyone signed in sees them; Admin (isAdmin: Admin, Shikha, Jasmeet) adds and removes.
 * `launcherApps` collection, one document per application, in the order added.
 *  GET                                  — all of them, and whether you may change them
 *  POST { name?, url }                  — Admin: add one (the name is made from the site when left empty)
 *  POST { action: "rename", id, name }  — Admin: change its name
 *  DELETE ?id=                          — Admin: remove one
 */
type Doc = LinkApp & { _id: string };
const col = async () => (await db()).collection<Doc>("launcherApps");
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const all = async (): Promise<LinkApp[]> => (await (await col()).find({}).sort({ at: 1 }).toArray()).map(({ _id, ...a }) => ({ ...a, id: _id }));

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  return json({ apps: await all(), canEdit: isAdmin(me) });
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!isAdmin(me)) return json({ error: "Only Admin adds applications" }, 403);
  const b = (await request.json().catch(() => null)) as { action?: string; id?: unknown; name?: unknown; url?: unknown } | null;
  const c = await col();
  if (b?.action === "rename") {
    const name = String(b.name ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!name) return json({ error: "Give it a name" }, 400);
    const id = String(b.id ?? "");
    if (!(await c.findOne({ _id: id }))) return json({ error: "That application is gone" }, 404);
    await c.updateOne({ _id: id }, { $set: { name } });
    return json({ apps: await all(), canEdit: true });
  }
  const url = cleanUrl(b?.url);
  if (!url) return json({ error: "That isn't a web address. Try something like their-app.vercel.app." }, 400);
  const list = await all();
  if (list.length >= MAX_APPS) return json({ error: `There are ${MAX_APPS} applications already. Remove one first.` }, 400);
  if (list.some((a) => a.url === url)) return json({ error: "That application is on the page already." }, 409);
  const id = `app_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await c.insertOne({ _id: id, id, name: appName(b?.name, url), url, by: me.name, at: new Date().toISOString() });
  return json({ apps: await all(), canEdit: true });
}

export async function DELETE(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!isAdmin(me)) return json({ error: "Only Admin removes applications" }, 403);
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const c = await col();
  if (!(await c.findOne({ _id: id }))) return json({ error: "That application is gone" }, 404);
  await c.deleteOne({ _id: id });
  return json({ apps: await all(), canEdit: true });
}
