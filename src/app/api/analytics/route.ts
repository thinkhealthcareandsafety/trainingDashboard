import { after } from "next/server";
import { signedInMember, unauthorized } from "@/lib/auth";
import { boardsFor, isAdmin } from "@/lib/roles";
import { DATASETS, canRead, datasetOf } from "@/lib/analytics/model";
import { type Spec, SpecError, runQuery } from "@/lib/analytics/query";
import { STALE_MS, dataState, datasetRows, refreshAnalyticsData } from "@/lib/analytics/source";
import { TABLES, type TableKey } from "@/lib/analytics/build";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/*
 * Reports (ANALYTICS-PLAN.md). GET — which datasets this member may use + how fresh the Zoho Analytics copy is.
 * POST { specs: Spec[] } — runs each report spec (a dashboard sends all its tiles at once). PUT — Admin: copy the
 * Zoho Analytics tables again now. Row-level rule: a dataset is readable only with its board (roles.ts).
 */

const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const boards = boardsFor(me);
  const state = await dataState();
  return Response.json({ datasets: DATASETS.filter((d) => canRead(d, boards, isAdmin(me))).map((d) => d.key), state, today: istToday(), admin: isAdmin(me) });
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { specs?: Spec[] };
  const specs = (body.specs ?? []).slice(0, 40);
  const boards = boardsFor(me);
  const today = istToday();
  // The board is read only when a report needs the trainings (27 Oct: a new server loading everything took > 2 min
  // on the slowed free database). A failure says what failed, instead of a bare 500.
  let data: Awaited<ReturnType<typeof datasetRows>>;
  try {
    data = await datasetRows(today, specs.some((s) => s.dataset === "trainings"), specs.some((s) => s.dataset === "stock"));
  } catch (e) {
    console.error("[analytics] data failed:", e);
    return Response.json({ error: `Couldn't load the report data (${e instanceof Error ? e.message : String(e)}) — try again in a minute` }, { status: 503 });
  }
  const { rows, state } = data;
  // A stale copy refreshes itself after this answer (whoever opens Reports), never twice at once (lock). So does a copy
  // missing a table added since (e.g. Sales Orders, 27 Oct) — at most every 10 minutes, in case Zoho keeps refusing it.
  const age = state.refreshedAt ? Date.now() - Date.parse(state.refreshedAt) : Infinity;
  const missing = Object.keys(TABLES).some((k) => state.tables?.[k as TableKey] === undefined);
  if (!state.running && (age > STALE_MS || (missing && age > 10 * 60_000))) {
    after(() => refreshAnalyticsData("Reports (automatic)").then(() => undefined, () => undefined));
  }
  const results = specs.map((spec) => {
    try {
      const d = datasetOf(spec.dataset);
      if (!d || !canRead(d, boards, isAdmin(me))) return { error: "You can't see this data" };
      return runQuery({ ...spec, asOf: today }, rows[d.key] ?? []);
    } catch (e) {
      return { error: e instanceof SpecError ? e.message : "Couldn't run this report" };
    }
  });
  return Response.json({ results, state, today });
}

export async function PUT(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!isAdmin(me)) return Response.json({ error: "Admin only" }, { status: 403 });
  const started = await refreshAnalyticsData(me.name);
  return Response.json({ ok: started, state: await dataState(), ...(started ? {} : { error: "A refresh is already running" }) });
}
