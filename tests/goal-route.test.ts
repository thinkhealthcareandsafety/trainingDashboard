// /api/analytics/goal against the in-memory fake database (tests/fakes) — sales targets per person (owner, 30 Oct).
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "@/app/api/analytics/goal/route";
import { db } from "@/lib/db";
import { resetFakeDb } from "./fakes/db";

const who = { admin: { id: "admin", name: "Admin" }, sumit: { id: "sumit", name: "Sumit A Shah" } };
const call = async (m: keyof typeof who, method: "GET" | "POST", body?: unknown) => {
  const req = new Request("http://x/api/analytics/goal", { method, headers: { "x-test-member": JSON.stringify(who[m]), "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const r = await { GET, POST }[method](req);
  return { s: r.status, j: await r.json() };
};

beforeEach(() => resetFakeDb());

test("an old goal doc (no targets) still reads, with no people", async () => {
  await (await db()).collection<{ _id: string }>("kv").replaceOne({ _id: "reports_goal" }, { _id: "reports_goal", monthly: 60_00_000, months: {} });
  const { j } = await call("sumit", "GET");
  assert.equal(j.monthly, 60_00_000);
  assert.deepEqual(j.people, {});
});

test("only Admin sets targets; the whole list at once; the goal stays", async () => {
  assert.equal((await call("sumit", "POST", { people: { "Sumit A Shah": 5_00_000 } })).s, 403);
  await call("admin", "POST", { monthly: 70_00_000 });
  const { s, j } = await call("admin", "POST", { people: { "Sumit A Shah": 5_00_000, "Ashish Dalal": 3_00_000 } });
  assert.equal(s, 200);
  assert.deepEqual(j.people, { "Sumit A Shah": 5_00_000, "Ashish Dalal": 3_00_000 });
  assert.equal(j.monthly, 70_00_000);
  assert.deepEqual((await call("admin", "POST", { people: { "Ashish Dalal": 4_00_000 } })).j.people, { "Ashish Dalal": 4_00_000 });
  assert.equal((await call("admin", "POST", { people: { "Sumit A Shah": 5 } })).s, 400);
});
