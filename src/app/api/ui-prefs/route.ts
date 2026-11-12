import { db } from "@/lib/db";
import { signedInMember, unauthorized } from "@/lib/auth";
import { UI_PREFS } from "@/lib/uiPrefs";

export const dynamic = "force-dynamic";

// My page settings (src/lib/uiPrefs.ts). GET → { prefs }. PUT { key, value } saves one (null = back to the default).
// Each member reads and writes only their own.
type Doc = { _id: string; prefs?: Record<string, unknown>; updatedAt?: string };
const col = async () => (await db()).collection<Doc>("uiPrefs");

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  return Response.json({ prefs: (await (await col()).findOne({ _id: me.id }))?.prefs ?? {} });
}

export async function PUT(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const b = (await request.json().catch(() => null)) as { key?: unknown; value?: unknown } | null;
  const check = typeof b?.key === "string" ? UI_PREFS[b.key] : undefined;
  if (!check) return Response.json({ error: "Unknown setting" }, { status: 400 });
  const r = check(b!.value);
  if (!r.ok) return Response.json({ error: "That setting doesn't look right" }, { status: 400 });
  await (await col()).updateOne({ _id: me.id }, { $set: { [`prefs.${b!.key}`]: r.value, updatedAt: new Date().toISOString() } }, { upsert: true });
  return Response.json({ ok: true });
}
