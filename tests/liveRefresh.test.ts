// Live refresh (owner, 13 Nov: "whatever I do it should show up immediately"): the change counters, the routes that note a
// change, and a document the dashboard changed in Zoho written into our copies — on the fake database, Zoho never reached.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { bump, localVersion, versions, withBump } from "@/lib/changes";
import { goneFromList, putZohoDoc } from "@/lib/zohoSync";
import { putSalesDoc } from "@/lib/salesSync";
import { POST as storePost } from "@/app/api/store/route";
import { GET as changesGet } from "@/app/api/changes/route";
import { db } from "@/lib/db";
import { resetFakeDb } from "./fakes/db";

beforeEach(() => resetFakeDb());
const ashish = { "x-test-member": JSON.stringify({ id: "ashish", name: "Ashish" }), "content-type": "application/json" };

test("the counters: each topic counts on its own; the Zoho key folds in both syncs' versions and the local writes", async () => {
  assert.deepEqual(await versions(), { team: 0, work: 0, zoho: "0.0.0" });
  await bump("team");
  await bump("work", "local");
  const kv = (await db()).collection<{ _id: string } & Record<string, unknown>>("kv");
  await kv.replaceOne({ _id: "zoho_state" }, { version: 7 });
  await kv.replaceOne({ _id: "sales_state" }, { version: 3 });
  assert.deepEqual(await versions(), { team: 1, work: 1, zoho: "7.3.1" });
  assert.equal(await localVersion(), 1);
});

test("a route notes a change only when it succeeds", async () => {
  const ok = withBump(["work"], async () => Response.json({ ok: true }));
  const bad = withBump(["work"], async () => Response.json({ error: "no" }, { status: 400 }));
  await bad();
  assert.equal((await versions()).work, 0);
  await ok();
  assert.equal((await versions()).work, 1);
});

test("a team save bumps 'team'; /api/changes answers signed-in members only", async () => {
  const r = await storePost(new Request("http://x/api/store", { method: "POST", headers: ashish, body: JSON.stringify({ collection: "entries", upserts: [{ id: "e1", title: "Meeting", date: "2026-11-14" }] }) }));
  assert.equal(r.status, 200);
  assert.equal((await versions()).team, 1);
  assert.equal((await changesGet(new Request("http://x/api/changes"))).status, 401);
  assert.deepEqual(await (await changesGet(new Request("http://x/api/changes", { headers: ashish }))).json(), { team: 1, work: 0, zoho: "0.0.0" });
});

test("write-through: a training document goes into the Training copy as the sync stores it; void removes it; others skipped", async () => {
  const d = await db();
  await d.collection<{ _id: string; items: object[] }>("kv").replaceOne({ _id: "zoho_items" }, { items: [{ id: "cpr", name: "CPR Training (I)", identifier: "Training Services" }] });
  const so = { salesorder_id: "555", salesorder_number: "Performa-25-9", status: "open", date: "2099-11-13", last_modified_time: "2099-11-13T10:00:00+0530", customer_name: "The Grand", line_items: [{ item_id: "cpr", name: "CPR Training (I)", quantity: 30 }] };
  await putZohoDoc("salesorders", so);
  const stored = await d.collection<{ _id: string; kind: string; status: string; training: boolean; doc: { salesorder_number: string } }>("zohoDocs").findOne({ _id: "salesorders:555" });
  assert.deepEqual([stored?.kind, stored?.status, stored?.training, stored?.doc.salesorder_number], ["salesorders", "open", true, "Performa-25-9"]);
  await putZohoDoc("salesorders", { ...so, status: "void" });
  assert.equal(await d.collection<{ _id: string }>("zohoDocs").findOne({ _id: "salesorders:555" }), null);
  await putZohoDoc("salesorders", { ...so, salesorder_id: "556", line_items: [{ item_id: "pads", name: "AED pads" }] }); // nothing tracked on it
  assert.equal(await d.collection<{ _id: string }>("zohoDocs").findOne({ _id: "salesorders:556" }), null);
  await putSalesDoc("salesorders", so);
  const row = await d.collection<{ _id: string; row: { salesorder_number?: string; status?: string } }>("salesDocs").findOne({ _id: "salesorders:555" });
  assert.deepEqual([row?.row.salesorder_number, row?.row.status], ["Performa-25-9", "open"]);
});

test("deletions on the live sync: only what Zoho no longer lists, and only inside the span its one page covers", () => {
  const stored = [{ id: "1", date: "2026-11-13" }, { id: "2", date: "2026-11-12" }, { id: "3", date: "2026-11-10" }, { id: "4", date: "2026-10-01" }];
  const so = (id: string, date: string, status = "open") => ({ salesorder_id: id, date, status });
  // All of the window fit on the page: anything stored but not listed is gone (void counts as gone).
  assert.deepEqual(goneFromList(stored, [so("1", "2026-11-13"), so("3", "2026-11-10", "void"), so("4", "2026-10-01")], false, "2025-04-01", "salesorders"), ["2", "3"]);
  // More pages: only dates newer than the oldest listed row are judged (4 might be on page 2; so might another on 11-10).
  assert.deepEqual(goneFromList(stored, [so("1", "2026-11-13"), so("9", "2026-11-10")], true, "2025-04-01", "salesorders"), ["2"]);
  assert.deepEqual(goneFromList(stored, [], false, "2025-04-01", "salesorders"), ["1", "2", "3", "4"]);
});
