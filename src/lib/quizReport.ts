import type { QuestionStats } from "./quizRules";

/*
 * The quiz report (owner, 16 Nov: "the reports are not for one individual but for all participants combined … make them
 * question wise, every question and people's combined result"), pure and client-safe: per question, how many answered
 * (first tries), how many got it right, and each option's count and share.
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

/** "Hardest first": fewest right on top; ties keep the quiz's order. */
export const hardestFirst = (list: QuestionReport[]) => [...list].sort((a, b) => a.rightPct - b.rightPct || a.n - b.n);
