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
