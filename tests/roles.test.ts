// Prashant Sawale (owner, 5 Nov): no Follow-ups for now, and nothing he could change on a board.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boardsFor, canQuote, canWriteEvent, hasFollowUps } from "@/lib/roles";

const prashant = { id: "p1", name: "Prashant Sawale" };

test("Prashant has no boards, no Follow-ups and no Quotations", () => {
  assert.deepEqual(boardsFor(prashant), []);
  assert.equal(hasFollowUps(prashant), false);
  assert.equal(canQuote(prashant), false);
});

test("the server refuses his changes on every kind of card", () => {
  for (const id of ["training-1", "aed:1", "sale:1"]) assert.equal(canWriteEvent(prashant, { kind: "add_note", cardIds: [id] }), false, id);
});

test("everyone else keeps Follow-ups", () => {
  for (const name of ["Shikha", "Pranjal Nikalje", "Priyanka", "Arti Sirohi", "Shreya", "Someone New"]) assert.equal(hasFollowUps({ id: "x", name }), true, name);
});

test("everyone may look at the items, and only at the items", async () => {
  const { GET, POST } = await import("@/app/api/quotations/route");
  const ask = (q: string, m: object = prashant) => GET(new Request(`http://x/api/quotations?${q}`, { headers: { "x-test-member": JSON.stringify(m) } }));
  for (const m of [prashant, { id: "a", name: "Arti Sirohi" }, { id: "b", name: "Someone New" }]) {
    assert.equal((await ask("items=1", m)).status, 200);
    for (const q of ["q=&page=0", "customer=1", "email=1", "pdf=1", "ts=1", "wd=1", "zia=QT-1"]) assert.equal((await ask(q, m)).status, 403, q);
  }
  process.env.VERCEL_ENV = "production";
  const form = new FormData();
  form.set("brochure", "1");
  form.set("file", new File(["%PDF-1.4"], "a.pdf"));
  assert.equal((await POST(new Request("http://x/api/quotations", { method: "POST", headers: { "x-test-member": JSON.stringify(prashant) }, body: form }))).status, 403);
  const edit = await POST(new Request("http://x/api/quotations", { method: "POST", headers: { "x-test-member": JSON.stringify(prashant), "content-type": "application/json" }, body: JSON.stringify({ editItem: { id: "1", fields: {} } }) }));
  assert.equal(edit.status, 403);
});

test("the AED board's data is refused for him", async () => {
  const { GET } = await import("@/app/api/aed/route");
  const r = await GET(new Request("http://x/api/aed", { headers: { "x-test-member": JSON.stringify(prashant) } }));
  assert.equal(r.status, 403);
});
