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

test("the AED board's data is refused for him", async () => {
  const { GET } = await import("@/app/api/aed/route");
  const r = await GET(new Request("http://x/api/aed", { headers: { "x-test-member": JSON.stringify(prashant) } }));
  assert.equal(r.status, 403);
});
