// /api/analytics/prefs against the in-memory fake database (tests/fakes) — saved dashboard filters (owner, 30 Oct).
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "@/app/api/analytics/prefs/route";
import { db } from "@/lib/db";
import { resetFakeDb } from "./fakes/db";

const who = { sumit: { id: "sumit", name: "Sumit A Shah" }, ashish: { id: "ashish", name: "Ashish Dalal" }, arti: { id: "arti", name: "Arti Sirohi" } };
type Who = keyof typeof who;
const call = async (m: Who, method: "GET" | "POST", body?: unknown) => {
  const req = new Request("http://x/api/analytics/prefs", { method, headers: { "x-test-member": JSON.stringify(who[m]), "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const r = await { GET, POST }[method](req);
  return { s: r.status, j: await r.json() };
};
const state = { period: "fy", compare: "lastYear", filters: { sector: { values: ["Hotels"] } } };

beforeEach(() => resetFakeDb());

test("an old prefs doc (views only, no saved filters) still reads", async () => {
  await (await db()).collection<{ _id: string }>("reportPrefs").replaceOne({ _id: "sumit" }, { _id: "sumit", views: { sales: [{ name: "A", state }] } });
  const { s, j } = await call("sumit", "GET");
  assert.equal(s, 200);
  assert.deepEqual(j.saved, {});
  assert.equal(j.views.sales.length, 1);
});

test("save a dashboard's filters, per person; null clears them; views stay", async () => {
  await call("sumit", "POST", { dash: "sales", views: [{ name: "A", state }] });
  assert.equal((await call("sumit", "POST", { dash: "sales", saved: state })).s, 200);
  assert.equal((await call("sumit", "POST", { dash: "mine", saved: { ...state, period: "month" } })).s, 200);
  let j = (await call("sumit", "GET")).j;
  assert.deepEqual(j.saved.sales, state);
  assert.equal(j.saved.mine.period, "month");
  assert.equal(j.views.sales.length, 1);
  assert.deepEqual((await call("ashish", "GET")).j.saved, {});
  await call("sumit", "POST", { dash: "sales", saved: null });
  j = (await call("sumit", "GET")).j;
  assert.equal(j.saved.sales, undefined);
  assert.equal(j.saved.mine.period, "month");
});

test("bad saved filters are refused; members without Reports can't save", async () => {
  assert.equal((await call("sumit", "POST", { dash: "sales", saved: { filters: {} } })).s, 400);
  assert.equal((await call("sumit", "POST", { dash: "Sales!", saved: state })).s, 400);
  assert.equal((await call("arti", "POST", { dash: "sales", saved: state })).s, 403);
});
