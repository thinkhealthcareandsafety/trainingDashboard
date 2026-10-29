// /api/analytics/dashboards against the in-memory fake database (tests/fakes) — who may save, see, delete, hide.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { DELETE, GET, POST } from "@/app/api/analytics/dashboards/route";
import { resetFakeDb } from "./fakes/db";

const who = { admin: { id: "admin", name: "Admin" }, sumit: { id: "sumit", name: "Sumit A Shah" }, ashish: { id: "ashish", name: "Ashish Dalal" }, arti: { id: "arti", name: "Arti Sirohi" } };
type Who = keyof typeof who;
const call = async (m: Who, method: "GET" | "POST" | "DELETE", body?: unknown, q = "") => {
  const req = new Request(`http://x/api/analytics/dashboards${q}`, { method, headers: { "x-test-member": JSON.stringify(who[m]), "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const r = await { GET, POST, DELETE }[method](req);
  return { s: r.status, j: await r.json() };
};
const board = (extra: object = {}) => ({ id: "d-1", title: "Defib board", shared: true, pages: [{ id: "p1", name: "One", items: [{ id: "a", ref: { dash: "sales", tile: "bymonth" }, x: 0, y: 0, w: 6, h: 4 }] }], ...extra });

beforeEach(() => resetFakeDb());

test("Ashish, Shikha, Sumit and Admin make dashboards; others can't", async () => {
  assert.equal((await call("sumit", "POST", { dashboard: board() })).s, 200);
  assert.equal((await call("arti", "POST", { dashboard: board() })).s, 403);
});

test("an 'only me' dashboard: only its maker sees and changes it", async () => {
  await call("sumit", "POST", { dashboard: board({ id: "d-2", shared: false }) });
  assert.ok(!(await call("ashish", "GET")).j.dashboards.some((d: { id: string }) => d.id === "d-2"));
  assert.equal((await call("ashish", "POST", { dashboard: board({ id: "d-2", shared: false }) })).s, 403);
  assert.equal((await call("ashish", "DELETE", undefined, "?id=d-2")).s, 403);
  assert.equal((await call("sumit", "DELETE", undefined, "?id=d-2")).s, 200);
});

test("a built-in tab: the team's version under its id; only Admin restores or hides it", async () => {
  assert.equal((await call("sumit", "POST", { dashboard: board({ id: "sales" }) })).s, 400);
  assert.equal((await call("ashish", "POST", { dashboard: board({ id: "sales", base: "sales", title: "Sales" }) })).s, 200);
  assert.equal((await call("ashish", "DELETE", undefined, "?id=sales")).s, 403);
  assert.equal((await call("admin", "DELETE", undefined, "?id=sales")).s, 200);
  assert.equal((await call("ashish", "POST", { hide: "growth" })).s, 403);
  assert.deepEqual((await call("admin", "POST", { hide: "growth" })).j.hidden, ["growth"]);
  assert.deepEqual((await call("admin", "POST", { hide: "growth", hidden: false })).j.hidden, []);
});

test("My dashboard is each person's own; the starting one is Admin's", async () => {
  const mine = await call("ashish", "POST", { dashboard: board({ id: "mine", title: "My dashboard" }) });
  assert.equal(mine.j.dashboard.id, "mine");
  assert.equal(mine.j.dashboard.shared, false);
  assert.ok(!(await call("sumit", "GET")).j.dashboards.some((d: { id: string }) => d.id === "mine" || d.id.startsWith("my-a")));
  assert.equal((await call("sumit", "POST", { dashboard: board({ id: "my-ashish" }) })).s, 400);
  assert.equal((await call("sumit", "POST", { dashboard: board({ id: "my-start" }) })).s, 403);
  assert.equal((await call("admin", "POST", { dashboard: board({ id: "my-start" }) })).s, 200);
  assert.ok((await call("sumit", "GET")).j.dashboards.some((d: { id: string }) => d.id === "my-start"));
});

test("what's stored is checked: overlaps and anything off the page are refused", async () => {
  const overlap = board({ pages: [{ id: "p1", name: "One", items: [{ id: "a", ref: { dash: "sales", tile: "x" }, x: 0, y: 0, w: 6, h: 4 }, { id: "b", ref: { dash: "sales", tile: "y" }, x: 3, y: 2, w: 6, h: 4 }] }] });
  assert.equal((await call("sumit", "POST", { dashboard: overlap })).s, 400);
  const off = board({ pages: [{ id: "p1", name: "One", items: [{ id: "a", ref: { dash: "sales", tile: "x" }, x: 0, y: 14, w: 6, h: 4 }] }] });
  assert.equal((await call("sumit", "POST", { dashboard: off })).s, 400);
});
