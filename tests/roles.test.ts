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

test("every member can change anything on an item, and nothing else in Quotations", async () => {
  const { GET, POST } = await import("@/app/api/quotations/route");
  const ask = (q: string, m: object = prashant) => GET(new Request(`http://x/api/quotations?${q}`, { headers: { "x-test-member": JSON.stringify(m) } }));
  for (const m of [prashant, { id: "a", name: "Arti Sirohi" }, { id: "b", name: "Someone New" }]) {
    assert.equal((await ask("items=1", m)).status, 200);
    assert.equal((await ask("wd=1", m)).status, 200);
    for (const q of ["q=&page=0", "customer=1", "email=1", "pdf=1", "ts=1", "zia=QT-1"]) assert.equal((await ask(q, m)).status, 403, q);
  }
  process.env.VERCEL_ENV = "production";
  const form = new FormData();
  form.set("brochure", "1");
  form.set("file", new File(["%PDF-1.4"], "a.pdf"));
  // Past the check, on to Zoho (not connected in the fake database): a PDF, a picture. Quotes and customers aren't for him.
  assert.equal((await POST(new Request("http://x/api/quotations", { method: "POST", headers: { "x-test-member": JSON.stringify(prashant) }, body: form }))).status, 502);
  const pic = new FormData();
  pic.set("picture", "1");
  pic.set("file", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])], "a.png"));
  assert.equal((await POST(new Request("http://x/api/quotations", { method: "POST", headers: { "x-test-member": JSON.stringify(prashant) }, body: pic }))).status, 502);
  const mail = new FormData();
  mail.set("estimateId", "1");
  mail.set("to", "a@example.com");
  mail.set("subject", "x");
  assert.equal((await POST(new Request("http://x/api/quotations", { method: "POST", headers: { "x-test-member": JSON.stringify(prashant) }, body: mail }))).status, 403);
  const json = (b: object) => POST(new Request("http://x/api/quotations", { method: "POST", headers: { "x-test-member": JSON.stringify(prashant), "content-type": "application/json" }, body: JSON.stringify(b) }));
  assert.equal((await json({ customerId: "1", lines: [{ itemId: "1", qty: 1, rate: 1 }] })).status, 403);
  assert.equal((await json({ newCustomer: { company: "x" } })).status, 403);
  assert.notEqual((await json({ editItem: { id: "1", fields: {} } })).status, 403);
});

test("the AED board's data is refused for him", async () => {
  const { GET } = await import("@/app/api/aed/route");
  const r = await GET(new Request("http://x/api/aed", { headers: { "x-test-member": JSON.stringify(prashant) } }));
  assert.equal(r.status, 403);
});

test("No. of People: corrected after scheduling, kept through completion, and undoable (owner, 5 Nov)", async () => {
  const { buildBoard, peopleOf, describeEvent } = await import("@/lib/pipeline");
  const base = { createdAt: "2026-10-01T00:00:00.000Z", customerId: "c1", customerName: "Acme", contacts: [], items: [{ name: "First Aid Training", qty: 20 }] };
  const pi = { ...base, salesorderId: "p1", number: "Performa-25-1", date: "2026-10-05", status: "open", total: 1000 };
  const ev = (id: string, at: string, e: object) => ({ id, at, by: "Shikha", cardIds: ["pi:p1"], ...e });
  const date = ev("e1", "2026-10-06T00:00:00.000Z", { kind: "set_training_date", value: "2026-10-10", trainers: ["Ashish"], location: "", email: "a@b.com", people: 20 });
  const fix = ev("e2", "2026-10-10T10:00:00.000Z", { kind: "set_people", people: 14, before: "20" });
  const done = ev("e3", "2026-10-10T12:00:00.000Z", { kind: "complete_training" });
  const card = (events: object[]) => buildBoard([], [], [pi as never], [], [], events as never).cards.get("pi:p1")!;
  assert.equal(peopleOf(card([date])), 20);
  const after = card([date, fix, done]);
  assert.equal(peopleOf(after), 14);
  assert.ok(after.schedule?.completed);
  assert.equal(after.schedule?.dates.join(), "2026-10-10"); // the date and trainers are untouched
  assert.deepEqual(after.schedule?.trainers, ["Ashish"]);
  assert.equal(peopleOf(card([date, { ...fix, revertedAt: "2026-10-11T00:00:00.000Z" }])), 20);
  assert.match(describeEvent(fix as never, (id) => id), /No\. of People changed from 20 to 14/);
});

test("Anuj Agarwal (owner, 10 Nov: \"access to everything\"): full access, quotes, every board; Admin's own things stay Admin's", async () => {
  const { boardsFor, canQuote, hasFullAccess, isAdmin } = await import("@/lib/roles");
  const anuj = { id: "anuj", name: "Anuj Agarwal" };
  assert.equal(hasFullAccess(anuj), true);
  assert.equal(canQuote(anuj), true);
  assert.equal(isAdmin(anuj), false);
  assert.deepEqual(boardsFor(anuj), ["training", "sales", "fire", "aed", "fulfil", "logistics"]);
});

test("the Progress tracker leaves out Admin and Anuj (owner, 10 Nov: \"remove this for him\"); everyone else stays", async () => {
  const { counts, offTracker } = await import("@/lib/progress/model");
  assert.equal(offTracker({ id: "admin", name: "Admin" }), true);
  assert.equal(offTracker({ id: "x1", name: "Anuj Agarwal" }), true);
  assert.equal(offTracker({ id: "x2", name: "Ashish" }), false);
  const now = new Date();
  const seen = new Date(now.getTime() - 60_000).toISOString();
  const team = [{ id: "x1", name: "Anuj Agarwal" }, { id: "x2", name: "Ashish" }];
  const presence = team.map((m) => ({ id: m.id, lastSeen: seen, seenAt: seen, at: seen }));
  assert.equal(counts(team, presence as never, [], now).active <= 1, true);
});
