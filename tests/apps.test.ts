// The apps home page (owner, 23 Nov): the applications Admin adds (links), and the pages inside Training Dashboard.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { appName, cleanUrl, dashboardPages } from "@/lib/apps";
import { DELETE, GET, POST } from "@/app/api/apps/route";
import { resetFakeDb } from "./fakes/db";

beforeEach(() => resetFakeDb());

const sumit = { id: "sumit", name: "Sumit A Shah" };
const admin = { id: "admin", name: "Admin" };
const arti = { id: "arti", name: "Arti Sirohi" };

test("inside Training Dashboard: every page, in the sidebar's order, for those who may open it", () => {
  assert.deepEqual(dashboardPages(admin).map((p) => p.id), ["overview", "quotations", "trainings", "items", "templates", "followups", "calendar", "sprints", "reports", "converter", "sheet"]);
  assert.equal(new Set(dashboardPages(admin).map((p) => p.href)).size, 11);
  const hers = dashboardPages(arti).map((p) => p.id);
  assert.ok(hers.includes("converter") && hers.includes("items"));
  assert.ok(!hers.includes("overview") && !hers.includes("templates"));
  assert.ok(dashboardPages(sumit).some((p) => p.id === "overview"));
});

test("a typed link is made whole; anything else is refused; the name comes from the site when none is given", () => {
  assert.equal(cleanUrl("their-app.vercel.app"), "https://their-app.vercel.app/");
  assert.equal(cleanUrl("https://web.whatsapp.com"), "https://web.whatsapp.com/");
  for (const bad of ["", "hello", "javascript:alert(1)", "ftp://x.com", "two words.com"]) assert.equal(cleanUrl(bad), null, bad);
  assert.equal(appName("", "https://mail.zoho.in/"), "Zoho");
  assert.equal(appName("", "https://www.thinkhealth.in/"), "Thinkhealth");
  assert.equal(appName("", "https://books.zoho.co.in/"), "Zoho");
  assert.equal(appName("  AED   Tracker ", "https://x.vercel.app/"), "AED Tracker");
});

const call = async (m: { id: string; name: string } | null, method: "GET" | "POST" | "DELETE", body?: unknown, q = "") => {
  const req = new Request(`http://x/api/apps${q}`, { method, headers: { ...(m ? { "x-test-member": JSON.stringify(m) } : {}), "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const r = await { GET, POST, DELETE }[method](req);
  return { s: r.status, j: await r.json() };
};

test("applications on the main page: Admin adds and removes, everyone sees them, in the order added", async () => {
  assert.equal((await call(null, "GET")).s, 401);
  assert.equal((await call(arti, "POST", { url: "aed.vercel.app" })).s, 403);
  const a = await call(admin, "POST", { name: "AED Tracker", url: "aed.vercel.app" });
  assert.equal(a.s, 200);
  assert.equal((await call(admin, "POST", { url: "https://aed.vercel.app/" })).s, 409);
  assert.equal((await call(admin, "POST", { url: "not a site" })).s, 400);
  await call(admin, "POST", { url: "stock.thinkhealth.in" });
  const seen = await call(arti, "GET");
  assert.deepEqual(seen.j.apps.map((x: { name: string; url: string }) => [x.name, x.url]), [["AED Tracker", "https://aed.vercel.app/"], ["Thinkhealth", "https://stock.thinkhealth.in/"]]);
  assert.equal(seen.j.canEdit, false);
  assert.equal((await call(admin, "GET")).j.canEdit, true);
  const id = seen.j.apps[1].id;
  assert.equal((await call(admin, "POST", { action: "rename", id, name: "Stock" })).j.apps[1].name, "Stock");
  assert.equal((await call(arti, "DELETE", undefined, `?id=${id}`)).s, 403);
  assert.deepEqual((await call(admin, "DELETE", undefined, `?id=${id}`)).j.apps.map((x: { name: string }) => x.name), ["AED Tracker"]);
  assert.equal((await call(admin, "DELETE", undefined, `?id=${id}`)).s, 404);
});
