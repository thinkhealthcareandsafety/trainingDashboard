// A quote or Performa deleted in Zoho clears what the coordinators' portal built on it (owner, 13 Nov: "basically fresh
// for them"; the login goes too unless they chose their own password). Fake database; Zoho never reached.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { docsGone, performaDeleted, quoteDeleted } from "@/lib/portalCleanup";
import { addPeople, markConfirmed, markZohoConfirmed, participants, propose, staffPortal, tick, trainingsFor } from "@/lib/portalTrainings";
import { indiaToday } from "@/lib/portalRules";
import { db } from "@/lib/db";
import { resetFakeDb } from "./fakes/db";

beforeEach(() => resetFakeDb());
const RIYA = "riya@grand.com";
type D = { _id: string } & Record<string, unknown>;
const c = async (n: string) => (await db()).collection<D>(n);

const seed = async (id = "1", number = "QT-1") => {
  await (await c("kv")).replaceOne({ _id: "zoho_items" }, { items: [{ id: "cpr", name: "CPR Training (I)", identifier: "Training Services" }] });
  await (await c("zohoDocs")).insertOne({ _id: `estimates:${id}`, kind: "estimates", training: true, doc: { estimate_id: id, estimate_number: number, status: "accepted", date: "2026-11-01", customer_name: "The Grand", customer_id: "77", line_items: [{ item_id: "cpr", name: "CPR Training (I)", quantity: 30, rate: 1500, item_total: 45000 }] } });
  await (await c("portalTrainings")).insertOne({ _id: id, customerId: "77", coordinator: { name: "Riya Mehta", email: RIYA, phone: "9800000000" } });
  await propose(RIYA, id, { dates: [{ date: indiaToday(), time: "10:00" }], tentative: false, location: "The Grand", headcount: 30 });
  await addPeople(RIYA, id, [{ name: "Asha Rao", phone: "9811111111" }], "typed");
  await markConfirmed(id, { at: "2026-11-13T09:00:00Z", by: "Ashish", salesorderId: `so${id}`, number: `Performa-${id}` });
  await markZohoConfirmed(id, "Ashish");
};
const login = async (own = false) => {
  await (await c("portalLogins")).insertOne({ _id: RIYA, name: "Riya", salt: "s", hash: "h", failed: 0, createdAt: "x", passwordSetAt: "x", ...(own ? { own: true } : {}) });
  await (await c("portalSessions")).insertOne({ _id: "sess1", email: RIYA, expires: "2099-01-01T00:00:00Z" });
};

test("Performa deleted: back to Accepted, attendance ticks and the QR cleared, the participants stay", async () => {
  await seed();
  await (await trainingsFor(RIYA)); // makes the attendance key
  await tick(RIYA, "1", "TH001", indiaToday(), true);
  assert.equal(await performaDeleted("so1"), 1);
  const [t] = await trainingsFor(RIYA);
  assert.deepEqual([t.stamp, t.locked, t.attendKey], ["Accepted", false, ""]);
  assert.equal(await (await c("portalAttendance")).countDocuments({}), 0);
  const r = await participants(RIYA, "1");
  assert.ok("list" in r && r.list.length === 1);
  assert.equal(await performaDeleted("so1"), 0); // nothing left to clear
});

test("quote deleted: the training leaves the portal and Trainings, archived; the login goes when it was their last and not their own", async () => {
  await seed();
  await login();
  assert.equal(await quoteDeleted("1"), true);
  assert.deepEqual(await trainingsFor(RIYA), []);
  assert.equal((await staffPortal(["1"])).size, 0);
  assert.equal(await (await c("portalParticipants")).countDocuments({}), 0);
  assert.equal(await (await c("portalLogins")).findOne({ _id: RIYA }), null);
  assert.equal(await (await c("portalSessions")).findOne({ _id: "sess1" }), null);
  const [arch] = await (await c("portalArchive")).find({}).toArray();
  assert.equal((arch.participants as unknown[]).length, 1);
  assert.equal((arch.training as { _id: string })._id, "1");
});

test("quote deleted: a password they chose stays, and so does the login while they have another training", async () => {
  await seed();
  await login(true);
  await quoteDeleted("1");
  assert.ok(await (await c("portalLogins")).findOne({ _id: RIYA }));

  resetFakeDb();
  await seed("1", "QT-1");
  await seed("2", "QT-2");
  await login();
  await quoteDeleted("1");
  assert.ok(await (await c("portalLogins")).findOne({ _id: RIYA }));
  assert.deepEqual((await trainingsFor(RIYA)).map((t) => t.number), ["QT-2"]);
});

test("docsGone: clears only what's built on the document; without a known deletion it asks Zoho first (unreachable here → nothing cleared)", async () => {
  await seed();
  await docsGone("estimates", ["1"]); // Zoho can't be asked in tests: not confirmed deleted, so nothing is touched
  assert.equal((await trainingsFor(RIYA)).length, 1);
  await docsGone("salesorders", ["so1"], true);
  assert.equal((await trainingsFor(RIYA))[0].stamp, "Accepted");
  await docsGone("estimates", ["1"], true);
  assert.equal((await trainingsFor(RIYA)).length, 0);
});
