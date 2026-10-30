// ⋯ → Edit report… on built-in tiles (tileEdits.ts + /api/analytics/tile-edits) against the in-memory fake database.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { DELETE, GET, POST } from "@/app/api/analytics/tile-edits/route";
import { db } from "@/lib/db";
import { DASHBOARDS } from "@/lib/analytics/dashboards";
import { tileOf, toDef } from "@/lib/analytics/custom";
import { applyTileEdits, builtInTile, readEdit, tileKey } from "@/lib/analytics/tileEdits";
import { resetFakeDb } from "./fakes/db";

const who = { admin: { id: "admin", name: "Admin" }, sumit: { id: "sumit", name: "Sumit A Shah" }, arti: { id: "arti", name: "Arti Sirohi" }, rahul: { id: "rahul", name: "Rahul (trainer)" } };
type Who = keyof typeof who;
const call = async (m: Who, method: "GET" | "POST" | "DELETE", body?: unknown, query = "") => {
  const req = new Request(`http://x/api/analytics/tile-edits${query}`, { method, headers: { "x-test-member": JSON.stringify(who[m]), "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const r = await { GET, POST, DELETE }[method](req);
  return { s: r.status, j: await r.json() };
};
const tab = DASHBOARDS.find((d) => d.tiles.some((t) => t.spec.chart === "kpi" && t.spec.dataset === "sales"))!;
const kpi = tab.tiles.find((t) => t.spec.chart === "kpi" && t.spec.dataset === "sales")!;

beforeEach(() => resetFakeDb());

test("an edit replaces the tile's report on its tab — and through a dashboard made of references (My dashboard)", () => {
  const spec = { ...kpi.spec, title: "Revenue, edited", filters: [{ field: "sector", values: ["Hotels"] }] };
  const defs = applyTileEdits(DASHBOARDS, [{ key: tileKey(tab.id, kpi.id), spec, by: "Sumit A Shah", at: "2026-10-31T10:00:00Z" }]);
  const t = builtInTile(tab.id, kpi.id)!;
  assert.equal(t.spec.title, kpi.spec.title, "the built-in list itself is untouched");
  const edited = defs.find((d) => d.id === tab.id)!.tiles.find((x) => x.id === kpi.id)!;
  assert.equal(edited.spec.title, "Revenue, edited");
  assert.deepEqual(edited.edited, { by: "Sumit A Shah", at: "2026-10-31T10:00:00Z" });
  assert.equal(edited.w, kpi.w, "size, target and the rest stay");
  const mine = toDef({ id: "mine", title: "My dashboard", shared: false, pages: [{ id: "p", name: "Page 1", items: [{ id: "i1", ref: { dash: tab.id, tile: kpi.id }, x: 0, y: 0, w: 3, h: 2, kpi: true }] }] }, defs, []);
  assert.equal(mine.tiles[0].spec.title, "Revenue, edited");
  assert.deepEqual(mine.tiles[0].ref, { dash: tab.id, tile: kpi.id });
  assert.equal(tileOf({ dash: tab.id, tile: kpi.id }, defs, [])?.spec.title, "Revenue, edited");
});

test("old or broken stored edits are left out; an edit on other data doesn't count", () => {
  assert.equal(readEdit({ _id: "sales.rev" }), null);
  assert.equal(readEdit({ _id: "sales.rev", spec: { dataset: "sales" } }), null);
  assert.equal(readEdit({ _id: "sales.rev", spec: { dataset: "sales", measures: [] } }), null);
  assert.deepEqual(readEdit({ _id: "sales.rev", spec: { dataset: "sales", measures: ["revenue"] } }), { key: "sales.rev", spec: { dataset: "sales", measures: ["revenue"] }, by: "", at: "" });
  const defs = applyTileEdits(DASHBOARDS, [{ key: tileKey(tab.id, kpi.id), spec: { dataset: "quotes", measures: ["quotes"] }, by: "", at: "" }]);
  assert.equal(defs.find((d) => d.id === tab.id)!.tiles.find((x) => x.id === kpi.id)!.spec.dataset, "sales");
});

test("save for the team, read back by everyone, Restore original removes it", async () => {
  const spec = { ...kpi.spec, title: "  Revenue (team)  ", from: "2026-04-01", to: "2026-10-31", params: { x: 1 } };
  const saved = await call("sumit", "POST", { dash: tab.id, tile: kpi.id, spec });
  assert.equal(saved.s, 200, JSON.stringify(saved.j));
  const { j } = await call("rahul", "GET");
  assert.equal(j.edits.length, 1);
  assert.equal(j.canEdit, false);
  assert.equal(j.edits[0].key, tileKey(tab.id, kpi.id));
  assert.equal(j.edits[0].spec.title, "Revenue (team)");
  assert.equal(j.edits[0].spec.from, undefined, "no dates of the moment");
  assert.equal(j.edits[0].spec.params, undefined, "no viewer's parameter values");
  assert.equal(j.edits[0].by, "Sumit A Shah");
  assert.equal((await call("rahul", "DELETE", undefined, `?key=${encodeURIComponent(saved.j.key)}`)).s, 403);
  assert.equal((await call("admin", "DELETE", undefined, `?key=${encodeURIComponent(saved.j.key)}`)).s, 200);
  assert.equal((await call("sumit", "GET")).j.edits.length, 0);
});

test("refused: not a dashboard editor, not a built-in tile, other data, a made-up measure", async () => {
  assert.equal((await call("arti", "POST", { dash: tab.id, tile: kpi.id, spec: kpi.spec })).s, 403);
  assert.equal((await call("sumit", "POST", { dash: tab.id, tile: "nope", spec: kpi.spec })).s, 404);
  assert.equal((await call("sumit", "POST", { dash: tab.id, tile: kpi.id, spec: { ...kpi.spec, dataset: "quotes" } })).s, 400);
  assert.equal((await call("sumit", "POST", { dash: tab.id, tile: kpi.id, spec: { ...kpi.spec, measures: ["madeUp"] } })).s, 400);
  assert.equal((await call("sumit", "GET")).j.edits.length, 0);
  assert.deepEqual((await call("arti", "GET")).j, { edits: [], canEdit: false }, "no Training board, no Reports");
});

test("a document saved in an old or broken shape doesn't break the list", async () => {
  await (await db()).collection<{ _id: string }>("reportTileEdits").replaceOne({ _id: "sales.old" }, { _id: "sales.old", spec: null } as never);
  const { s, j } = await call("sumit", "GET");
  assert.equal(s, 200);
  assert.deepEqual(j.edits, []);
  assert.equal(j.canEdit, true);
});
