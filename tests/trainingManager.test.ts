import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPhone, coordinatorRecipients, isTrainingOnly, readCoordinator, toTrainingQuote, trainingName } from "../src/lib/trainingManager";

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


test("coordinator: a name (first alone is enough), a real email and a 10-digit mobile (+91 / 0 dropped)", () => {
  assert.equal(cleanPhone("+91 98765 43210"), "9876543210");
  assert.equal(cleanPhone("09876543210"), "9876543210");
  assert.equal(cleanPhone("12345"), "");
  assert.deepEqual(readCoordinator({ name: " Riya  Mehta ", email: "Riya@Hotel.com", phone: "+919876543210" }), { firstName: "Riya", lastName: "Mehta", email: "riya@hotel.com", phone: "9876543210" });
  assert.deepEqual(readCoordinator({ name: "Riya", email: "riya@hotel.com", phone: "9876543210" }), { firstName: "Riya", lastName: "", email: "riya@hotel.com", phone: "9876543210" });
  assert.match((readCoordinator({ name: " ", email: "riya@hotel.com", phone: "9876543210" }) as { error: string }).error, /name/);
  assert.match((readCoordinator({ name: "Riya Mehta", email: "riya@", phone: "9876543210" }) as { error: string }).error, /email/);
  assert.match((readCoordinator({ name: "Riya Mehta", email: "riya@hotel.com", phone: "123" }) as { error: string }).error, /10-digit/);
});

test("it goes to the coordinator first; everyone else picked is copied, once", () => {
  assert.deepEqual(coordinatorRecipients(["a@x.com", "riya@hotel.com"], ["b@x.com", "A@x.com"], "Riya@Hotel.com"), { to: ["riya@hotel.com"], cc: ["a@x.com", "b@x.com"] });
  assert.deepEqual(coordinatorRecipients([], [], "riya@hotel.com"), { to: ["riya@hotel.com"], cc: [] });
});

test("the Training board's items: Stress Management counts, with or without (I) and either spelling", async () => {
  const { isQuoteTrainingItem, itemSets } = await import("../src/lib/zoho");
  assert.equal(isQuoteTrainingItem("Stress Management Training (Customised)"), true);
  assert.equal(isQuoteTrainingItem("Stress Management Training (Customized) (I)"), true);
  assert.equal(isQuoteTrainingItem("THCAS CPR Training 2026"), true);
  assert.equal(isQuoteTrainingItem("Stress ball"), false);
  const sets = itemSets([{ id: "s1", name: "stress management training (customised)" }, { id: "x", name: "Zoll AED Plus" }] as never);
  assert.deepEqual([...sets.quoteTraining], ["s1"]);
});
