import { test } from "node:test";
import assert from "node:assert/strict";
import { hardestFirst, questionReport } from "@/lib/quizReport";

// The quiz report (owner, 16 Nov): question by question, everyone's first try combined.
const q = (text: string, answer: number, picked: number[], image = false) => ({ id: text, text, answer, options: picked.map((n, i) => ({ text: `${text}-${i}`, ...(image ? { image: `/q/${i}.jpg` } : {}), picked: n })), correctPct: Math.round((picked[answer] / Math.max(1, picked.reduce((a, b) => a + b, 0))) * 100) });

test("per question: how many answered, % right, each option's count and share, the right one marked", () => {
  const [a, b] = questionReport([q("q1", 1, [1, 3]), q("q2", 0, [1, 2, 1], true)]);
  assert.deepEqual(a, { n: 1, text: "q1", answered: 4, rightPct: 75, options: [{ text: "q1-0", count: 1, pct: 25, right: false }, { text: "q1-1", count: 3, pct: 75, right: true }] });
  assert.equal(b.options[0].image, "/q/0.jpg");
  assert.deepEqual(b.options.map((o) => [o.pct, o.right]), [[25, true], [50, false], [25, false]]);
  assert.deepEqual(hardestFirst([a, b]).map((x) => x.n), [2, 1]);
});

test("nobody answered yet: zeros, no division by zero", () => {
  const [a] = questionReport([q("q1", 0, [0, 0])]);
  assert.deepEqual([a.answered, a.rightPct, a.options.map((o) => o.pct)], [0, 0, [0, 0]]);
});
