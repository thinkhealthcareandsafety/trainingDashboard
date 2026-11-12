// Accept date → Performa (owner, 12 Nov): the rules, the confirmed state, and the routes — Zoho is never reached in tests.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { acceptDefaults, fieldsFromZoho, piEmail, readPiEdit, trainingNote, zohoCustomFields } from "@/lib/performaRules";
import { markConfirmed, propose, staffPortal, trainingsFor } from "@/lib/portalTrainings";
import { POST as tmPost, GET as tmGet } from "@/app/api/training-management/route";
import { db } from "@/lib/db";
import { resetFakeDb } from "./fakes/db";

beforeEach(() => resetFakeDb());
const RIYA = "riya@grand.com";
const proposal = { dates: [{ date: "2099-12-04", time: "10:00" }, { date: "2099-12-05", time: "" }], tentative: true, location: "The Grand · Ballroom 2", headcount: 36, at: "2026-11-12T08:00:00Z", by: RIYA };

test("defaults on Accept: today's PO date, Verbal, Training, the first day as Training Date, the coordinator's headcount", () => {
  const d = acceptDefaults(proposal, "2026-11-12");
  assert.deepEqual(d.fields, { poDate: "2026-11-12", trainer: "None", poNumber: "Verbal", trainingDate: "2099-12-04", leadSource: "", businessType: "Autofill", productType: "Training" });
  assert.equal(d.trainingQty, 36);
  assert.match(d.note, /^Training: Fri, 4 Dec 2099, 10:00 am \+ Sat, 5 Dec 2099 \(tentative\) · The Grand · Ballroom 2 · 36 people$/);
  assert.equal(acceptDefaults(null, "2026-11-12").trainingQty, null);
  assert.equal(trainingNote({ ...proposal, tentative: false }).includes("tentative"), false);
});

test("custom fields go to Zoho spelt as Zoho has them; read back trimmed-equal; empty ones left out", () => {
  const out = zohoCustomFields({ trainer: "sumit shah", productType: "Training", leadSource: "", poNumber: "Verbal" });
  assert.deepEqual(out, [
    { customfield_id: "982417000020925027", value: "Sumit Shah " },
    { customfield_id: "982417000020925143", value: "Training " },
    { customfield_id: "982417000003206201", value: "Verbal" },
  ]);
  const back = fieldsFromZoho([{ customfield_id: "982417000020925027", value: "Sumit Shah " }, { customfield_id: "982417000020925037", value: "2099-12-04" }]);
  assert.equal(back.trainer, "Sumit Shah ");
  assert.equal(back.trainingDate, "2099-12-04");
  assert.equal(back.poNumber, "");
});

test("an edit is checked: PO date required, dropdowns from the list, dates as dates, quantities above 0", () => {
  const good = { date: "2026-11-12", shipmentDate: "", notes: "n", fields: { poDate: "2026-11-12", trainer: "Other", trainingDate: "2099-12-04" }, lines: [{ lineItemId: "123", description: "d", qty: 36, rate: 1500 }] };
  const r = readPiEdit(good);
  assert.ok(!("error" in r) && r.lines[0].qty === 36);
  const err = (patch: object) => (readPiEdit({ ...good, ...patch }) as { error: string }).error;
  assert.match(err({ fields: { ...good.fields, poDate: "" } }), /required/);
  assert.match(err({ fields: { ...good.fields, trainer: "Nobody" } }), /from the list/);
  assert.match(err({ fields: { ...good.fields, trainingDate: "4 Dec" } }), /pick a date/);
  assert.match(err({ lines: [{ lineItemId: "123", qty: 0, rate: 1 }] }), /more than 0/);
  assert.match(err({ lines: [{ lineItemId: "x", qty: 1, rate: 1 }] }), /Reopen/);
  assert.match(err({ lines: [] }), /needs its lines/);
});

test("the Performa email fills in the training", () => {
  const m = piEmail({ subject: "Performa {number} · {training}", body: "{hi}\n\n[On: {dates}\n][At: {location}\n]{sign}" }, { name: "Riya Mehta", number: "Performa-25-1", quote: "QT-1", training: "CPR", dates: "Fri, 4 Dec", location: "", people: "36", total: "₹1", sign: "Warm regards" });
  assert.equal(m.subject, "Performa Performa-25-1 · CPR");
  assert.equal(m.text, "Dear Riya,\n\nOn: Fri, 4 Dec\nWarm regards");
});

const seed = async () => {
  const d = await db();
  await d.collection<{ _id: string; items: object[] }>("kv").replaceOne({ _id: "zoho_items" }, { items: [{ id: "cpr", name: "CPR Training (I)", identifier: "Training Services" }] }, { upsert: true });
  await d.collection<{ _id: string } & Record<string, unknown>>("zohoDocs").insertOne({ _id: "estimates:1", kind: "estimates", training: true, doc: { estimate_id: "1", estimate_number: "QT-1", status: "sent", date: "2026-11-01", customer_name: "The Grand", customer_id: "77", line_items: [{ item_id: "cpr", name: "CPR Training (I)", quantity: 40, rate: 1500, item_total: 60000 }] } });
  await d.collection<{ _id: string } & Record<string, unknown>>("portalTrainings").insertOne({ _id: "1", customerId: "77", coordinator: { name: "Riya Mehta", email: RIYA, phone: "9800000000" } });
};
const ashish = { "x-test-member": JSON.stringify({ id: "ashish", name: "Ashish" }), "content-type": "application/json" };
const post = (body: object) => tmPost(new Request("http://x/api/training-management", { method: "POST", headers: ashish, body: JSON.stringify(body) }));

test("confirmed: the portal stamps it, the coordinator can't change the date any more, Trainings says Confirmed", async () => {
  await seed();
  assert.ok("proposal" in (await propose(RIYA, "1", proposal)));
  await markConfirmed("1", { at: "2026-11-12T10:00:00Z", by: "Ashish", salesorderId: "999", number: "Performa-25-1" });
  const [t] = await trainingsFor(RIYA);
  assert.equal(t.stamp, "Confirmed");
  assert.equal(t.confirmedAt, "2026-11-12T10:00:00Z");
  assert.equal(((await propose(RIYA, "1", { ...proposal, headcount: 30 })) as { status: number }).status, 409);
  assert.equal((await staffPortal(["1"])).get("1")?.status, "Confirmed");
});

test("routes: Accept needs a proposal and makes nothing when Zoho can't be reached; no Performa yet → 404; email only from the live site", async () => {
  await seed();
  assert.equal((await post({ action: "accept", id: "1" })).status, 400);
  await propose(RIYA, "1", proposal);
  // Tests never reach Zoho: Accept fails safely and the training is not marked confirmed.
  assert.equal((await post({ action: "accept", id: "1" })).status, 502);
  assert.equal((await staffPortal(["1"])).get("1")?.status, "Date proposed");
  assert.equal((await post({ action: "pisave", id: "1", edit: {} })).status, 404);
  assert.equal((await tmGet(new Request("http://x/api/training-management?pi=1", { headers: ashish }))).status, 404);
  await markConfirmed("1", { at: "2026-11-12T10:00:00Z", by: "Ashish", salesorderId: "999", number: "Performa-25-1" });
  assert.equal((await post({ action: "piemail", id: "1", to: RIYA, subject: "s", text: "t" })).status, 409);
  assert.equal((await post({ action: "accept", id: "1" })).status, 409);
});
