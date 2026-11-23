// The apps home page (owner, 23 Nov): who sees which app, the search, and the personal shortcuts.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { TRAINING_DASHBOARD, appsFor, cleanUrl, groupApps, search, shortcutName } from "@/lib/apps";
import { DELETE, GET, POST } from "@/app/api/shortcuts/route";
import { resetFakeDb } from "./fakes/db";

beforeEach(() => resetFakeDb());

const sumit = { id: "sumit", name: "Sumit A Shah" };
const admin = { id: "admin", name: "Admin" };

test("every dashboard page is an app, in the sidebar's order, for those who may open it", () => {
  assert.deepEqual(appsFor(admin).map((a) => a.id), ["overview", "quotations", "trainings", "items", "templates", "followups", "calendar", "sprints", "reports", "converter", "sheet"]);
  assert.equal(new Set(appsFor(admin).map((a) => a.href)).size, 11);
  const arti = appsFor({ id: "arti", name: "Arti Sirohi" }).map((a) => a.id);
  assert.ok(arti.includes("converter") && arti.includes("items"));
  assert.ok(!arti.includes("overview") && !arti.includes("templates"));
  assert.ok(appsFor(sumit).some((a) => a.id === "overview"));
});

test("search finds apps and their own shortcuts", () => {
  assert.deepEqual(search("quot", admin, []).map((f) => f.name), ["Quotations", "Trainings", "Sheet → Quotation"]);
  assert.deepEqual(search("books", admin, [{ id: "s1", name: "Zoho Books", url: "https://books.zoho.in/" }]).map((f) => [f.name, f.kind]), [["Quotations", "app"], ["Zoho Books", "shortcut"]]);
  assert.deepEqual(search("  ", admin, []), []);
});

test("a typed web address is made whole; anything else is refused; the name comes from the site", () => {
  assert.equal(cleanUrl("books.zoho.in"), "https://books.zoho.in/");
  assert.equal(cleanUrl("https://web.whatsapp.com"), "https://web.whatsapp.com/");
  for (const bad of ["", "hello", "javascript:alert(1)", "ftp://x.com", "two words.com"]) assert.equal(cleanUrl(bad), null, bad);
  assert.equal(shortcutName("", "https://mail.zoho.in/"), "Zoho");
  assert.equal(shortcutName("", "https://web.whatsapp.com/"), "Whatsapp");
  assert.equal(shortcutName("", "https://www.thinkhealth.in/"), "Thinkhealth");
  assert.equal(shortcutName("", "https://books.zoho.co.in/"), "Zoho");
  assert.equal(shortcutName("  My   books ", "https://books.zoho.in/"), "My books");
});

const call = async (m: { id: string; name: string } | null, method: "GET" | "POST" | "DELETE", body?: unknown, q = "") => {
  const req = new Request(`http://x/api/shortcuts${q}`, { method, headers: { ...(m ? { "x-test-member": JSON.stringify(m) } : {}), "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const r = await { GET, POST, DELETE }[method](req);
  return { s: r.status, j: await r.json() };
};

test("shortcuts are each person's own: add, no twins, rename, reorder, remove", async () => {
  assert.equal((await call(null, "GET")).s, 401);
  const a = await call(sumit, "POST", { url: "books.zoho.in" });
  assert.equal(a.s, 200);
  assert.deepEqual(a.j.shortcuts.map((s: { name: string; url: string }) => [s.name, s.url]), [["Zoho", "https://books.zoho.in/"]]);
  assert.equal((await call(sumit, "POST", { url: "https://books.zoho.in/" })).s, 409);
  assert.equal((await call(sumit, "POST", { url: "not a site" })).s, 400);
  const b = await call(sumit, "POST", { url: "web.whatsapp.com", name: "WhatsApp" });
  const [z, w] = b.j.shortcuts as { id: string }[];
  // Someone else sees none of them.
  assert.deepEqual((await call(admin, "GET")).j.shortcuts, []);
  assert.equal((await call(sumit, "POST", { action: "rename", id: z.id, name: "Zoho Books" })).j.shortcuts[0].name, "Zoho Books");
  assert.deepEqual((await call(sumit, "POST", { action: "order", ids: [w.id, z.id] })).j.shortcuts.map((s: { id: string }) => s.id), [w.id, z.id]);
  assert.equal((await call(admin, "DELETE", undefined, `?id=${z.id}`)).s, 404);
  assert.deepEqual((await call(sumit, "DELETE", undefined, `?id=${z.id}`)).j.shortcuts.map((s: { name: string }) => s.name), ["WhatsApp"]);
});

test("the apps come grouped under their application: all of today's under Training Dashboard", () => {
  const groups = groupApps(appsFor(admin));
  assert.deepEqual(groups.map((g) => [g.group, g.apps.length]), [[TRAINING_DASHBOARD, 11]]);
  const two = groupApps([...appsFor(admin).slice(0, 2), { ...appsFor(admin)[2], group: "Colleague app" }]);
  assert.deepEqual(two.map((g) => g.group), [TRAINING_DASHBOARD, "Colleague app"]);
});
