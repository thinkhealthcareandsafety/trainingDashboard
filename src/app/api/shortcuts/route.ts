import { signedInMember, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { MAX_SHORTCUTS, type Shortcut, cleanUrl, shortcutName } from "@/lib/apps";

export const dynamic = "force-dynamic";

/*
 * The apps home page's personal shortcuts (owner, 23 Nov: each person adds their own websites, like Chrome's). Only the
 * person who made them sees them. `shortcuts` collection, _id = member id.
 *  GET                                   — mine
 *  POST { name?, url }                   — add one (the name is made from the site when left empty)
 *  POST { action: "rename", id, name }   — change its name
 *  POST { action: "order", ids }         — put them in this order
 *  DELETE ?id=                           — remove one
 */
type Doc = { _id: string; list: Shortcut[] };
const col = async () => (await db()).collection<Doc>("shortcuts");
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const mine = async (id: string) => (await (await col()).findOne({ _id: id }))?.list ?? [];
const save = async (id: string, list: Shortcut[]) => { await (await col()).updateOne({ _id: id }, { $set: { list } }, { upsert: true }); return json({ shortcuts: list }); };

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  return json({ shortcuts: await mine(me.id) });
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const b = (await request.json().catch(() => null)) as { action?: string; id?: unknown; name?: unknown; url?: unknown; ids?: unknown } | null;
  const list = await mine(me.id);
  if (b?.action === "rename") {
    const name = String(b.name ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!name) return json({ error: "Give it a name" }, 400);
    if (!list.some((s) => s.id === b.id)) return json({ error: "That shortcut is gone" }, 404);
    return save(me.id, list.map((s) => (s.id === b.id ? { ...s, name } : s)));
  }
  if (b?.action === "order") {
    const ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
    const pos = (s: Shortcut) => { const i = ids.indexOf(s.id); return i < 0 ? ids.length : i; };
    return save(me.id, [...list].sort((x, y) => pos(x) - pos(y)));
  }
  const url = cleanUrl(b?.url);
  if (!url) return json({ error: "That isn't a web address. Try something like zoho.in/books." }, 400);
  if (list.length >= MAX_SHORTCUTS) return json({ error: `You have ${MAX_SHORTCUTS} shortcuts already. Remove one first.` }, 400);
  if (list.some((s) => s.url === url)) return json({ error: "You have that one already." }, 409);
  const s: Shortcut = { id: `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: shortcutName(b?.name, url), url };
  return save(me.id, [...list, s]);
}

export async function DELETE(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const id = new URL(request.url).searchParams.get("id");
  const list = await mine(me.id);
  if (!list.some((s) => s.id === id)) return json({ error: "That shortcut is gone" }, 404);
  return save(me.id, list.filter((s) => s.id !== id));
}
