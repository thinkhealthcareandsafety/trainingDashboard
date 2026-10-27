import { db } from "@/lib/db";
import { signedInMember, unauthorized } from "@/lib/auth";
import { boardsFor, isAdmin } from "@/lib/roles";
import { DEFAULT_GOAL, type Goal } from "@/lib/analytics/goal";

export const dynamic = "force-dynamic";

/*
 * The monthly revenue goal on Reports (kv `reports_goal`; ₹50 L until Admin changes it — owner, 27 Oct). GET — the
 * goal, for members who see the Sales data (Training board). POST { monthly?, month?, amount? } — Admin: the usual
 * goal, and / or a different one for one month ("YYYY-MM"; amount null = back to the usual).
 */

type Doc = Goal & { _id: string };
const KEY = "reports_goal";
const kv = async () => (await db()).collection<Doc>("kv");
const read = async (): Promise<Goal> => {
  const d = await (await kv()).findOne({ _id: KEY });
  return { monthly: d?.monthly ?? DEFAULT_GOAL, months: d?.months ?? {}, updatedAt: d?.updatedAt, updatedBy: d?.updatedBy };
};
// ₹1 lakh to ₹100 crore: anything outside is a typo (a missing or extra zero).
const sane = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 1e5 && n <= 1e9;

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!boardsFor(me).includes("training")) return Response.json({ error: "You can't see this data" }, { status: 403 });
  return Response.json(await read());
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!isAdmin(me)) return Response.json({ error: "Only Admin changes the goal" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { monthly?: unknown; month?: unknown; amount?: unknown };
  const set: Record<string, unknown> = {};
  const unset: Record<string, ""> = {};
  if (body.monthly !== undefined) {
    if (!sane(body.monthly)) return Response.json({ error: "Enter a goal between ₹1 lakh and ₹100 crore" }, { status: 400 });
    set.monthly = Math.round(body.monthly);
  }
  if (body.month !== undefined) {
    if (typeof body.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month)) return Response.json({ error: "Bad month" }, { status: 400 });
    if (body.amount === null) unset[`months.${body.month}`] = "";
    else if (sane(body.amount)) set[`months.${body.month}`] = Math.round(body.amount);
    else return Response.json({ error: "Enter a goal between ₹1 lakh and ₹100 crore" }, { status: 400 });
  }
  if (!Object.keys(set).length && !Object.keys(unset).length) return Response.json({ error: "Nothing to change" }, { status: 400 });
  await (await kv()).updateOne(
    { _id: KEY },
    { $set: { ...set, updatedAt: new Date().toISOString(), updatedBy: me.name }, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    { upsert: true },
  );
  return Response.json(await read());
}
