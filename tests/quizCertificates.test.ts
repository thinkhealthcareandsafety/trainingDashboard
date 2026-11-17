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
import { certDay, certEmail, passedCsv, portalCertNumber, CERT_TEMPLATE, REPORT_LINE } from "@/lib/portalCertRules";
import { CERT_FONT_FILES, singleCertificate } from "@/lib/certPdf";
import { DESIGN } from "@/lib/certBackground";
import { indiaToday } from "@/lib/portalRules";
import { addPeople, claimCertificate, endTraining, markReportSaved, markConfirmed, markZohoConfirmed, participantCertificate, participantQuiz, quizResults, quizStart, quizSubmit, saveParticipantEmail, startTraining, tick } from "@/lib/portalTrainings";
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

test("certificate rules: the printed day and number, the email", () => {
  assert.equal(certDay(["2026-11-20", "2026-11-21"], "2026-11-20"), "2026-11-21");
  assert.equal(certDay([], "2026-11-20"), "2026-11-20");
  assert.equal(portalCertNumber("2026-12-04", "TH012"), "FAT-OD/04-12-2026/TH012");
  const m = certEmail(CERT_TEMPLATE, { name: "Asha Rao", training: "CPR & AED", score: "90%", link: "https://training.thinkhealth.in/QT-1/TH001?p=k", certno: "FAT-OD/04-12-2026/TH001", report: REPORT_LINE });
  assert.equal(m.subject, "Thank you for attending · CPR & AED");
  assert.match(m.text, /Thank you for attending CPR & AED/);
  assert.match(m.text, /Your quiz report is attached too./);
  assert.doesNotMatch(certEmail(CERT_TEMPLATE, { name: "A", training: "T", score: "90%", link: "x", certno: "c", report: "" }).text, /report is attached/);
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

test("a fail tries again while the training runs; a pass is final; the thank-you with the certificate goes when the training ends, once (owner, 17 Nov)", async () => {
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
  assert.equal(v2.certificate?.ready, true); // downloadable at once; emailed when the training ends (owner, 17 Nov)
  // Asha passes first time; Meera fails twice.
  await take("TH001", asha, KEY);
  await take("TH003", meera, wrong(15));
  const m2 = await take("TH003", meera, wrong(10));
  assert.ok("canRetake" in m2 && m2.canRetake && m2.result?.tries === 2);

  const res = await quizResults(RIYA, "1");
  assert.ok("leaderboard" in res);
  assert.deepEqual(res.leaderboard.map((b) => [b.name, b.pct, b.tries]), [["Asha Rao", 100, 1], ["Vikram Shah", 80, 2], ["Meera Iyer", 66.7, 2]]);
  assert.deepEqual(res.certificates.list.map((c) => [c.name, c.certNo]), [["Asha Rao", `FAT-OD/${today.split("-").reverse().join("-")}/TH001`], ["Vikram Shah", `FAT-OD/${today.split("-").reverse().join("-")}/TH002`]]);
  assert.ok(await participantCertificate("QT-1", "TH001", asha)); // the download works as soon as they pass

  // Vikram gives his email before the end: it just waits (everyone gets theirs when the training ends).
  const early = await saveParticipantEmail("QT-1", "TH002", vikram, "early@grand.com");
  assert.ok("sendNow" in early && !early.sendNow);
  await (await db()).collection<{ _id: string; email?: string }>("portalParticipants").updateOne({ _id: "TH002" }, { $unset: { email: "" } });
  // End on the last day: the thank-you emails are due; the quiz closes (no more retakes for Meera).
  const ended = await endTraining(RIYA, "1");
  assert.ok("certificates" in ended && ended.certificates);
  assert.equal(((await quizStart("QT-1", "TH003", meera)) as { status: number }).status, 409);
  const sent: { to: string; subject: string; files: string[] }[] = [];
  const mailer = async (to: string, m: { subject: string; attachments: { name: string }[] }) => { sent.push({ to, subject: m.subject, files: m.attachments.map((a) => a.name) }); return { attached: 1 }; };
  const pdf = async () => new Uint8Array([37, 80, 68, 70]);
  const r = await sendCertificates("1", "riya", { mailer, pdf });
  assert.deepEqual([r.sent, r.noEmail, r.failed.length], [1, 1, 0]); // Asha emailed; Vikram has no email yet
  // Owner, 17 Nov: the thank-you with the Good Samaritan certificate, and her report as she never saved it.
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "asha@grand.com");
  assert.match(sent[0].subject, /^Thank you for attending · /);
  assert.deepEqual(sent[0].files, ["Good Samaritan certificate - Asha Rao.pdf", "My report - Asha Rao.pdf"]);
  assert.deepEqual((await sendCertificates("1", "riya", { mailer, pdf })).sent, 0); // never twice

  // Vikram gives his email: his goes now; Meera (failed) can't ask for one.
  const e = await saveParticipantEmail("QT-1", "TH002", vikram, "Vikram@Grand.com");
  assert.ok("sendNow" in e && e.sendNow && e.email === "vikram@grand.com");
  assert.match(((await saveParticipantEmail("QT-1", "TH003", meera, "m@grand.com")) as { error: string }).error, /pass the quiz/);
  assert.match(((await saveParticipantEmail("QT-1", "TH002", vikram, "nope")) as { error: string }).error, /doesn't look right/);
  // He saved his report himself: only the certificate goes.
  assert.ok("ok" in (await markReportSaved("QT-1", "TH002", vikram)));
  await sendCertificates("1", "participant", { only: "TH002", mailer, pdf });
  assert.deepEqual(sent.map((x) => x.to), ["asha@grand.com", "vikram@grand.com"]);
  assert.deepEqual(sent[1].files, ["Good Samaritan certificate - Vikram Shah.pdf"]);
  // Two senders at once never send twice: the claim lets one through.
  assert.equal(await claimCertificate("1", "TH002"), false);
  const v = await participantQuiz("QT-1", "TH002", vikram);
  assert.ok(v?.certificate?.ready && v.certificate.emailedAt && v.certificate.email === "vikram@grand.com");
  // Without a test mailer, nothing sends off the live site.
  await assert.rejects(sendCertificates("1", "x"), /Only the live site/);
});

test("a multi-day training: a pass on day 1 gets the certificate on day 1", async () => {
  const today = indiaToday();
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  await seed([today, tomorrow]);
  const asha = await token("TH001");
  await startTraining(RIYA, "1");
  await tick(RIYA, "1", "TH001", today, true);
  await take("TH001", asha, KEY);
  assert.equal((await participantQuiz("QT-1", "TH001", asha))?.certificate?.ready, true);
  const ended = await endTraining(RIYA, "1");
  assert.ok("certificates" in ended && ended.certificates === false); // day 1 of 2: the thank-you waits for the last day
  const [line] = (await quizResults(RIYA, "1") as { certificates: { list: { day: string }[] } }).certificates.list;
  assert.equal(line.day, today); // printed with the day they were there
});

test("the passed list as CSV: Excel-ready (BOM), quoted where needed, India's dates", () => {
  const csv = passedCsv([{ th: "TH001", name: "Rao, Asha", email: "asha@grand.com", pct: 100, badge: true, day: "2026-12-04", certNo: "FAT-OD/04-12-2026/TH001", gsNo: "IAGS-SN/007", emailedAt: "2026-12-04T20:00:00Z" }]);
  const [head, row] = csv.replace(/^\uFEFF/, "").trim().split("\r\n");
  assert.ok(csv.startsWith("\uFEFF"));
  assert.equal(head, "TH number,Name,Email,Score %,First Aid Badge,Training day,Certificate no.,Good Samaritan no.,Good Samaritan emailed");
  assert.equal(row, `TH001,"Rao, Asha",asha@grand.com,100,Yes,04/12/2026,FAT-OD/04-12-2026/TH001,IAGS-SN/007,05/12/2026`); // 8 pm UTC is the 5th in India
});

test("the Good Samaritan certificate (owner, 16 Nov): its own number, one counter for everyone, never twice; drawn on the owner's design", async () => {
  const { goodSamaritanNumber, goodSamaritanPdf } = await import("@/lib/goodSamaritan");
  const { certificateLines } = await import("@/lib/portalTrainings");
  assert.equal(goodSamaritanNumber(7), "IAGS-SN/007");
  assert.equal(goodSamaritanNumber(1234), "IAGS-SN/1234");
  const template = new Uint8Array(await readFile("assets/certificates/good-samaritan.pdf"));
  const font = new Uint8Array(await readFile(`public/certificate-fonts/${CERT_FONT_FILES.name}`));
  const doc = await PDFDocument.load(await goodSamaritanPdf(template, font, { name: "Asha Rao", certNo: "IAGS-SN/007" }));
  assert.equal(doc.getPageCount(), 1);
  assert.match(doc.getTitle() ?? "", /Asha Rao/);
  await assert.rejects(goodSamaritanPdf(template, font, { name: " ", certNo: "x" }), /needs a name/);
  // Numbers follow people, in order, across trainings: three passers → 001, 002, 003; kept, never renumbered.
  const today = indiaToday();
  await seed([today]);
  await startTraining(RIYA, "1");
  for (const th of ["TH001", "TH002", "TH003"]) { await tick(RIYA, "1", th, today, true); await take(th, await token(th), KEY); }
  assert.deepEqual((await certificateLines("1")).map((l) => l.gsNo).sort(), ["IAGS-SN/001", "IAGS-SN/002", "IAGS-SN/003"]);
  assert.deepEqual((await certificateLines("1")).map((l) => l.gsNo).sort(), ["IAGS-SN/001", "IAGS-SN/002", "IAGS-SN/003"]);
});

test("official certificates for the coordinator only once fully paid; each download marked; all as a ZIP (owner, 16 Nov)", async () => {
  const { paidInFull } = await import("@/lib/portalCertRules");
  const { coordinatorCertificates, trainingsFor } = await import("@/lib/portalTrainings");
  const { zip, uniqueNames, crc32 } = await import("@/lib/zip");
  const inv = (number: string, reference: string, balance: number, status = balance ? "sent" : "paid") => ({ number, reference, total: 1000, balance, status });
  assert.equal(paidInFull([], ["Performa-25-1"]), false); // no invoice yet
  assert.equal(paidInFull([inv("INV-1", "Performa-25-1", 400, "partially_paid")], ["Performa-25-1"]), false); // part paid
  assert.equal(paidInFull([inv("INV-1", "Ref: performa-25-1", 0)], ["Performa-25-1"]), true);
  assert.equal(paidInFull([inv("INV-1", "Performa-25-1", 0), inv("INV-2", "Performa-25-1", 500)], ["Performa-25-1"]), false); // a second still owes
  assert.equal(paidInFull([inv("INV-1", "Performa-25-1", 0), inv("INV-2", "Performa-25-1", 500, "void")], ["Performa-25-1"]), true); // void doesn't count
  assert.equal(paidInFull([inv("INV-9", "QT-1", 0)], ["Performa-25-1", "QT-1"]), true); // Performa skipped: the quote's reference

  const today = indiaToday();
  await seed([today]);
  await startTraining(RIYA, "1");
  await tick(RIYA, "1", "TH001", today, true);
  await take("TH001", await token("TH001"), KEY);
  assert.equal((await trainingsFor(RIYA))[0].officialCerts, null); // not paid: not even shown
  assert.equal(((await coordinatorCertificates(RIYA, "1")) as { status: number }).status, 409);
  await (await db()).collection<{ _id: string } & Record<string, unknown>>("salesDocs").insertOne({ _id: "invoices:9", kind: "invoices", id: "9", row: { invoice_number: "INV-1", reference_number: "Performa-25-1", total: 45000, balance: 0, status: "paid" } });
  const [t] = await trainingsFor(RIYA);
  assert.deepEqual(t.officialCerts?.map((c) => [c.th, c.downloadedAt]), [["TH001", null]]);
  assert.equal(((await coordinatorCertificates("someone@else.com", "1")) as { status: number }).status, 404);
  const one = await coordinatorCertificates(RIYA, "1", "th001");
  assert.ok(Array.isArray(one) && one.length === 1 && one[0].certNo.startsWith("FAT-OD/"));
  assert.ok((await trainingsFor(RIYA))[0].officialCerts?.[0].downloadedAt); // marked once

  // The ZIP: a local header per file, the data inflates back, names kept unique.
  const { inflateRawSync } = await import("node:zlib");
  assert.deepEqual(uniqueNames(["A.pdf", "B.pdf", "a.pdf"]), ["A.pdf", "B.pdf", "a (2).pdf"]);
  const data = new TextEncoder().encode("%PDF-1.7 hello");
  const z = Buffer.from(zip([{ name: "Certificate - Asha Rao.pdf", data }]));
  assert.equal(z.readUInt32LE(0), 0x04034b50);
  const nameLen = z.readUInt16LE(26), size = z.readUInt32LE(18);
  assert.equal(z.subarray(30, 30 + nameLen).toString(), "Certificate - Asha Rao.pdf");
  assert.deepEqual(new Uint8Array(inflateRawSync(z.subarray(30 + nameLen, 30 + nameLen + size))), data);
  assert.equal(z.readUInt32LE(14), crc32(data));
  assert.equal(z.readUInt32LE(z.length - 22), 0x06054b50);
});

test("Good Samaritan records into the sheet (owner, 16 Nov): a row per certificate, once; a redownload or resend adds nothing", async () => {
  const { goodSamaritanRecords } = await import("@/lib/portalTrainings");
  const today = indiaToday();
  await seed([today]);
  await startTraining(RIYA, "1");
  for (const th of ["TH001", "TH002"]) { await tick(RIYA, "1", th, today, true); await take(th, await token(th), KEY); }
  const written: Record<string, string>[][] = [];
  const append = async (pending: () => Promise<Record<string, string>[]>, done: (n: number) => Promise<void>) => { const rows = await pending(); if (rows.length) { written.push(rows); await done(rows.length); } return rows.length; };
  assert.equal(await goodSamaritanRecords("1", append as never), 2);
  const [rows] = written;
  assert.deepEqual(rows.map((r) => [r.Name, r.Mobile, r.Company, r["TH Number"]]).sort(), [["Asha Rao", "9811111111", "The Grand", "TH001"], ["Vikram Shah", "9822222222", "The Grand", "TH002"]]);
  assert.deepEqual(rows.map((r) => r["Certificate No"]).sort(), ["IAGS-SN/001", "IAGS-SN/002"]); // equal scores: who gets 001 is who finished first
  assert.equal(rows[0].Training, "CPR & AED Training");
  assert.equal(await goodSamaritanRecords("1", append as never), 0); // already there
  await take("TH003", await token("TH003"), wrong(1)).catch(() => undefined); // Meera isn't marked present: no try, no row
  assert.equal(written.length, 1);
});

test("a participant's own report (owner, 16 Nov): their score by topic (counts only), their time", async () => {
  const today = indiaToday();
  await seed([today]);
  await startTraining(RIYA, "1");
  await tick(RIYA, "1", "TH002", today, true);
  const vik = await token("TH002");
  await take("TH002", vik, wrong(3)); // the first three wrong: all in First Aid basics
  const v = await participantQuiz("QT-1", "TH002", vik);
  assert.deepEqual(v?.result?.topics, [{ name: "First Aid basics", right: 5, of: 8 }, { name: "CPR", right: 9, of: 9 }, { name: "AED", right: 8, of: 8 }, { name: "Heart attack", right: 5, of: 5 }]);
  assert.equal(typeof v?.result?.seconds, "number");
  assert.equal(v?.quiz.questions[0].answer, undefined); // the right answers still hidden until End
});
