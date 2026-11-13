// Attendance on the day (owner, 13 Nov; docs/TRAINING_MANAGER_PLAN.md "Next: Attendance and Quiz", Step A): the rules,
// then the whole flow on the fake database — the fixed QR, mobile number, walk-ins, Present, the coordinator's ticks.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { attendCookieName, attendanceWindow, currentDates, datesFromBoard, presentByDay, readAttendCookie, registrationOpen, tickableDay } from "@/lib/attendanceRules";
import { indiaToday } from "@/lib/portalRules";
import { attendIdentify, attendInfo, attendPresent, attendRegister, join, joinInfo, markConfirmed, markZohoConfirmed, newAttendKey, participantPage, participants, removePerson, staffParticipants, staffPortal, tick, trainingsFor, addPeople } from "@/lib/portalTrainings";
import { GET as attendGet, POST as attendPost } from "@/app/api/portal/attend/route";
import { db } from "@/lib/db";
import { resetFakeDb } from "./fakes/db";

beforeEach(() => resetFakeDb());
const RIYA = "riya@grand.com";
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/* ---------------- Rules ---------------- */

test("the attendance window: open all day on each training day, shut before, between and after", () => {
  const days = ["2026-12-04", "2026-12-06"];
  assert.deepEqual(attendanceWindow(days, "2026-12-01"), { state: "before", next: "2026-12-04", of: 2 });
  assert.deepEqual(attendanceWindow(days, "2026-12-04"), { state: "open", day: "2026-12-04", dayNo: 1, of: 2 });
  assert.deepEqual(attendanceWindow(days, "2026-12-05"), { state: "before", next: "2026-12-06", of: 2 });
  assert.deepEqual(attendanceWindow(days, "2026-12-06"), { state: "open", day: "2026-12-06", dayNo: 2, of: 2 });
  assert.deepEqual(attendanceWindow(days, "2026-12-07"), { state: "after", last: "2026-12-06", of: 2 });
  assert.deepEqual(attendanceWindow([], "2026-12-07"), { state: "none", of: 0 });
  assert.equal(registrationOpen(days, "2026-12-06"), true);
  assert.equal(registrationOpen(days, "2026-12-07"), false);
  assert.equal(registrationOpen([], "2026-12-07"), true);
});

test("dates follow the board after Mark confirmed; a moved date keeps the coordinator's struck through; TBD shuts it", () => {
  const mine = [{ date: "2026-12-04", time: "10:00" }];
  assert.deepEqual(currentDates(mine, false, { status: "postponed", dates: ["2026-12-10"], trainers: [] }).dates, mine); // not confirmed: theirs
  assert.deepEqual(currentDates(mine, true, null).dates, mine); // not on the board yet: theirs
  const same = currentDates(mine, true, { status: "scheduled", dates: ["2026-12-04T10:00"], trainers: ["Sumit A Shah"] });
  assert.deepEqual([same.dates, same.was, same.trainers], [mine, null, ["Sumit A Shah"]]);
  const moved = currentDates(mine, true, { status: "postponed", dates: ["2026-12-11T09:30", "2026-12-12"], trainers: [], completedAt: "2026-12-12T12:00:00Z" });
  assert.deepEqual(moved.dates, [{ date: "2026-12-11", time: "09:30" }, { date: "2026-12-12", time: "" }]);
  assert.deepEqual(moved.was, mine);
  assert.equal(moved.completedAt, "2026-12-12T12:00:00Z");
  const tbd = currentDates(mine, true, { status: "tbd", dates: [], trainers: [] });
  assert.deepEqual([tbd.dates, tbd.tbd], [[], true]);
  assert.deepEqual(datesFromBoard(["2026-12-05", "2026-12-04T10:00", "2026-12-05"]), [{ date: "2026-12-04", time: "10:00" }, { date: "2026-12-05", time: "" }]);
});

test("ticks: a day that has come; counts per day; the cookie is per training and only holds a TH number and token", () => {
  assert.equal(tickableDay(["2026-12-04"], "2026-12-04", "2026-12-04"), true);
  assert.equal(tickableDay(["2026-12-04"], "2026-12-04", "2026-12-03"), false);
  assert.equal(tickableDay(["2026-12-04"], "2026-12-05", "2026-12-09"), false);
  assert.deepEqual(presentByDay([{ day: "2026-12-04" }, { day: "2026-12-04" }, { day: "2026-12-05" }], ["2026-12-04", "2026-12-05"]), [{ day: "2026-12-04", present: 2 }, { day: "2026-12-05", present: 1 }]);
  assert.equal(attendCookieName("982417000001"), "th_att_982417000001");
  assert.deepEqual(readAttendCookie("a=1; th_att_1=TH007.abcDEF123; b=2", "1"), { th: "TH007", token: "abcDEF123" });
  assert.equal(readAttendCookie("th_att_1=TH007.abc; x", "2"), null);
  assert.equal(readAttendCookie("th_att_1=<script>", "1"), null);
});

