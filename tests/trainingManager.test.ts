import { test } from "node:test";
import assert from "node:assert/strict";
import { isTrainingOnly, toTrainingQuote, trainingName } from "../src/lib/trainingManager";

const T = new Set(["cpr", "fa"]);
const doc = (lines: { item_id: string; name: string; quantity?: number }[]) => ({
  estimate_id: "1", estimate_number: "QT-00123", date: "2026-11-10", status: "sent", customer_name: "The Grand", total: 5000,
  contact_persons_details: [{ first_name: "Riya", last_name: "Mehta", email: "riya@example.com", mobile: "9800000000", is_primary_contact: true }],
  line_items: lines.map((l) => ({ ...l, description: "Hands-on CPR", rate: 100, item_total: 100 * (l.quantity ?? 1) })),
});

test("training-only: every line a training item, travel aside", () => {
  assert.equal(isTrainingOnly(doc([{ item_id: "cpr", name: "CPR (I)" }, { item_id: "x", name: "Travel and conveyance" }]), T), true);
  assert.equal(isTrainingOnly(doc([{ item_id: "cpr", name: "CPR (I)" }, { item_id: "aed", name: "AED Philips" }]), T), false);
  assert.equal(isTrainingOnly(doc([{ item_id: "x", name: "Travel" }]), T), false);
});

test("the client-facing name drops (I); expected = the training line's quantity", () => {
  assert.equal(trainingName("First Aid Training (I)"), "First Aid Training");
  const q = toTrainingQuote(doc([{ item_id: "cpr", name: "CPR (I)", quantity: 40 }, { item_id: "x", name: "Travel" }]), T);
  assert.deepEqual(q.lines.map((l) => l.name), ["CPR"]);
  assert.equal(q.expected, 40);
  assert.equal(q.contact?.name, "Riya Mehta");
  assert.equal(q.contact?.phone, "9800000000");
});
