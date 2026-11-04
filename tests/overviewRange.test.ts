// The Overview's date button: what each choice covers and what it's compared with (src/lib/overviewRange.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRange, rangeDates, spanLabel } from "@/lib/overviewRange";
import { ymd } from "@/lib/dates";

const now = new Date(2026, 10, 4, 15, 0); // 4 Nov 2026
const days = (r: ReturnType<typeof rangeDates>) => [ymd(r.from), ymd(r.to), ymd(r.prevFrom), ymd(r.prevTo)];

test("this month: so far against the same days of last month, with its targets", () => {
  const r = rangeDates({ kind: "month" }, now);
  assert.deepEqual(days(r), ["2026-11-01", "2026-11-30", "2026-10-01", "2026-10-04"]);
  assert.equal(r.whole, true);
  assert.equal(r.past, false);
  assert.equal(r.label, "November");
});

test("this month on the 31st doesn't run past a shorter month before", () => {
  const r = rangeDates({ kind: "month" }, new Date(2026, 2, 31));
  assert.equal(ymd(r.prevTo), "2026-02-28");
});

test("last month: whole against whole, with its targets", () => {
  const r = rangeDates({ kind: "lastMonth" }, now);
  assert.deepEqual(days(r), ["2026-10-01", "2026-10-31", "2026-09-01", "2026-09-30"]);
  assert.equal(r.whole, true);
  assert.equal(r.past, true);
  // January: the year before.
  assert.deepEqual(days(rangeDates({ kind: "lastMonth" }, new Date(2026, 0, 15))), ["2025-12-01", "2025-12-31", "2025-11-01", "2025-11-30"]);
});

test("this quarter: so far against the same days of the quarter before, no monthly target", () => {
  const r = rangeDates({ kind: "quarter" }, now);
  assert.deepEqual(days(r), ["2026-10-01", "2026-12-31", "2026-07-01", "2026-08-04"]);
  assert.equal(r.whole, false);
  assert.equal(r.label, "Oct–Dec");
  assert.deepEqual(days(rangeDates({ kind: "quarter" }, new Date(2026, 0, 10))).slice(0, 3), ["2026-01-01", "2026-03-31", "2025-10-01"]);
});

test("custom: the same number of days just before; a whole month behaves like a month", () => {
  const r = rangeDates({ kind: "custom", from: "2026-10-10", to: "2026-10-19" }, now);
  assert.deepEqual(days(r), ["2026-10-10", "2026-10-19", "2026-09-30", "2026-10-09"]);
  assert.equal(r.whole, false);
  assert.equal(r.past, true);
  // Still running: only the days so far count.
  const on = rangeDates({ kind: "custom", from: "2026-11-02", to: "2026-11-20" }, now);
  assert.deepEqual(days(on).slice(2), ["2026-10-30", "2026-11-01"]);
  const sep = rangeDates({ kind: "custom", from: "2026-09-01", to: "2026-09-30" }, now);
  assert.equal(sep.whole, true);
  assert.deepEqual(days(sep).slice(2), ["2026-08-01", "2026-08-31"]);
});

test("what's stored is read forgivingly: anything odd is This month", () => {
  assert.deepEqual(parseRange(null), { kind: "month" });
  assert.deepEqual(parseRange("not json"), { kind: "month" });
  assert.deepEqual(parseRange('{"kind":"year"}'), { kind: "month" });
  assert.deepEqual(parseRange('{"kind":"custom","from":"2026-11-05","to":"2026-11-01"}'), { kind: "month" });
  assert.deepEqual(parseRange('{"kind":"custom","from":"20206-11-05","to":"2026-11-10"}'), { kind: "month" });
  assert.deepEqual(parseRange('{"kind":"quarter"}'), { kind: "quarter" });
  assert.deepEqual(parseRange('{"kind":"custom","from":"2026-11-01","to":"2026-11-05"}'), { kind: "custom", from: "2026-11-01", to: "2026-11-05" });
});

test("the comparison's label", () => {
  assert.equal(spanLabel(new Date(2026, 9, 1), new Date(2026, 9, 4)), "1–4 Oct");
  assert.equal(spanLabel(new Date(2026, 8, 30), new Date(2026, 9, 9)), "30 Sept – 9 Oct");
});
