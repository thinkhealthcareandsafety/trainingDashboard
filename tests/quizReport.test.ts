import { test } from "node:test";
import assert from "node:assert/strict";
import { questionReport } from "@/lib/quizReport";

// The quiz report (owner, 16 Nov): question by question, everyone's first try combined.
const q = (text: string, answer: number, picked: number[], image = false) => ({ id: text, text, answer, options: picked.map((n, i) => ({ text: `${text}-${i}`, ...(image ? { image: `/q/${i}.jpg` } : {}), picked: n })), correctPct: Math.round((picked[answer] / Math.max(1, picked.reduce((a, b) => a + b, 0))) * 100), discrimination: null });

test("per question: how many answered, % right, each option's count and share, the right one marked", () => {
  const [a, b] = questionReport([q("q1", 1, [1, 3]), q("q2", 0, [1, 2, 1], true)]);
  assert.deepEqual(a, { n: 1, text: "q1", answered: 4, rightPct: 75, options: [{ text: "q1-0", count: 1, pct: 25, right: false }, { text: "q1-1", count: 3, pct: 75, right: true }] });
  assert.equal(b.options[0].image, "/q/0.jpg");
  assert.deepEqual(b.options.map((o) => [o.pct, o.right]), [[25, true], [50, false], [25, false]]);
});

test("nobody answered yet: zeros, no division by zero", () => {
  const [a] = questionReport([q("q1", 0, [0, 0])]);
  assert.deepEqual([a.answered, a.rightPct, a.options.map((o) => o.pct)], [0, 0, [0, 0]]);
});

test("the report dashboard's numbers: KPIs on best tries, 30-question brackets, topics, the most common wrong answer, the heatmap colour", async () => {
  const { buildReport, accuracyColor, fmtSeconds } = await import("@/lib/quizReport");
  const p = (name: string, correct: number, seconds: number, tries = 1) => ({ rank: 0, th: name, name, points: correct * 10, correct, pct: Math.round((correct / 30) * 1000) / 10, seconds, passed: correct >= 21, badge: correct === 30, tries });
  const qs = Array.from({ length: 30 }, (_, i) => ({ ...q(`q${i + 1}`, 0, i === 0 ? [1, 3, 0] : [4, 0, 0]), topic: i < 15 ? "CPR" : "AED", discrimination: i === 0 ? 0.5 : null }));
  const r = buildReport({ leaderboard: [p("A", 30, 400), p("B", 24, 500), p("C", 15, 300, 2), p("D", 8, 200)], questions: qs, passPct: 70, started: 5, finished: 4 });
  assert.deepEqual(r.kpi, { started: 5, finished: 4, completionPct: 80, avgCorrect: 19.3, of: 30, avgPct: 64, passPct: 50, passed: 2, avgSeconds: 350 });
  assert.deepEqual(r.histogram.map((b) => [b.label, b.count, b.passing]), [["0–10", 1, false], ["11–20", 1, false], ["21–25", 1, true], ["26–30", 1, true]]);
  assert.deepEqual(r.topics.map((t) => [t.name, t.questions]), [["CPR", 15], ["AED", 15]]);
  assert.deepEqual([r.items[0].wrong, r.items[0].discrimination, r.items[1].wrong], [{ text: "q1-1", pct: 75 }, 0.5, null]);
  assert.equal(accuracyColor(0).bg, "rgb(180 35 24)");
  assert.equal(accuracyColor(100).ink, "light");
  assert.equal(accuracyColor(50).ink, "dark");
  assert.equal(fmtSeconds(425), "7m 05s");
});

test("discrimination (upper 27% vs lower 27%, first tries) and topics come with the analytics", async () => {
  const { analytics } = await import("@/lib/quizRules");
  const quiz = { id: "t", title: "T", intro: [], pointsEach: 10, passPct: 70, badgePct: 100, badge: "B", topics: [{ name: "One", count: 1 }, { name: "Two", count: 1 }],
    questions: [{ id: "a", text: "a", options: [{ text: "x" }, { text: "y" }], answer: 0 }, { id: "b", text: "b", options: [{ text: "x" }, { text: "y" }], answer: 0 }] };
  const at = (th: string, answers: number[]) => ({ th, name: th, answers, startedAt: "2026-11-16T10:00:00Z", finishedAt: "2026-11-16T10:05:00Z", points: 0, correct: 0 });
  // Strong people get "a" right, weak ones don't; "b" everyone gets right (no discrimination).
  const s = analytics(quiz as never, [at("1", [0, 0]), at("2", [0, 0]), at("3", [1, 0]), at("4", [1, 0])]);
  assert.deepEqual(s.map((x) => [x.topic, x.discrimination]), [["One", 1], ["Two", 0]]);
  assert.equal(analytics(quiz as never, [at("1", [0, 0])])[0].discrimination, null); // too few people
});
