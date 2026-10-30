import { db } from "@/lib/db";
import { signedInMember, unauthorized } from "@/lib/auth";
import { boardsFor, hasFullAccess, isAdmin } from "@/lib/roles";
import { type CalcField, type CalcFormula, OPS, calcProblem } from "@/lib/analytics/calc";
import type { Format } from "@/lib/analytics/model";
import type { Filter } from "@/lib/analytics/query";

export const dynamic = "force-dynamic";

/*
 * Calculated fields (calc.ts — owner, 30 Oct: "ability to add aggregated columns"), shared with the team in Mongo
 * `reportFields`. GET ?dataset=<key> — the fields made on that data (everyone who sees Reports). POST { field } — make
 * or change one (Admin, Ashish, Shikha, Sumit, Nikita — the people who save reports); changing or DELETE ?id= — its maker
 * or Admin. A report that uses a deleted field says the number is gone; nothing else breaks.
 */

type Doc = Omit<CalcField, "id"> & { _id: string };
const col = async () => (await db()).collection<Doc>("reportFields");
const out = (d: Doc): CalcField => ({ id: d._id, dataset: d.dataset, name: d.name, formula: d.formula, format: d.format, createdBy: d.createdBy, at: d.at });

const KEY = /^[\w:.+\- ()/%→⟂]{1,200}$/u;
function cleanFormula(x: unknown): CalcFormula | null {
  const f = x as Partial<CalcFormula> & Record<string, unknown>;
  if (f?.kind === "filtered" && typeof f.base === "string" && KEY.test(f.base) && Array.isArray(f.filters)) {
    const filters = (f.filters as Partial<Filter>[]).slice(0, 10).map((y) => ({
      field: String(y.field ?? "").slice(0, 200), values: Array.isArray(y.values) ? y.values.slice(0, 200).map(String) : [],
      ...(y.exclude ? { exclude: true } : {}), ...(typeof y.contains === "string" && y.contains.trim() ? { contains: y.contains.slice(0, 100) } : {}),
      ...(typeof y.min === "number" ? { min: y.min } : {}), ...(typeof y.max === "number" ? { max: y.max } : {}),
    })).filter((y) => y.field);
    return { kind: "filtered", base: f.base, filters };
  }
  if (f?.kind === "combine" && typeof f.a === "string" && typeof f.b === "string" && KEY.test(f.a) && KEY.test(f.b) && OPS.some(([k]) => k === f.op))
    return { kind: "combine", a: f.a, b: f.b, op: f.op as Extract<CalcFormula, { kind: "combine" }>["op"] };
  return null;
}

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!boardsFor(me).includes("training")) return Response.json({ error: "You can't see this data" }, { status: 403 });
  const dataset = new URL(request.url).searchParams.get("dataset") ?? "";
  if (!dataset) return Response.json({ error: "Which data?" }, { status: 400 });
  const list = (await (await col()).find({ dataset }).toArray()).filter((d) => d.dataset === dataset);
  return Response.json({ fields: list.map(out) });
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!hasFullAccess(me)) return Response.json({ error: "Admin, Ashish, Shikha, Sumit and Nikita make fields" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { field?: Partial<CalcField> };
  const f = body.field ?? {};
  const formula = cleanFormula(f.formula);
  const dataset = typeof f.dataset === "string" && /^[\w:+]{1,200}$/.test(f.dataset) ? f.dataset : "";
  const name = typeof f.name === "string" ? f.name.trim() : "";
  const format = (["inr", "count", "pct", "days"] as Format[]).includes(f.format as Format) ? (f.format as Format) : "count";
  if (!dataset || !formula) return Response.json({ error: "That field can't be saved" }, { status: 400 });
  const problem = calcProblem({ name, formula, format });
  if (problem) return Response.json({ error: problem }, { status: 400 });
  const c = await col();
  if ((await c.find({ dataset }).toArray()).some((x) => x.dataset === dataset && x._id !== f.id && x.name.toLowerCase() === name.toLowerCase()))
    return Response.json({ error: `There's already a field called “${name}” on this data` }, { status: 400 });
  const now = new Date().toISOString();
  if (f.id) {
    const had = await c.findOne({ _id: f.id });
    if (!had) return Response.json({ error: "That field is gone" }, { status: 404 });
    if (had.createdBy !== me.name && !isAdmin(me)) return Response.json({ error: `Only ${had.createdBy} or Admin changes this field` }, { status: 403 });
    await c.updateOne({ _id: f.id }, { $set: { name, formula, format, at: now } });
    return Response.json({ field: out({ ...had, name, formula, format, at: now }) });
  }
  const doc: Doc = { _id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, dataset, name, formula, format, createdBy: me.name, at: now };
  await c.replaceOne({ _id: doc._id }, doc, { upsert: true });
  return Response.json({ field: out(doc) });
}

export async function DELETE(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const c = await col();
  const had = await c.findOne({ _id: id });
  if (!had) return Response.json({ error: "That field is gone" }, { status: 404 });
  if (had.createdBy !== me.name && !isAdmin(me)) return Response.json({ error: `Only ${had.createdBy} or Admin deletes this field` }, { status: 403 });
  await c.deleteOne({ _id: id });
  return Response.json({ ok: true });
}
