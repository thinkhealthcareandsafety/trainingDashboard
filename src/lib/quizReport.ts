import type { QuestionStats, Ranked } from "./quizRules";

/*
 * The quiz report (owner, 16 Nov: "click here to generate report for the quiz" — a top-down dashboard: KPI cards; score
 * distribution, topic mastery, time vs score; the 30-question item analysis; a drill-down table), pure and client-safe,
 * from the results we already send. Scores (KPIs, histogram, scatter) use each person's best try, as the pass rate and
 * the leaderboard do; the question analysis uses first tries, so retakes don't hide what people knew.
 */

export type QuestionReport = {
  n: number; text: string; answered: number; rightPct: number;
  options: { text: string; image?: string; count: number; pct: number; right: boolean }[];
};

export function questionReport(questions: QuestionStats[]): QuestionReport[] {
  return questions.map((q, i) => {
    const answered = q.options.reduce((n, o) => n + o.picked, 0);
    return {
      n: i + 1, text: q.text, answered, rightPct: q.correctPct,
      options: q.options.map((o, k) => ({ text: o.text, ...(o.image ? { image: o.image } : {}), count: o.picked, pct: answered ? Math.round((o.picked / answered) * 100) : 0, right: k === q.answer })),
    };
  });
}

export type Item = QuestionReport & { topic: string; wrong: { text: string; pct: number } | null; discrimination: number | null };
export type QuizReportData = {
  kpi: { started: number; finished: number; completionPct: number; avgCorrect: number; of: number; avgPct: number; passPct: number; passed: number; avgSeconds: number };
  /** Best scores (questions right) in brackets; \`passing\` = the bracket clears the pass mark. */
  histogram: { label: string; count: number; passing: boolean }[];
  topics: { name: string; pct: number; questions: number }[];
  scatter: { name: string; minutes: number; pct: number; passed: boolean }[];
  items: Item[];
};

export function buildReport(r: { leaderboard: Ranked[]; questions: QuestionStats[]; passPct: number; started: number; finished: number }): QuizReportData {
  const board = r.leaderboard;
  const of = r.questions.length || 30;
  const total = board.length;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const passed = board.filter((b) => b.passed).length;
  const passCorrect = Math.ceil((r.passPct / 100) * of); // 21 of 30
  const brackets = of === 30
    ? [{ label: "0–10", from: 0, to: 10 }, { label: "11–20", from: 11, to: 20 }, { label: "21–25", from: 21, to: 25 }, { label: "26–30", from: 26, to: 30 }]
    : [{ label: `0–${Math.floor(of / 3)}`, from: 0, to: Math.floor(of / 3) }, { label: `${Math.floor(of / 3) + 1}–${passCorrect - 1}`, from: Math.floor(of / 3) + 1, to: passCorrect - 1 }, { label: `${passCorrect}–${of}`, from: passCorrect, to: of }];
  const items = questionReport(r.questions).map((q, i): Item => {
    const s = r.questions[i];
    const wrong = q.options.filter((o) => !o.right && o.count > 0).sort((a, b) => b.count - a.count)[0];
    return { ...q, topic: s.topic ?? "", wrong: wrong ? { text: wrong.text, pct: wrong.pct } : null, discrimination: s.discrimination };
  });
  const topicNames = [...new Set(items.map((q) => q.topic).filter(Boolean))];
  return {
    kpi: {
      started: r.started, finished: r.finished, completionPct: r.started ? Math.round((r.finished / r.started) * 100) : 0,
      avgCorrect: Math.round(mean(board.map((b) => b.correct)) * 10) / 10, of, avgPct: Math.round(mean(board.map((b) => b.pct))),
      passPct: total ? Math.round((passed / total) * 100) : 0, passed, avgSeconds: Math.round(mean(board.map((b) => b.seconds))),
    },
    histogram: brackets.map((b) => ({ label: b.label, count: board.filter((x) => x.correct >= b.from && x.correct <= b.to).length, passing: b.from >= passCorrect })),
    topics: topicNames.map((name) => { const qs = items.filter((q) => q.topic === name); return { name, questions: qs.length, pct: Math.round(mean(qs.map((q) => q.rightPct))) }; }),
    scatter: board.map((b) => ({ name: b.name, minutes: Math.round((b.seconds / 60) * 10) / 10, pct: b.pct, passed: b.passed })),
    items,
  };
}

/** The heatmap's colour for a share right (owner: "shaded from green (high accuracy) to red (low)"): red → grey → green. */
export function accuracyColor(pct: number): { bg: string; ink: "light" | "dark" } {
  const stops: [number, [number, number, number]][] = [[0, [180, 35, 24]], [50, [200, 209, 216]], [100, [31, 122, 77]]];
  const p = Math.max(0, Math.min(100, pct));
  const [a, b] = p <= 50 ? [stops[0], stops[1]] : [stops[1], stops[2]];
  const t = (p - a[0]) / (b[0] - a[0]);
  const c = a[1].map((v, i) => Math.round(v + (b[1][i] - v) * t)) as [number, number, number];
  const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  return { bg: `rgb(${c.join(" ")})`, ink: lum > 0.55 ? "dark" : "light" };
}

export const fmtSeconds = (s: number) => `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
