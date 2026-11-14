// Retakes and certificates from the quiz (owner, 14 Nov): the form's marking (70% passes); a fail may try again while the
// training runs, a pass may not; the leaderboard ranks best tries, the analytics count first tries; the passed people's
// certificates go only after the coordinator's End on the last day, once each; someone without an email gives one.
// Fake database; the mailer and the PDF are stand-ins (one test makes a real PDF with the real fonts).
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { CPR_AED_QUIZ } from "@/lib/quizCprAed";
import { analytics, bestAttempts, canRetake, firstAttempts, leaderboard } from "@/lib/quizRules";
import { certDay, certEmail, certificatesReady, passedCsv, portalCertNumber, staffMaySend, CERT_TEMPLATE } from "@/lib/portalCertRules";
import { CERT_FONT_FILES, singleCertificate } from "@/lib/certPdf";
import { DESIGN } from "@/lib/certBackground";
import { indiaToday } from "@/lib/portalRules";
import { addPeople, endTraining, markConfirmed, markZohoConfirmed, participantCertificate, participantQuiz, quizResults, quizStart, quizSubmit, saveParticipantEmail, startTraining, staffCertificatesAllowed, tick } from "@/lib/portalTrainings";
import { sendCertificates } from "@/lib/portalCertSend";
import { db } from "@/lib/db";
import { resetFakeDb } from "./fakes/db";

beforeEach(() => resetFakeDb());
const RIYA = "riya@grand.com";
const KEY = CPR_AED_QUIZ.questions.map((q) => q.answer);
/** The key with the first `n` answers wrong. */
const wrong = (n: number) => KEY.map((a, i) => (i < n ? (a + 1) % CPR_AED_QUIZ.questions[i].options.length : a));

/* ---------------- Rules ---------------- */

test("retakes: only after a fail; best try ranks, first try counts in the analytics", () => {
  const a = (th: string, answers: number[], n: number, secs: number, at: string) => ({ th, name: th, answers, n, startedAt: at, finishedAt: new Date(Date.parse(at) + secs * 1000).toISOString(), points: 0, correct: 0 });
  const t1 = a("TH1", wrong(12), 1, 100, "2026-11-20T10:00:00Z"); // 60%, failed
  const t2 = a("TH1", wrong(3), 2, 200, "2026-11-20T10:10:00Z"); // 90%, passed
  const v1 = a("TH2", wrong(9), 1, 50, "2026-11-20T10:01:00Z"); // 70%, passed
  assert.equal(canRetake(CPR_AED_QUIZ, []), false); // nothing taken yet: that's a first try, not a retake
  assert.equal(canRetake(CPR_AED_QUIZ, [t1]), true);
  assert.equal(canRetake(CPR_AED_QUIZ, [t1, t2]), false);
  assert.equal(canRetake(CPR_AED_QUIZ, [v1]), false); // exactly 70% passes (the form: "at least 70%")
  assert.deepEqual(bestAttempts(CPR_AED_QUIZ, [t1, t2, v1]).map((x) => [x.th, x.n]), [["TH1", 2], ["TH2", 1]]);
  assert.deepEqual(firstAttempts([t2, t1, v1]).map((x) => [x.th, x.n]), [["TH1", 1], ["TH2", 1]]);
  const board = leaderboard(CPR_AED_QUIZ, [t1, t2, v1]);
  assert.deepEqual(board.map((b) => [b.rank, b.th, b.pct, b.tries]), [[1, "TH1", 90, 2], [2, "TH2", 70, 1]]);
  // Question 11: TH1's first try had it wrong, TH2 right → 50%, though TH1's best try had it right.
  assert.equal(analytics(CPR_AED_QUIZ, [t1, t2, v1])[10].correctPct, 50);
});

test("certificate rules: End on the last day, our fallback, the printed day and number, the email", () => {
  const days = ["2026-11-20", "2026-11-21"];
  const s = (day: string, ended: boolean) => ({ day, startedAt: "x", startedBy: "c", ...(ended ? { endedAt: "y" } : {}) });
  assert.equal(certificatesReady(days, [s("2026-11-20", true)]), false); // day 2 still to come
  assert.equal(certificatesReady(days, [s("2026-11-20", true), s("2026-11-21", false)]), false); // running
  assert.equal(certificatesReady(days, [s("2026-11-20", true), s("2026-11-21", true)]), true);
  assert.equal(staffMaySend(days, "2026-11-20", []), false); // before the last day
  assert.equal(staffMaySend(days, "2026-11-21", [s("2026-11-21", false)]), false); // never while it runs
  assert.equal(staffMaySend(days, "2026-11-22", [s("2026-11-21", false)]), true); // the coordinator never pressed End
  assert.equal(certDay(["2026-11-20", "2026-11-21"], "2026-11-20"), "2026-11-21");
  assert.equal(certDay([], "2026-11-20"), "2026-11-20");
  assert.equal(portalCertNumber("2026-12-04", "TH012"), "FAT-OD/04-12-2026/TH012");
  const m = certEmail(CERT_TEMPLATE, { name: "Asha Rao", training: "CPR & AED", score: "90%", link: "https://training.thinkhealth.in/QT-1/TH001?p=k", certno: "FAT-OD/04-12-2026/TH001" });
  assert.equal(m.subject, "Your certificate · CPR & AED");
  assert.match(m.html, /Dear Asha Rao/);
  assert.match(m.html, /<a href="https:\/\/training\.thinkhealth\.in\/QT-1\/TH001\?p=k"/);
  assert.match(m.html, /CPR &amp; AED|90%/);
});

