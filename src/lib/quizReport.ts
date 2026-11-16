import type { QuestionStats, Ranked } from "./quizRules";

/*
 * The quiz report's charts (owner, 16 Nov: "these answers should instead be reports … bar charts, pie charts, any
 * interesting chart"), pure, from the results we already send: the leaderboard (each person's best try) and the
 * per-question picks (first tries). Client-safe.
 */

export type QuizReport = {
  /** Best tries: a 100% (badge), passed, not passed. */
  outcome: { badge: number; passed: number; notPassed: number; total: number; passPct: number };
  /** Best scores in bands; `passing` = the band is at or above the pass mark. */
  bands: { label: string; count: number; passing: boolean }[];
  /** % right per part of the course (first tries). */
  topics: { name: string; pct: number; questions: number }[];
  /** The five questions fewest got right, with the wrong answer most picked. */
  hardest: { n: number; text: string; pct: number; wrong: { text: string; pct: number } | null }[];
  /** Of those who passed: on the first try, the second, three or more; and how many haven't passed. */
  retakes: { label: string; count: number; passing: boolean }[];
  /** One dot per person: minutes taken on their best try against its score. */
  scatter: { name: string; minutes: number; pct: number; passed: boolean }[];
};

const BANDS: { label: string; from: number; to: number }[] = [
  { label: "Under 40", from: 0, to: 40 }, { label: "40–59", from: 40, to: 60 }, { label: "60–69", from: 60, to: 70 },
  { label: "70–89", from: 70, to: 90 }, { label: "90–99", from: 90, to: 100 }, { label: "100", from: 100, to: 101 },
];

export function quizReport(r: { leaderboard: Ranked[]; questions: QuestionStats[]; passPct: number; topics: { name: string; count: number }[] }): QuizReport {
  const board = r.leaderboard;
  const total = board.length;
  const badge = board.filter((b) => b.badge).length;
  const passed = board.filter((b) => b.passed && !b.badge).length;
  const firstTries = r.questions[0] ? r.questions[0].options.reduce((n, o) => n + o.picked, 0) : 0;

  let at = 0;
  const topics = r.topics.map((t) => {
    const qs = r.questions.slice(at, at + t.count);
    at += t.count;
    return { name: t.name, questions: qs.length, pct: qs.length ? Math.round(qs.reduce((n, q) => n + q.correctPct, 0) / qs.length) : 0 };
  }).filter((t) => t.questions > 0);

  const hardest = r.questions.map((q, i) => {
    const wrong = q.options.map((o, k) => ({ text: o.text, picked: o.picked, k })).filter((o) => o.k !== q.answer && o.picked > 0).sort((a, b) => b.picked - a.picked)[0];
    return { n: i + 1, text: q.text, pct: q.correctPct, wrong: wrong && firstTries ? { text: wrong.text, pct: Math.round((wrong.picked / firstTries) * 100) } : null };
  }).sort((a, b) => a.pct - b.pct || a.n - b.n).slice(0, 5);

  const passers = board.filter((b) => b.passed);
  return {
    outcome: { badge, passed, notPassed: total - badge - passed, total, passPct: total ? Math.round(((badge + passed) / total) * 100) : 0 },
    bands: BANDS.map((b) => ({ label: b.label, count: board.filter((x) => x.pct >= b.from && x.pct < b.to).length, passing: b.from >= r.passPct })),
    topics,
    hardest: firstTries ? hardest : [],
    retakes: [
      { label: "1st try", count: passers.filter((b) => b.tries === 1).length, passing: true },
      { label: "2nd try", count: passers.filter((b) => b.tries === 2).length, passing: true },
      { label: "3+ tries", count: passers.filter((b) => b.tries >= 3).length, passing: true },
      { label: "Not passed yet", count: total - passers.length, passing: false },
    ],
    scatter: board.map((b) => ({ name: b.name, minutes: Math.round((b.seconds / 60) * 10) / 10, pct: b.pct, passed: b.passed })),
  };
}
