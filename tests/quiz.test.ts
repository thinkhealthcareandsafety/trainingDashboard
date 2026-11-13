// Start training and the quiz (owner, 13 Nov): the coordinator starts the training on its date; only then do attendance
// and the quiz open; present people take it once; results rank live; End shows the right answers. Fake database.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { quizState, sessionWindow, type Session } from "@/lib/attendanceRules";
import { CPR_AED_QUIZ } from "@/lib/quizCprAed";
import { analytics, leaderboard, publicQuiz, quizFor, readAnswers, scoreOf } from "@/lib/quizRules";
import { indiaToday } from "@/lib/portalRules";
import { addPeople, endTraining, markConfirmed, markZohoConfirmed, participantQuiz, quizResults, quizStart, quizSubmit, startTraining, staffQuizResults, tick, trainingsFor } from "@/lib/portalTrainings";
import { db } from "@/lib/db";
import { resetFakeDb } from "./fakes/db";

beforeEach(() => resetFakeDb());
const RIYA = "riya@grand.com";
const KEY = CPR_AED_QUIZ.questions.map((q) => q.answer);
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/* ---------------- Rules ---------------- */

test("the quiz is the form: 30 questions, 10 points each, every picture there, every answer a real option", () => {
  assert.equal(CPR_AED_QUIZ.questions.length, 30);
  assert.equal(CPR_AED_QUIZ.passPct, 70);
  for (const q of CPR_AED_QUIZ.questions) assert.ok(q.answer >= 0 && q.answer < q.options.length, q.id);
  assert.equal(CPR_AED_QUIZ.questions.flatMap((q) => q.options).filter((o) => o.image).length, 29);
  assert.equal(quizFor(["THCAS CPR & AED Training 2026 (I)"])?.id, "cpr-aed");
  assert.equal(quizFor(["Basic Life Support"])?.id, "cpr-aed");
  assert.equal(quizFor(["Fire Safety Training"]), null);
  assert.equal(publicQuiz(CPR_AED_QUIZ, false).questions[0].answer, undefined); // no answers before they're revealed
  assert.equal(publicQuiz(CPR_AED_QUIZ, true).questions[0].answer, 1);
});

test("scoring: 10 a question, 70% passes, 100% earns the badge; answers checked", () => {
  const all = scoreOf(CPR_AED_QUIZ, KEY);
  assert.deepEqual([all.points, all.max, all.pct, all.passed, all.badge], [300, 300, 100, true, true]);
  const wrong = KEY.map((a, i) => (i < 9 ? (a + 1) % CPR_AED_QUIZ.questions[i].options.length : a)); // 21 of 30
  assert.deepEqual([scoreOf(CPR_AED_QUIZ, wrong).pct, scoreOf(CPR_AED_QUIZ, wrong).passed], [70, true]);
  const worse = KEY.map((a, i) => (i < 10 ? (a + 1) % CPR_AED_QUIZ.questions[i].options.length : a));
  assert.equal(scoreOf(CPR_AED_QUIZ, worse).passed, false);
  assert.match((readAnswers([1, 2], CPR_AED_QUIZ) as { error: string }).error, /all 30/);
  assert.match((readAnswers(KEY.map((_, i) => (i === 4 ? 9 : 0)), CPR_AED_QUIZ) as { error: string }).error, /Question 5/);
});

test("leaderboard: points first, then the faster finish; analytics count each option", () => {
  const a = (th: string, answers: number[], secs: number) => ({ th, name: th, answers, startedAt: "2026-11-20T10:00:00Z", finishedAt: new Date(Date.parse("2026-11-20T10:00:00Z") + secs * 1000).toISOString(), points: 0, correct: 0 });
  const half = KEY.map((x, i) => (i % 2 ? (x + 1) % CPR_AED_QUIZ.questions[i].options.length : x));
  const board = leaderboard(CPR_AED_QUIZ, [a("TH3", half, 60), a("TH1", KEY, 300), a("TH2", KEY, 120)]);
  assert.deepEqual(board.map((b) => [b.rank, b.th]), [[1, "TH2"], [2, "TH1"], [3, "TH3"]]);
  const stats = analytics(CPR_AED_QUIZ, [a("TH1", KEY, 1), a("TH3", half, 1)]);
  assert.deepEqual([stats[0].options.map((o) => o.picked), stats[0].correctPct], [[0, 2], 100]);
  assert.equal(stats[1].correctPct, 50);
});

test("sessions: waiting until Start, open while it runs, ended after End; the quiz reveals after the last day's End", () => {
  const days = ["2026-11-20", "2026-11-21"];
  const s1: Session = { day: "2026-11-20", startedAt: "x", startedBy: "c" };
  assert.equal(sessionWindow(days, "2026-11-20", []).state, "waiting");
  assert.equal(sessionWindow(days, "2026-11-20", [s1]).state, "open");
  assert.equal(sessionWindow(days, "2026-11-20", [{ ...s1, endedAt: "y" }]).state, "ended");
  assert.equal(sessionWindow(days, "2026-11-19", [s1]).state, "before");
  assert.equal(quizState(days, "2026-11-20", []), "none");
  assert.equal(quizState(days, "2026-11-20", [s1]), "open");
  assert.equal(quizState(days, "2026-11-20", [{ ...s1, endedAt: "y" }]), "closed"); // day 2 still to come
  assert.equal(quizState(days, "2026-11-21", [{ ...s1, endedAt: "y" }]), "closed"); // day 2 not started yet
  assert.equal(quizState(days, "2026-11-21", [{ ...s1, endedAt: "y" }, { day: "2026-11-21", startedAt: "x", startedBy: "c", endedAt: "z" }]), "revealed");
  assert.equal(quizState(days, "2026-11-22", [s1]), "revealed"); // left running: it ends with its day
});

