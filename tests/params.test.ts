// Parameters (src/lib/analytics/params.ts + /api/analytics/params): filters that follow one, a field that uses one,
// the viewer's own value over the parameter's, and who may make / change / delete them.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { type Param, cleanValue, registerParams } from "@/lib/analytics/params";
import { registerCalcFields } from "@/lib/analytics/calc";
import { type Catalog, registerTables, tableRows } from "@/lib/analytics/tables";
import { runQuery } from "@/lib/analytics/query";
import { describeSpec } from "@/lib/analytics/describe";
import { DELETE, GET, POST } from "@/app/api/analytics/params/route";
import { resetFakeDb } from "./fakes/db";

const catalog: Catalog = { tables: [{ id: "9", name: "Quotes", rows: 4, columns: [
  { name: "Quote Date", type: "date" }, { name: "Status", type: "text" }, { name: "Sub Total (BCY)", type: "money" },
] }] };
registerTables(catalog);
const rows = tableRows(catalog.tables[0], [
  { "Quote Date": "01/10/2026", Status: "sent", "Sub Total (BCY)": "100" },
  { "Quote Date": "10/10/2026", Status: "accepted", "Sub Total (BCY)": "300" },
  { "Quote Date": "20/10/2026", Status: "sent", "Sub Total (BCY)": "500" },
  { "Quote Date": "25/10/2026", Status: "declined", "Sub Total (BCY)": "700" },
], new Map());
const ps: Param[] = [
  { id: "s", name: "Status", type: "list", value: "sent", options: ["sent", "accepted", "declined"] },
  { id: "from", name: "Start", type: "date", value: "2026-10-10" },
  { id: "min", name: "Big quote", type: "number", value: 400 },
  { id: "target", name: "Target", type: "number", value: 1000 },
];
registerParams(ps);
const q = (spec: Partial<Parameters<typeof runQuery>[0]>) => runQuery({ dataset: "zt:9", measures: ["sum:Sub Total (BCY)"], ...spec }, rows).totals[0];

test("filters follow a parameter — its own value, or the one chosen for the run", () => {
  assert.equal(q({ filters: [{ field: "Status", values: [], param: "s" }] }), 600);
  assert.equal(q({ filters: [{ field: "Status", values: [], param: "s" }], params: { s: "accepted" } }), 300);
  assert.equal(q({ filters: [{ field: "Quote Date", values: [], param: "from", cmp: "min" }] }), 1500);
  assert.equal(q({ filters: [{ field: "Quote Date", values: [], param: "from", cmp: "max" }], params: { from: "2026-10-01" } }), 100);
  assert.equal(q({ filters: [{ field: "Sub Total (BCY)", values: [], param: "min", cmp: "min" }] }), 1200);
  assert.equal(q({ filters: [{ field: "Status", values: [], param: "gone" }] }), 1600, "a parameter that's gone filters nothing");
});

test("a field uses a parameter as a number; the sentence names it", () => {
  registerCalcFields([{ id: "gap", dataset: "zt:9", name: "Short of target", format: "inr", formula: { kind: "combine", a: "param:target", op: "sub", b: "sum:Sub Total (BCY)" } }]);
  assert.equal(runQuery({ dataset: "zt:9", measures: ["calc:gap"] }, rows).totals[0], 1000 - 1600);
  assert.equal(runQuery({ dataset: "zt:9", measures: ["calc:gap"], params: { target: 2000 } }, rows).totals[0], 400);
  assert.match(describeSpec({ dataset: "zt:9", measures: ["sum:Sub Total (BCY)"], filters: [{ field: "Quote Date", values: [], param: "from", cmp: "min" }] }, "2026-10-30"), /Quote Date is at least \{Start\}/);
});

test("values are checked by kind", () => {
  assert.equal(cleanValue({ type: "number" }, "₹1,50,000"), 150000);
  assert.equal(cleanValue({ type: "number" }, "lots"), null);
  assert.equal(cleanValue({ type: "date" }, "2026-11-01"), "2026-11-01");
  assert.equal(cleanValue({ type: "list", options: ["a", "b"] }, "c"), null);
});

const who = { admin: { id: "admin", name: "Admin" }, sumit: { id: "s", name: "Sumit A Shah" }, ashish: { id: "a", name: "Ashish Dalal" }, arti: { id: "t", name: "Arti Sirohi" } };
const call = async (m: keyof typeof who, method: "GET" | "POST" | "DELETE", body?: unknown, q2 = "") => {
  const req = new Request(`http://x/api/analytics/params${q2}`, { method, headers: { "x-test-member": JSON.stringify(who[m]), "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const r = await { GET, POST, DELETE }[method](req);
  return { s: r.status, j: await r.json() };
};
beforeEach(() => resetFakeDb());

test("the route: the team makes parameters, the maker or Admin changes them", async () => {
  const param = { name: "Target", type: "number", value: "50,00,000" };
  assert.equal((await call("arti", "POST", { param })).s, 403);
  const made = await call("sumit", "POST", { param });
  assert.equal(made.j.param.value, 5000000);
  assert.match((await call("ashish", "POST", { param: { ...param, name: "target" } })).j.error, /already a parameter/);
  assert.match((await call("ashish", "POST", { param: { name: "Pick", type: "list", value: "x" } })).j.error, /needs its choices/);
  assert.equal((await call("ashish", "POST", { param: { ...param, id: made.j.param.id, value: 1 } })).s, 403);
  assert.equal((await call("admin", "POST", { param: { ...param, id: made.j.param.id, value: 6000000 } })).j.param.value, 6000000);
  assert.equal((await call("ashish", "GET")).j.params.length, 1);
  assert.equal((await call("sumit", "DELETE", undefined, `?id=${made.j.param.id}`)).s, 200);
});
