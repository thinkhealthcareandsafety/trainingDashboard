// Mark confirmed → the Training board (owner, 13 Nov): the entries it writes, when it leaves the board alone, and how the
// board reads them back. Pure: nothing is written to any database here.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent, ZohoPI, ZohoQuote } from "@/lib/types";
import { buildBoard } from "@/lib/pipeline";
import { TENTATIVE_NOTE, boardDateValue, boardScheduleEvents, type BoardScheduleInput } from "@/lib/boardSchedule";
import { datesInfo, reminderRecipients } from "@/lib/reminderPlan";

const input: BoardScheduleInput = {
  estimateId: "q1", salesorderId: "p1", quoteNumber: "Quotation-24-1", piNumber: "Performa-25-1", customerId: "c1",
  proposal: { dates: [{ date: "2099-12-05", time: "" }, { date: "2099-12-04", time: "10:00" }], tentative: false, location: "  The Grand ·  Ballroom 2 ", headcount: 36 },
  coordinator: { name: "Riya  Mehta", email: "riya@grand.com", phone: "98000 00000" },
  trainers: ["Ravi (external)", "Sumit A Shah"],
  quoteCard: { id: "quote:q1" },
  by: "Ashish", at: "2099-11-13T10:00:00.000Z",
};
const plan = (patch: Partial<BoardScheduleInput>) => boardScheduleEvents({ ...input, ...patch });
const events = (patch: Partial<BoardScheduleInput> = {}) => {
  const p = plan(patch);
  assert.ok("events" in p, "skip" in p ? p.skip : "");
  return p.events;
};

test("the date value: each day with its time, sorted, no repeats", () => {
  assert.equal(boardDateValue(input.proposal.dates), "2099-12-04T10:00,2099-12-05");
  assert.equal(boardDateValue([{ date: "2099-12-04", time: "" }, { date: "2099-12-04", time: "" }]), "2099-12-04");
});

test("writes the merge, then the date with the location, email, phone, headcount and the trainers (ours first); the name when there's none", () => {
  const evs = events();
  assert.deepEqual(evs.map((e) => e.kind), ["merge", "set_training_date", "set_concerned_name"]);
  assert.deepEqual(evs[0], { at: input.at, by: "Ashish", cardIds: ["quote:q1", "pi:p1"], kind: "merge", before: "Quotation-24-1", value: "Performa-25-1" });
  assert.deepEqual(evs[1], { at: input.at, by: "Ashish", cardIds: ["pi:p1"], kind: "set_training_date", value: "2099-12-04T10:00,2099-12-05", trainers: ["Sumit A Shah", "Ravi (external)"], location: "The Grand · Ballroom 2", email: "riya@grand.com", phone: "98000 00000", people: 36 });
  assert.deepEqual(evs[2], { at: input.at, by: "Ashish", cardIds: ["pi:p1"], ref: "c1", kind: "set_concerned_name", value: "Riya Mehta", before: "" });
});

test("a tentative date gets a note; an existing concerned person's name is left alone", () => {
  const evs = events({ proposal: { ...input.proposal, tentative: true }, quoteCard: { id: "quote:q1", concernedName: "Mr Rao" } });
  assert.deepEqual(evs.map((e) => e.kind), ["merge", "set_training_date", "add_note"]);
  assert.equal(evs[2].value, TENTATIVE_NOTE);
});

test("quote not on the board yet: still merged and scheduled, but the name isn't guessed", () => {
  assert.deepEqual(events({ quoteCard: null }).map((e) => e.kind), ["merge", "set_training_date"]);
});

test("a quotation already merged into another card isn't merged again", () => {
  assert.deepEqual(events({ quoteCard: { id: "pi:other" } }).map((e) => e.kind), ["set_training_date", "set_concerned_name"]);
});

test("left alone: a date already on the board, no coordinator email, no date", () => {
  assert.match((plan({ quoteCard: { id: "quote:q1", scheduled: "2099-12-01" } }) as { skip: string }).skip, /already has a date for Quotation-24-1 \(2099-12-01\)/);
  assert.match((plan({ coordinator: undefined }) as { skip: string }).skip, /no coordinator email/);
  assert.match((plan({ proposal: { ...input.proposal, dates: [] } }) as { skip: string }).skip, /no date/);
});

test("the board reads it back: one card, scheduled on the coordinator's days, their details; reminders go to our trainers only", () => {
  const base = { createdAt: "2099-11-01T00:00:00.000Z", customerId: "c1", customerName: "The Grand", contacts: [], items: [{ name: "CPR Training", qty: 36 }] };
  const quote = { ...base, estimateId: "q1", number: "Quotation-24-1", date: "2099-11-01", status: "accepted", total: 1000 } as unknown as ZohoQuote;
  const pi = { ...base, salesorderId: "p1", number: "Performa-25-1", date: "2099-11-13", status: "open", reference: "Quotation-24-1", total: 1000 } as unknown as ZohoPI;
  const evs = events().map((e, i) => ({ ...e, id: `e${i}` }) as CardEvent);
  const board = buildBoard([], [quote], [pi], [], [], evs);
  assert.equal(board.cards.get("quote:q1")?.mergedInto, "pi:p1");
  const card = board.cards.get("pi:p1")!;
  assert.ok(card.historyIds.includes("quote:q1"));
  assert.equal(card.schedule?.status, "scheduled");
  assert.deepEqual(card.schedule?.dates, ["2099-12-04T10:00", "2099-12-05"]);
  assert.deepEqual(card.schedule?.trainers, ["Sumit A Shah", "Ravi (external)"]);
  assert.equal(card.schedule?.people, 36);
  assert.equal(card.certLocation, "The Grand · Ballroom 2");
  assert.equal(card.concernedEmail, "riya@grand.com");
  assert.equal(card.concernedPhone, "98000 00000");
  assert.equal(card.concernedName, "Riya Mehta");
  // Reminder emails go to our trainers only (an external name has no email): never the client.
  assert.deepEqual(reminderRecipients(card.schedule?.trainers ?? [], false).map((r) => r.email), ["sshah@thinkhealth.in"]);
  assert.ok(datesInfo(evs));
});