/* ---------------- The flow ---------------- */

const seed = async (days: string[]) => {
  const d = await db();
  await d.collection<{ _id: string; items: object[] }>("kv").replaceOne({ _id: "zoho_items" }, { items: [{ id: "cpr", name: "CPR & AED Training (I)", identifier: "Training Services" }] });
  await d.collection<{ _id: string } & Record<string, unknown>>("zohoDocs").insertOne({ _id: "estimates:1", kind: "estimates", training: true, doc: { estimate_id: "1", estimate_number: "QT-1", status: "accepted", date: "2026-11-01", customer_name: "The Grand", customer_id: "77", line_items: [{ item_id: "cpr", name: "CPR & AED Training (I)", quantity: 30, rate: 1500, item_total: 45000 }] } });
  await d.collection<{ _id: string } & Record<string, unknown>>("portalTrainings").insertOne({ _id: "1", customerId: "77", coordinator: { name: "Riya Mehta", email: RIYA, phone: "9800000000" },
    proposal: { dates: days.map((date) => ({ date, time: "10:00" })), tentative: false, location: "The Grand", headcount: 30, at: "x", by: RIYA } });
  await addPeople(RIYA, "1", [{ name: "Asha Rao", phone: "9811111111" }, { name: "Vikram Shah", phone: "9822222222" }, { name: "Meera Iyer", phone: "9833333333" }], "typed");
  await markConfirmed("1", { at: "2026-11-12T10:00:00Z", by: "Ashish", salesorderId: "999", number: "Performa-25-1" });
  await markZohoConfirmed("1", "Ashish");
};
const token = async (th: string) => (await (await db()).collection<{ _id: string; token: string }>("portalParticipants").findOne({ _id: th }))!.token;

test("Start only on the training date; the quiz opens with it, only for people marked present, once each; results rank live", async () => {
  const today = indiaToday();
  await seed([today]);
  const [asha, vikram, meera] = [await token("TH001"), await token("TH002"), await token("TH003")];
  assert.equal((await participantQuiz("QT-1", "TH001", asha))?.state, "none"); // not started
  assert.equal(((await quizStart("QT-1", "TH001", asha)) as { status: number }).status, 409);
  assert.ok("window" in (await startTraining(RIYA, "1")));
  assert.equal((await trainingsFor(RIYA))[0].quiz?.state, "open");
  assert.equal(((await quizStart("QT-1", "TH001", asha)) as { status: number }).status, 403); // not marked present
  await tick(RIYA, "1", "TH001", today, true);
  await tick(RIYA, "1", "TH002", today, true);
  assert.ok("startedAt" in (await quizStart("QT-1", "TH001", asha)));
  const r = await quizSubmit("QT-1", "TH001", asha, KEY);
  assert.ok("result" in r && r.result?.points === 300 && r.result.rank === 1 && r.result.badge);
  assert.equal(r.quiz.questions[0].answer, undefined); // the answers stay hidden while it's open
  assert.equal(((await quizSubmit("QT-1", "TH001", asha, KEY)) as { status: number }).status, 409); // once each
  await quizStart("QT-1", "TH002", vikram);
  await quizSubmit("QT-1", "TH002", vikram, KEY.map((a, i) => (i < 12 ? (a + 1) % CPR_AED_QUIZ.questions[i].options.length : a)));
  const res = await quizResults(RIYA, "1");
  assert.ok("leaderboard" in res);
  assert.deepEqual(res.leaderboard.map((b) => [b.rank, b.name, b.passed]), [[1, "Asha Rao", true], [2, "Vikram Shah", false]]);
  assert.deepEqual([res.taken, res.present, res.passed], [2, 2, 1]);
  assert.equal((await staffQuizResults("1"))?.taken, 2);
  assert.equal(((await quizStart("QT-1", "TH003", meera)) as { status: number }).status, 403);
  // End on the last day: closed, and the right answers show.
  await endTraining(RIYA, "1");
  const after = await participantQuiz("QT-1", "TH002", vikram);
  assert.equal(after?.state, "revealed");
  assert.equal(after?.quiz.questions[0].answer, 1);
  assert.equal(after?.result?.rank, 2);
  assert.equal(((await quizStart("QT-1", "TH003", meera)) as { status: number }).status, 409);
});

test("no Start before or after the training date", async () => {
  const today = indiaToday();
  await seed([shift(today, 1)]);
  assert.match(((await startTraining(RIYA, "1")) as { error: string }).error, /training date/);
  resetFakeDb();
  await seed([shift(today, -1)]);
  assert.match(((await startTraining(RIYA, "1")) as { error: string }).error, /training date/);
  assert.match(((await endTraining(RIYA, "1")) as { error: string }).error, /isn't running/);
});