test("a certificate prints on the server: one A5 page with the real fonts", async () => {
  const bg = await PDFDocument.create();
  bg.addPage([DESIGN.width, DESIGN.height]).drawRectangle({ x: 10, y: 10, width: 20, height: 20 });
  const fonts = Object.fromEntries(await Promise.all(Object.entries(CERT_FONT_FILES).map(async ([k, file]) => [k, new Uint8Array(await readFile(`public/certificate-fonts/${file}`))]))) as Parameters<typeof singleCertificate>[2];
  const pdf = await singleCertificate(await bg.save(), { serial: 0, certNo: "FAT-OD/04-12-2026/TH001", name: "Asha Rao", location: "The Grand, Pune", course: "x", date: "2026-12-04" }, fonts);
  const doc = await PDFDocument.load(pdf);
  assert.equal(doc.getPageCount(), 1);
  assert.ok(Math.abs(doc.getPage(0).getWidth() - DESIGN.width) < 1);
  await assert.rejects(singleCertificate(await bg.save(), { serial: 0, certNo: "c", name: "", location: "x", course: "x", date: "2026-12-04" }, fonts), /no name/);
});

/* ---------------- The flow ---------------- */

const seed = async (days: string[]) => {
  const d = await db();
  await d.collection<{ _id: string; items: object[] }>("kv").replaceOne({ _id: "zoho_items" }, { items: [{ id: "cpr", name: "CPR & AED Training (I)", identifier: "Training Services" }] });
  await d.collection<{ _id: string } & Record<string, unknown>>("zohoDocs").insertOne({ _id: "estimates:1", kind: "estimates", training: true, doc: { estimate_id: "1", estimate_number: "QT-1", status: "accepted", date: "2026-11-01", customer_name: "The Grand", customer_id: "77", line_items: [{ item_id: "cpr", name: "CPR & AED Training (I)", quantity: 30, rate: 1500, item_total: 45000 }] } });
  await d.collection<{ _id: string } & Record<string, unknown>>("portalTrainings").insertOne({ _id: "1", customerId: "77", coordinator: { name: "Riya Mehta", email: RIYA, phone: "9800000000" },
    proposal: { dates: days.map((date) => ({ date, time: "10:00" })), tentative: false, location: "The Grand, Pune", headcount: 30, at: "x", by: RIYA } });
  await addPeople(RIYA, "1", [{ name: "Asha Rao", phone: "9811111111", email: "asha@grand.com" }, { name: "Vikram Shah", phone: "9822222222" }, { name: "Meera Iyer", phone: "9833333333", email: "meera@grand.com" }], "typed");
  await markConfirmed("1", { at: "2026-11-12T10:00:00Z", by: "Ashish", salesorderId: "999", number: "Performa-25-1" });
  await markZohoConfirmed("1", "Ashish");
};
const token = async (th: string) => (await (await db()).collection<{ _id: string; token: string }>("portalParticipants").findOne({ _id: th }))!.token;
const take = async (th: string, tok: string, answers: number[]) => { await quizStart("QT-1", th, tok); return quizSubmit("QT-1", th, tok, answers); };