/* ---------------- The flow ---------------- */

const seed = async (days: string[]) => {
  const d = await db();
  await d.collection<{ _id: string; items: object[] }>("kv").replaceOne({ _id: "zoho_items" }, { items: [{ id: "cpr", name: "CPR & AED Training (I)", identifier: "Training Services" }] }, { upsert: true });
  await d.collection<{ _id: string } & Record<string, unknown>>("zohoDocs").insertOne({
    _id: "estimates:1", kind: "estimates", training: true,
    doc: { estimate_id: "1", estimate_number: "QT-1", status: "accepted", date: "2026-11-01", customer_name: "The Grand", customer_id: "77", total: 45000, line_items: [{ item_id: "cpr", name: "CPR & AED Training (I)", description: "Hands-on CPR", quantity: 30, rate: 1500, item_total: 45000 }] },
  });
  await d.collection<{ _id: string } & Record<string, unknown>>("portalTrainings").insertOne({
    _id: "1", customerId: "77", coordinator: { name: "Riya Mehta", email: RIYA, phone: "9800000000" }, joinKey: "joinkey123",
    proposal: { dates: days.map((date) => ({ date, time: "10:00" })), tentative: false, location: "The Grand · Ballroom 2", headcount: 30, at: "2026-11-12T08:00:00Z", by: RIYA },
  });
  await addPeople(RIYA, "1", [{ name: "Asha Rao", phone: "9811111111" }, { name: "Vikram Shah", phone: "9822222222" }], "typed");
};
const confirm = async () => {
  await markConfirmed("1", { at: "2026-11-12T10:00:00Z", by: "Ashish", salesorderId: "999", number: "Performa-25-1" });
  await markZohoConfirmed("1", "Ashish");
  const [t] = await trainingsFor(RIYA);
  return t;
};

test("no attendance QR until Mark confirmed; then a fixed key, and the panel knows it's the day", async () => {
  const today = indiaToday();
  await seed([today]);
  let [t] = await trainingsFor(RIYA);
  assert.equal(t.attendKey, "");
  await markConfirmed("1", { at: "2026-11-12T10:00:00Z", by: "Ashish", salesorderId: "999", number: "Performa-25-1" });
  [t] = await trainingsFor(RIYA);
  assert.equal(t.attendKey, ""); // a draft Performa isn't confirmed yet
  t = await confirm();
  assert.match(t.attendKey, /^[\w-]{10,}$/);
  assert.equal((await trainingsFor(RIYA))[0].attendKey, t.attendKey); // fixed: the same key every time
  assert.deepEqual(t.window, { state: "open", day: today, dayNo: 1, of: 1 });
  assert.equal(t.stamp, "Confirmed");
});

test("on the day: mobile number → them; walk-in → registered and tagged; Present ticks once; the coordinator sees it", async () => {
  const today = indiaToday();
  await seed([today]);
  const { attendKey: k } = await confirm();
  assert.equal(await attendInfo("QT-1", "wrong", null), null);
  const info = await attendInfo("QT-1", k, null);
  assert.equal(info?.shut, "");
  assert.equal(info?.me, null);

  const asha = await attendIdentify("QT-1", k, "+91 98111 11111");
  assert.ok("me" in asha && asha.me.name === "Asha Rao" && !asha.me.presentToday);
  assert.deepEqual(await attendIdentify("QT-1", k, "9833333333"), { register: true });
  assert.equal(((await attendIdentify("QT-1", k, "12")) as { status: number }).status, 400);

  const walk = await attendRegister("QT-1", k, { name: "Meera Iyer", phone: "9833333333" });
  assert.ok("me" in walk);
  const again = await attendRegister("QT-1", k, { name: "Meera I", phone: "98333 33333" }); // the same number twice: back, not twice
  assert.ok("me" in again && again.me.th === walk.me.th);

  assert.equal(((await attendPresent("QT-1", k, null)) as { status: number }).status, 401);
  const p1 = await attendPresent("QT-1", k, "me" in asha ? asha.cookie : null);
  assert.ok("th" in p1 && !p1.already);
  const p2 = await attendPresent("QT-1", k, "me" in asha ? asha.cookie : null);
  assert.ok("th" in p2 && p2.already);
  assert.equal((await attendInfo("QT-1", k, "me" in asha ? asha.cookie : null))?.me?.presentToday, true);

  const list = await participants(RIYA, "1");
  assert.ok("list" in list);
  assert.equal(list.attendance, true);
  assert.deepEqual(list.days, [today]);
  assert.deepEqual(list.list.map((p) => [p.name, p.source, p.present]), [["Asha Rao", "typed", [today]], ["Vikram Shah", "typed", []], ["Meera Iyer", "walkin", []]]);
  assert.deepEqual((await staffPortal(["1"])).get("1")?.attendance, [{ day: today, present: 1 }]);
  assert.deepEqual((await staffParticipants("1")).map((p) => p.present.length), [1, 0, 0]);
});

