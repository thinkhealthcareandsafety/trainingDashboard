// Live sync (owner, 12 Nov: "every minute, keep the limit 2500"): each minute 9 am–8 pm IST Mon–Sat, paced to the limit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { liveSyncDue, nextLiveSync, paceAllowance } from "../src/lib/zohoSync";

// IST = UTC + 5:30. Thu 12 Nov 2026.
const ist = (hhmm: string, day = "2026-11-12") => Date.parse(`${day}T${hhmm}:00+05:30`);

test("the pace: 400 calls at 9 am, rising evenly to 95% of the limit by 8 pm", () => {
  assert.equal(paceAllowance(ist("09:00"), 2500), 400);
  assert.equal(Math.round(paceAllowance(ist("14:30"), 2500)), Math.round(400 + (2375 - 400) * 0.5));
  assert.equal(paceAllowance(ist("20:00"), 2500), 2375);
  assert.equal(paceAllowance(ist("07:00"), 2500), 400);
});

test("due each minute in the day while under the pace; never on Sunday, before 9 or from 8 pm", () => {
  const now = ist("11:00");
  assert.equal(liveSyncDue(new Date(now - 61_000).toISOString(), 300, now, 2500), true);
  assert.equal(liveSyncDue(new Date(now - 30_000).toISOString(), 300, now, 2500), false); // less than a minute
  assert.equal(liveSyncDue(new Date(now - 61_000).toISOString(), 1200, now, 2500), false); // ahead of the pace: waits
  assert.equal(liveSyncDue(undefined, 0, ist("08:59"), 2500), false);
  assert.equal(liveSyncDue(undefined, 0, ist("20:00"), 2500), false);
  assert.equal(liveSyncDue(undefined, 0, ist("11:00", "2026-11-15"), 2500), false); // Sunday
});

test("next sync: a minute after the last one in the day; 9 am on the next sync day after hours", () => {
  const now = ist("11:00");
  assert.equal(nextLiveSync(new Date(now - 20_000).toISOString(), now), now + 40_000);
  assert.equal(nextLiveSync(undefined, now), now);
  assert.equal(nextLiveSync(undefined, ist("21:00")), ist("09:00", "2026-11-13"));
});