test("a fail tries again while the training runs; a pass is final; certificates go only after End, once each", async () => {
  const today = indiaToday();
  await seed([today]);
  const [asha, vikram, meera] = [await token("TH001"), await token("TH002"), await token("TH003")];
  await startTraining(RIYA, "1");
  for (const th of ["TH001", "TH002", "TH003"]) await tick(RIYA, "1", th, today, true);

  // Vikram fails (60%), may retake, passes on the second try (80%).
  const v1 = await take("TH002", vikram, wrong(12));
  assert.ok("result" in v1 && v1.result?.passed === false && v1.canRetake && v1.result.tries === 1);
  assert.equal(v1.certificate, null);
  const v2 = await take("TH002", vikram, wrong(6));
  assert.ok("result" in v2 && v2.result?.passed && v2.result.tries === 2 && !v2.canRetake);
  assert.deepEqual(v2.certificate, { ready: false, email: null, emailedAt: null, certNo: null }); // passed, not yet ended
  // Asha passes first time; Meera fails twice.
  await take("TH001", asha, KEY);
  await take("TH003", meera, wrong(15));
  const m2 = await take("TH003", meera, wrong(10));
  assert.ok("canRetake" in m2 && m2.canRetake && m2.result?.tries === 2);

  const res = await quizResults(RIYA, "1");
  assert.ok("leaderboard" in res);
  assert.deepEqual(res.leaderboard.map((b) => [b.name, b.pct, b.tries]), [["Asha Rao", 100, 1], ["Vikram Shah", 80, 2], ["Meera Iyer", 66.7, 2]]);
  assert.deepEqual(res.certificates.list.map((c) => [c.name, c.certNo]), [["Asha Rao", `FAT-OD/${today.split("-").reverse().join("-")}/TH001`], ["Vikram Shah", `FAT-OD/${today.split("-").reverse().join("-")}/TH002`]]);
  assert.equal(res.certificates.ready, false);
  assert.equal(await participantCertificate("QT-1", "TH001", asha), null); // no download before End
  assert.equal(await staffCertificatesAllowed("1"), false); // running

  // End on the last day: certificates due; the quiz closes (no more retakes for Meera).
  const ended = await endTraining(RIYA, "1");
  assert.ok("certificates" in ended && ended.certificates);
  assert.equal(((await quizStart("QT-1", "TH003", meera)) as { status: number }).status, 409);
  const sent: { to: string; subject: string; files: string[] }[] = [];
  const mailer = async (to: string, m: { subject: string; attachments: { name: string }[] }) => { sent.push({ to, subject: m.subject, files: m.attachments.map((a) => a.name) }); return { attached: 1 }; };
  const pdf = async () => new Uint8Array([37, 80, 68, 70]);
  const r = await sendCertificates("1", "riya", { mailer, pdf });
  assert.deepEqual([r.sent, r.noEmail, r.failed.length], [1, 1, 0]); // Asha emailed; Vikram has no email yet
  assert.deepEqual(sent, [{ to: "asha@grand.com", subject: "Your certificate · CPR, AED and First aid Training", files: ["Certificate - Asha Rao.pdf"] }]);
  assert.deepEqual((await sendCertificates("1", "riya", { mailer, pdf })).sent, 0); // never twice
  assert.ok(await participantCertificate("QT-1", "TH001", asha)); // the download works now

  // Vikram gives his email: his goes now; Meera (failed) can't ask for one.
  const e = await saveParticipantEmail("QT-1", "TH002", vikram, "Vikram@Grand.com");
  assert.ok("sendNow" in e && e.sendNow && e.email === "vikram@grand.com");
  assert.match(((await saveParticipantEmail("QT-1", "TH003", meera, "m@grand.com")) as { error: string }).error, /pass the quiz/);
  assert.match(((await saveParticipantEmail("QT-1", "TH002", vikram, "nope")) as { error: string }).error, /doesn't look right/);
  await sendCertificates("1", "participant", { only: "TH002", mailer, pdf });
  assert.deepEqual(sent.map((x) => x.to), ["asha@grand.com", "vikram@grand.com"]);
  const v = await participantQuiz("QT-1", "TH002", vikram);
  assert.ok(v?.certificate?.ready && v.certificate.emailedAt && v.certificate.email === "vikram@grand.com");
  // Without a test mailer, nothing sends off the live site.
  await assert.rejects(sendCertificates("1", "x"), /Only the live site/);
});

test("a multi-day training: End on day 1 sends nothing", async () => {
  const today = indiaToday();
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  await seed([today, tomorrow]);
  const asha = await token("TH001");
  await startTraining(RIYA, "1");
  await tick(RIYA, "1", "TH001", today, true);
  await take("TH001", asha, KEY);
  const ended = await endTraining(RIYA, "1");
  assert.ok("certificates" in ended && ended.certificates === false);
  assert.equal((await participantQuiz("QT-1", "TH001", asha))?.certificate?.ready, false);
  assert.equal(await staffCertificatesAllowed("1"), false); // the last day hasn't come
});

test("the passed list as CSV: Excel-ready (BOM), quoted where needed, India's dates", () => {
  const csv = passedCsv([{ th: "TH001", name: "Rao, Asha", email: "asha@grand.com", pct: 100, badge: true, day: "2026-12-04", certNo: "FAT-OD/04-12-2026/TH001", emailedAt: "2026-12-04T20:00:00Z" }]);
  const [head, row] = csv.replace(/^\uFEFF/, "").trim().split("\r\n");
  assert.ok(csv.startsWith("\uFEFF"));
  assert.equal(head, "TH number,Name,Email,Score %,First Aid Badge,Training day,Certificate no.,Certificate emailed");
  assert.equal(row, `TH001,"Rao, Asha",asha@grand.com,100,Yes,04/12/2026,FAT-OD/04-12-2026/TH001,05/12/2026`); // 8 pm UTC is the 5th in India
});
