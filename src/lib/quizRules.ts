import { type Quiz, QUIZZES } from "./quizCprAed";

/*
 * The quiz (owner, 13 Nov), pure: which quiz a training gets, the questions as participants see them (no answers until
 * they're revealed), scoring (the form's marking: 10 points each, 70% to pass, 100% = First Aid Badge), retakes after a
 * fail (owner, 14 Nov), the leaderboard (best try, then the faster finish) and the per-question analytics (first tries).
 */

/** A training's quiz, by its items: CPR / AED / Basic Life Support trainings get the CPR-AED quiz; others have none yet. */
export function quizFor(titles: string[]): Quiz | null {
  return titles.some((t) => /\bcpr\b|\baed\b|basic life|\bbls\b/i.test(t)) ? QUIZZES.find((q) => q.id === "cpr-aed") ?? null : null;
}

export type PublicQuiz = Omit<Quiz, "questions"> & { questions: { id: string; text: string; options: { text: string; image?: string }[]; answer?: number }[] };
/** The quiz as a participant sees it: the right answers only once revealed. */
export const publicQuiz = (quiz: Quiz, reveal: boolean): PublicQuiz => ({
  ...quiz,
  questions: quiz.questions.map((x) => ({ id: x.id, text: x.text, options: x.options, ...(reveal ? { answer: x.answer } : {}) })),
});

/** The answers sent: one option index per question, every question answered. */
export function readAnswers(raw: unknown, quiz: Quiz): number[] | { error: string } {
  if (!Array.isArray(raw) || raw.length !== quiz.questions.length) return { error: `Answer all ${quiz.questions.length} questions` };
  const out: number[] = [];
  for (const [i, v] of raw.entries()) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n >= quiz.questions[i].options.length) return { error: `Question ${i + 1} needs an answer` };
    out.push(n);
  }
  return out;
}

export type Score = { correct: number; total: number; points: number; max: number; pct: number; passed: boolean; badge: boolean };
export function scoreOf(quiz: Quiz, answers: number[]): Score {
  const correct = quiz.questions.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);
  const total = quiz.questions.length;
  const pct = total ? Math.round((correct / total) * 1000) / 10 : 0;
  return { correct, total, points: correct * quiz.pointsEach, max: total * quiz.pointsEach, pct, passed: pct >= quiz.passPct, badge: pct >= quiz.badgePct };
}

/** A finished attempt; `n` = which try it was (1, 2, …) — retakes after a fail (owner, 14 Nov). */
export type Attempt = { th: string; name: string; answers: number[]; startedAt: string; finishedAt: string; points: number; correct: number; n?: number };
export type Ranked = { rank: number; th: string; name: string; points: number; correct: number; pct: number; seconds: number; passed: boolean; badge: boolean; tries: number };

const msOf = (a: Attempt) => Math.max(0, Date.parse(a.finishedAt) - Date.parse(a.startedAt));
const tryNo = (a: Attempt) => a.n ?? 1;
const byPerson = (attempts: Attempt[]) => {
  const m = new Map<string, Attempt[]>();
  for (const a of attempts) m.set(a.th, [...(m.get(a.th) ?? []), a]);
  return m;
};

/** Each person's best try: most points, then the faster finish, then the earlier one. */
export function bestAttempts(quiz: Quiz, attempts: Attempt[]): Attempt[] {
  return [...byPerson(attempts).values()].map((list) => [...list].sort((x, y) =>
    scoreOf(quiz, y.answers).points - scoreOf(quiz, x.answers).points || msOf(x) - msOf(y) || x.finishedAt.localeCompare(y.finishedAt))[0]);
}
/** Each person's first try — what they knew before any retake (the coordinator's per-question analytics). */
export function firstAttempts(attempts: Attempt[]): Attempt[] {
  return [...byPerson(attempts).values()].map((list) => [...list].sort((x, y) => tryNo(x) - tryNo(y) || x.finishedAt.localeCompare(y.finishedAt))[0]);
}
/** Passed on any try. */
export const passedAny = (quiz: Quiz, mine: Attempt[]) => mine.some((a) => scoreOf(quiz, a.answers).passed);
/** Another try (owner, 14 Nov: "otherwise let them have the option to retake the test"): only after a fail, never once passed. */
export const canRetake = (quiz: Quiz, mine: Attempt[]) => mine.length > 0 && !passedAny(quiz, mine);

/**
 * Ranked on each person's best try by points; a tie goes to the faster finish (time from opening the quiz to submitting),
 * then who finished first. `tries` = how many times they sent their answers.
 */
export function leaderboard(quiz: Quiz, attempts: Attempt[]): Ranked[] {
  const tries = new Map([...byPerson(attempts)].map(([th, list]) => [th, list.length]));
  // Scored from the answers every time (never a stored number), so a corrected answer key re-ranks everyone.
  const scored = bestAttempts(quiz, attempts).map((a) => ({ a, s: scoreOf(quiz, a.answers), ms: msOf(a) }));
  scored.sort((x, y) => y.s.points - x.s.points || x.ms - y.ms || x.a.finishedAt.localeCompare(y.a.finishedAt));
  return scored.map(({ a, s, ms: t }, i) => ({ rank: i + 1, th: a.th, name: a.name, points: s.points, correct: s.correct, pct: s.pct, seconds: Math.round(t / 1000), passed: s.passed, badge: s.badge, tries: tries.get(a.th) ?? 1 }));
}

export type QuestionStats = { id: string; text: string; answer: number; options: { text: string; image?: string; picked: number }[]; correctPct: number };
/** For the coordinator: per question, how many picked each option, the right one, and how many got it (first tries only). */
export function analytics(quiz: Quiz, all: Attempt[]): QuestionStats[] {
  const attempts = firstAttempts(all);
  return quiz.questions.map((q, i) => {
    const picked = q.options.map((_, o) => attempts.filter((a) => a.answers[i] === o).length);
    return { id: q.id, text: q.text, answer: q.answer, options: q.options.map((o, k) => ({ ...o, picked: picked[k] })), correctPct: attempts.length ? Math.round((picked[q.answer] / attempts.length) * 100) : 0 };
  });
}