test("the coordinator ticks and unticks; can't remove someone marked present; a new QR stops the old one", async () => {
  const today = indiaToday();
  await seed([today]);
  const { attendKey: k } = await confirm();
  const r = await tick(RIYA, "1", "TH002", today, true);
  assert.ok("list" in r && r.list[1].present[0] === today);
  assert.equal(((await removePerson(RIYA, "1", "TH002")) as { status: number }).status, 409);
  assert.equal(((await tick(RIYA, "1", "TH002", shift(today, 1), true)) as { status: number }).status, 400); // not a training day
  assert.equal(((await tick("someone@else.com", "1", "TH002", today, true)) as { status: number }).status, 404);
  const off = await tick(RIYA, "1", "TH002", today, false);
  assert.ok("list" in off && off.list[1].present.length === 0);
  assert.ok("list" in (await removePerson(RIYA, "1", "TH002")));
  const fresh = await newAttendKey(RIYA, "1");
  assert.ok("attendKey" in fresh && fresh.attendKey !== k);
  assert.equal(await attendInfo("QT-1", k, null), null);
  assert.ok(await attendInfo("QT-1", fresh.attendKey, null));
});

test("before and after the day: attendance is shut with the right words; registration closes once it's over", async () => {
  const today = indiaToday();
  await seed([shift(today, 2)]);
  let { attendKey: k } = await confirm();
  assert.match((await attendInfo("QT-1", k, null))!.shut, /^Attendance opens on /);
  assert.equal(((await attendIdentify("QT-1", k, "9811111111")) as { status: number }).status, 409);
  assert.equal(((await tick(RIYA, "1", "TH001", shift(today, 2), true)) as { status: number }).status, 400); // still ahead

  resetFakeDb();
  await seed([shift(today, -1)]);
  ({ attendKey: k } = await confirm());
  assert.equal((await attendInfo("QT-1", k, null))!.shut, "Attendance for this training has closed.");
  assert.equal((await joinInfo("QT-1", "joinkey123"))?.closed, true);
  assert.equal(((await join("QT-1", "joinkey123", { name: "Late Comer", phone: "9844444444" })) as { status: number }).status, 409);
  assert.ok("list" in (await tick(RIYA, "1", "TH001", shift(today, -1), true))); // a past day can still be fixed
  const page = await participantPage("QT-1", "TH001", (await (await db()).collection<{ _id: string; token: string }>("portalParticipants").findOne({ _id: "TH001" }))!.token);
  assert.deepEqual(page?.present, [shift(today, -1)]);
  assert.equal(page?.confirmed, true);
});

test("the route remembers the phone with a cookie, and Present works from it", async () => {
  const today = indiaToday();
  await seed([today]);
  const { attendKey: k } = await confirm();
  const post = (body: object, cookie = "") => attendPost(new Request("http://x/api/portal/attend", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ n: "QT-1", k, ...body }) }));
  const r = await post({ action: "identify", phone: "9811111111" });
  const set = r.headers.get("set-cookie") ?? "";
  assert.match(set, /^th_att_1=TH001\.[\w-]+%?.*; Path=\/; Max-Age=15552000; HttpOnly; SameSite=Lax/);
  const cookie = decodeURIComponent(set.split(";")[0]);
  const info = await (await attendGet(new Request(`http://x/api/portal/attend?n=QT-1&k=${k}`, { headers: { cookie } }))).json();
  assert.equal(info.me.name, "Asha Rao");
  const p = await (await post({ action: "present" }, cookie)).json();
  assert.equal(p.th, "TH001");
  assert.match((await post({ action: "forget" }, cookie)).headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.equal((await attendGet(new Request("http://x/api/portal/attend?n=QT-1&k=nope"))).status, 404);
});
