import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { finishedOn } from "@/lib/attendanceRules";
import { plain, reportFileName, reportPdf } from "@/lib/reportPdf";

// Owner, 17 Nov: when a training is over, the track ends with "Training completed" (same date) and the panel changes.

test("finished: the board's Completed, else the last day once ended, else once it has passed; not before", () => {
  const s = (day: string, ended = true) => ({ day, startedAt: `${day}T04:30:00Z`, startedBy: "c", ...(ended ? { endedAt: `${day}T08:00:00Z` } : {}) });
  assert.equal(finishedOn(["2026-11-16"], "2026-11-16", [s("2026-11-16")]), "2026-11-16"); // End pressed on the day
  assert.equal(finishedOn(["2026-11-16"], "2026-11-16", [s("2026-11-16", false)]), null); // still running
  assert.equal(finishedOn(["2026-11-16"], "2026-11-17", []), "2026-11-16"); // nobody pressed End: over once the day passed
  assert.equal(finishedOn(["2026-11-16", "2026-11-17"], "2026-11-16", [s("2026-11-16")]), null); // day 1 of 2
  assert.equal(finishedOn(["2026-11-20"], "2026-11-17", [], "2026-11-18T10:00:00Z"), "2026-11-18"); // the board said so
  assert.equal(finishedOn([], "2026-11-17", []), null);
});

test("the report PDF: their story on one A4 page, their own answers, safe text", async () => {
  const questions = Array.from({ length: 30 }, (_, i) => ({ text: `Question ${i + 1}: what do you do first?`, options: [{ text: "Check “safety”" }, { text: "Call 108" }], answer: 0, lesson: i === 3 ? "Always check the scene is safe before you help." : undefined }));
  const answers = questions.map((_, i) => (i === 3 || i === 9 ? 1 : 0));
  const bytes = await reportPdf({ title: "CPR-AED quiz", name: "Asha Rao", th: "TH001", training: "CPR, AED and First aid Training", passPct: 70, questions, everyone: [240, 300, 360], result: { pct: 93.3, correct: 28, total: 30, passed: true, badge: false, rank: 2, of: 3, seconds: 240, answers } });
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.match(doc.getTitle() ?? "", /Asha Rao/);
  assert.equal(plain("₹500 – “ok” … ✓"), "Rs 500 - \"ok\" ... ?");
  assert.equal(reportFileName("Asha / Rao"), "My report - Asha Rao.pdf");
});
