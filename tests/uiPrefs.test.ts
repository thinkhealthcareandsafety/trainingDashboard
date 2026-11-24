// /api/ui-prefs (owner, 12 Nov: "keep it as default setting for the user") — per person, only known settings.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { GET, PUT } from "@/app/api/ui-prefs/route";
import { themeOnSignIn } from "@/lib/accountTheme";
import { resetFakeDb } from "./fakes/db";
import { existsSync } from "node:fs";
import { pinnedFirst, ZOHO_APPS } from "@/lib/zohoApps";

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

test("the theme is saved per person; a theme that doesn't fit its mode is refused", async () => {
  assert.equal((await put("sumit", { key: "theme", value: { mode: "dark", id: "dark-xwine" } })).status, 200);
  assert.deepEqual(((await (await GET(as("sumit"))).json()) as { prefs: Record<string, unknown> }).prefs, { theme: { mode: "dark", id: "dark-xwine" } });
  assert.deepEqual(((await (await GET(as("ashish"))).json()) as { prefs: Record<string, unknown> }).prefs, {});
  assert.equal((await put("sumit", { key: "theme", value: { mode: "light", id: "" } })).status, 200);
  for (const value of [null, {}, { mode: "light", id: "dark-xwine" }, { mode: "dark", id: "mint" }, { mode: "dark", id: '"><b>' }]) assert.equal((await put("sumit", { key: "theme", value })).status, 400);
});

test("signing in: the account's theme wins; a browser's old pick moves to the account, but never someone else's", () => {
  const mint = { mode: "light" as const, id: "mint" }, wine = { mode: "dark" as const, id: "dark-xwine" };
  assert.deepEqual(themeOnSignIn(wine, mint, null, "sumit"), { do: "apply", theme: wine });
  assert.deepEqual(themeOnSignIn(undefined, mint, null, "sumit"), { do: "save", theme: mint });
  assert.deepEqual(themeOnSignIn(undefined, mint, "sumit", "sumit"), { do: "save", theme: mint });
  assert.deepEqual(themeOnSignIn(undefined, mint, "arti", "sumit"), { do: "clear" });
  assert.deepEqual(themeOnSignIn(undefined, null, null, "sumit"), { do: "nothing" });
});

test("the apps page: pins are each person's own and come first in the order pinned; every Zoho app has a picture", async () => {
  assert.equal((await put("sumit", { key: "appPins", value: ["z:crm", "dashboard"] })).status, 200);
  assert.deepEqual(((await (await GET(as("sumit"))).json()) as { prefs: Record<string, unknown> }).prefs, { appPins: ["z:crm", "dashboard"] });
  assert.deepEqual(((await (await GET(as("ashish"))).json()) as { prefs: Record<string, unknown> }).prefs, {});
  for (const value of [null, "z:crm", [1], ["a", "a"], ["<b>"], Array.from({ length: 201 }, (_, i) => `a${i}`)]) assert.equal((await put("sumit", { key: "appPins", value })).status, 400);
  assert.deepEqual(pinnedFirst([{ id: "a" }, { id: "b" }, { id: "c" }], ["c", "gone", "b"]).map((x) => x.id), ["c", "b", "a"]);
  assert.equal(new Set(ZOHO_APPS.map((z) => z.id)).size, ZOHO_APPS.length);
  for (const z of ZOHO_APPS) { assert.ok(existsSync(`public${z.icon}`), z.id); assert.match(new URL(z.url).hostname, /\.zoho\.in$/); }
});
