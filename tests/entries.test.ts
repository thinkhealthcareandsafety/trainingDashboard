// Meetings / events marked done (owner, 3 Nov): Shikha's to-do while a past one isn't, Work done once it is.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CalendarEntry } from "@/lib/types";
import { buildAedBoard, buildBoard, buildFulfillmentBoard } from "@/lib/pipeline";
import { buildLogisticsBoard } from "@/lib/logistics";
import { buildDone, buildTodos } from "@/lib/progress/todos";
import { entryOverdue } from "@/lib/roles";

const team = [{ id: "shikha", name: "Shikha Dixit" }, { id: "sumit", name: "Sumit A Shah" }, { id: "admin", name: "Admin" }];
const board = buildBoard([], [], [], [], [], []);
const aedBoard = buildAedBoard([], [], []);
const ful = buildFulfillmentBoard(board, []);
const boards = { board, aedBoard, ful, logi: buildLogisticsBoard(board, ful, aedBoard, []) };
const entry = (id: string, date: string, more: Partial<CalendarEntry> = {}): CalendarEntry =>
  ({ id, type: "meeting", title: `Call ${id}`, date, startTime: "10:00", allDay: false, people: ["Sumit A Shah"], createdAt: "2026-11-01T00:00:00.000Z", ...more });
const today = "2026-11-05";
const todos = (es: CalendarEntry[]) => buildTodos(today, team, boards, es, [], [], new Date("2026-11-05T06:00:00Z"));

test("a past meeting not marked done is Shikha's \"Mark done\" (overdue); before 3 Nov, done, or upcoming it isn't", () => {
  const t = todos([entry("old", "2026-11-01"), entry("past", "2026-11-04"), entry("done", "2026-11-04", { doneAt: "2026-11-04T12:00:00Z", doneBy: "Sumit A Shah" }), entry("soon", "2026-11-06")]);
  const mark = t.filter((x) => x.tag === "Mark done");
  assert.deepEqual(mark.map((x) => [x.who, x.title, x.bucket]), [["shikha", "Call past", "overdue"]]);
  // The people in an upcoming meeting still see it; a done one drops off.
  assert.deepEqual(t.filter((x) => x.tag === "Meeting").map((x) => [x.who, x.title]), [["sumit", "Call soon"]]);
  assert.equal(entryOverdue(entry("today", today), today), false);
});

test("marked done early: off everyone's list", () => {
  const t = todos([entry("soon", "2026-11-06", { doneAt: "2026-11-05T05:00:00Z", doneBy: "Shikha Dixit" })]);
  assert.equal(t.length, 0);
});

test("Work done: a meeting marked done counts for whoever marked it", () => {
  const done = buildDone(team, [], () => undefined, [], new Date("2026-11-05T06:00:00Z"), [entry("past", "2026-11-04", { doneAt: "2026-11-05T05:00:00Z", doneBy: "Shikha Dixit" })]);
  assert.deepEqual(done.map((d) => [d.who, d.tag, d.title]), [["shikha", "Meeting done", "Call past"]]);
});
