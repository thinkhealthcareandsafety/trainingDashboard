import { test } from "node:test";
import assert from "node:assert/strict";
import { quizReport } from "@/lib/quizReport";

// The quiz report's charts (owner, 16 Nov), from the leaderboard (best tries) and the per-question picks (first tries).
const p = (name: string, pct: number, tries: number, seconds = 300) => ({ rank: 0, th: name, name, points: pct * 3, correct: 0, pct, seconds, passed: pct >= 70, badge: pct === 100, tries });
const q = (text: string, answer: number, picked: number[]) => ({ id: text, text, answer, options: picked.map((n, i) => ({ text: `${text}-${i}`, picked: n })), correctPct: Math.round((picked[answer] / picked.reduce((a, b) => a + b, 0)) * 100) });

test("the report: pass rate, score bands, topics, the hardest questions with their most-picked wrong answer, re-takes, time vs score", () => {
  const r = quizReport({
    passPct: 70,
    leaderboard: [p("A", 100, 1, 420), p("B", 80, 2), p("C", 73.3, 3), p("D", 50, 2), p("E", 30, 1)],
    questions: [q("q1", 0, [4, 1]), q("q2", 1, [3, 2]), q("q3", 0, [1, 3, 1]), q("q4", 2, [0, 0, 5])],
    topics: [{ name: "Basics", count: 2 }, { name: "CPR", count: 2 }],
  });
  assert.deepEqual(r.outcome, { badge: 1, passed: 2, notPassed: 2, total: 5, passPct: 60 });
  assert.deepEqual(r.bands.map((b) => [b.label, b.count, b.passing]), [["Under 40", 1, false], ["40–59", 1, false], ["60–69", 0, false], ["70–89", 2, true], ["90–99", 0, true], ["100", 1, true]]);
  assert.deepEqual(r.topics, [{ name: "Basics", questions: 2, pct: 60 }, { name: "CPR", questions: 2, pct: 60 }]);
  assert.deepEqual(r.hardest[0], { n: 3, text: "q3", pct: 20, wrong: { text: "q3-1", pct: 60 } });
  assert.equal(r.hardest.at(-1)?.n, 4); // everyone right: last
  assert.equal(r.hardest.at(-1)?.wrong, null);
  assert.deepEqual(r.retakes.map((x) => x.count), [1, 1, 1, 2]);
  assert.deepEqual(r.scatter[0], { name: "A", minutes: 7, pct: 100, passed: true });
});

test("the report with nobody yet: zeros, no hardest list, no division by zero", () => {
  const r = quizReport({ passPct: 70, leaderboard: [], questions: [q("q1", 0, [0, 0])].map((x) => ({ ...x, correctPct: 0 })), topics: [] });
  assert.deepEqual(r.outcome, { badge: 0, passed: 0, notPassed: 0, total: 0, passPct: 0 });
  assert.deepEqual(r.hardest, []);
  assert.deepEqual(r.scatter, []);
});
