// /api/store against the in-memory fake database (tests/fakes) — the change log's server checks.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "@/app/api/store/route";
import { db } from "@/lib/db";
import { resetFakeDb } from "./fakes/db";

const admin = { id: "admin", name: "Admin" };
const post = async (upserts: unknown[]) => {
  const req = new Request("http://x/api/store", { method: "POST", headers: { "x-test-member": JSON.stringify(admin), "content-type": "application/json" }, body: JSON.stringify({ collection: "cardEvents", upserts }) });
  return (await POST(req)).json();
};
const merge = { id: "m1", kind: "merge", cardIds: ["sale:quote:q1", "sale:pi:p1"], at: "2026-10-30T14:39:21.457Z", by: "Admin", mode: "all" };
// What an old tab (before the fix) writes for that merge: the Training board never holds sale: cards.
const notice = { id: "zoho:m1", kind: "zoho_change", ref: "m1", cardIds: merge.cardIds, at: "2026-10-31T03:30:00.000Z", by: "Zoho Books", value: "Quotation-24-1 is no longer in Zoho Books …" };

beforeEach(() => resetFakeDb());

test("a \"no longer in Zoho Books\" notice on Sales board cards is refused (31 Oct: 2,650 false ones); the merge itself is kept", async () => {
  assert.equal((await post([merge])).upserted, 1);
  assert.equal((await post([notice])).upserted, 0);
  const kept = await (await db()).collection<{ _id: string; kind: string }>("cardEvents").find({}).toArray();
  assert.deepEqual(kept.map((e) => e.kind), ["merge"]);
});

test("a training date with a typed 5-digit year (2 Nov: \"20206-11-03T11:00\") is refused; a real one is kept", async () => {
  const at = "2026-11-02T04:01:40.682Z";
  assert.equal((await post([{ id: "d1", kind: "set_training_date", cardIds: ["aed:1"], value: "20206-11-03T11:00", at, by: "Admin" }])).upserted, 0);
  // A real date passes the rule (kept dates start the reminder step, which only runs on the real server — so checked here directly).
  const { goodTrainingDate } = await import("@/lib/roles");
  for (const v of ["2026-11-03T11:00", "2026-11-03", "TBD", "2026-11-03T10:00,2026-11-04T10:00"]) assert.ok(goodTrainingDate(v), v);
  for (const v of ["20206-11-03T11:00", "2026-1-3", "Invalid Date"]) assert.ok(!goodTrainingDate(v), v);
});
