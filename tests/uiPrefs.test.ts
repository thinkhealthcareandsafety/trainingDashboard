// /api/ui-prefs (owner, 12 Nov: "keep it as default setting for the user") — per person, only known settings.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { GET, PUT } from "@/app/api/ui-prefs/route";
import { resetFakeDb } from "./fakes/db";

beforeEach(() => resetFakeDb());
const as = (id: string, init: RequestInit = {}) => new Request("http://x/api/ui-prefs", { ...init, headers: { "content-type": "application/json", "x-test-member": JSON.stringify({ id, name: id }) } });
const put = (id: string, body: object) => PUT(as(id, { method: "PUT", body: JSON.stringify(body) }));

test("the Trainings sort is saved per person; null goes back to the default; unknown or bad settings refused", async () => {
  assert.equal((await GET(new Request("http://x/api/ui-prefs"))).status, 401);
  assert.equal((await put("sumit", { key: "trainingsSort", value: { key: "total", dir: "desc" } })).status, 200);
  assert.deepEqual(((await (await GET(as("sumit"))).json()) as { prefs: Record<string, unknown> }).prefs, { trainingsSort: { key: "total", dir: "desc" } });
  assert.deepEqual(((await (await GET(as("ashish"))).json()) as { prefs: Record<string, unknown> }).prefs, {});
  assert.equal((await put("sumit", { key: "trainingsSort", value: { key: "price", dir: "up" } })).status, 400);
  assert.equal((await put("sumit", { key: "whatever", value: 1 })).status, 400);
  assert.equal((await put("sumit", { key: "trainingsSort", value: null })).status, 200);
  assert.deepEqual(((await (await GET(as("sumit"))).json()) as { prefs: Record<string, unknown> }).prefs, { trainingsSort: null });
});
