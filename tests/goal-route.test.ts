// /api/analytics/goal against the in-memory fake database (tests/fakes).
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

test("a goal doc with only the monthly goal still reads", async () => {
  await (await db()).collection<{ _id: string }>("kv").replaceOne({ _id: "reports_goal" }, { _id: "reports_goal", monthly: 60_00_000, months: {} });
  const { j } = await call("sumit", "GET");
  assert.equal(j.monthly, 60_00_000);
  assert.deepEqual(j.months, {});
});

test("only Admin changes the goal; a one-off month and back", async () => {
  assert.equal((await call("sumit", "POST", { monthly: 70_00_000 })).s, 403);
  assert.equal((await call("admin", "POST", { monthly: 70_00_000 })).j.monthly, 70_00_000);
  assert.deepEqual((await call("admin", "POST", { month: "2026-11", amount: 60_00_000 })).j.months, { "2026-11": 60_00_000 });
  assert.deepEqual((await call("admin", "POST", { month: "2026-11", amount: null })).j.months, {});
  assert.equal((await call("admin", "POST", { monthly: 5 })).s, 400);
});
