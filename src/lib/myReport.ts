/*
 * A participant's report as a story (owner, 16 Nov: "replace confusing statistical jargon with metrics that tell a story
 * about the participant"): a persona badge from their score, a speed flashcard against the group's average, and their one or two most critical mistakes as learning moments.
 * Pure and client-safe.
 */

export type Persona = { title: string; line: string; tier: "rookie" | "lifesaver" | "maestro" };
/** Owner's examples: "CPR Rookie", "Certified Lifesaver", "Emergency Maestro". */
export function persona(pct: number, passPct: number): Persona {
  if (pct >= 100) return { tier: "maestro", title: "Emergency Maestro", line: "A perfect score. You know exactly what to do when it counts." };
  if (pct >= passPct) return { tier: "lifesaver", title: "Certified Lifesaver", line: "You passed. You're ready to step in and help someone in an emergency." };
  return { tier: "rookie", title: "CPR Rookie", line: "A solid start. One more go and you'll be a Certified Lifesaver." };
}

export type Speed = { seconds: number; avg: number; diff: number; line: string };
/** Their time against the group's average (best tries), with a playful line. */
export function speed(seconds: number, everyone: number[], passed: boolean): Speed {
  const avg = everyone.length ? Math.round(everyone.reduce((a, b) => a + b, 0) / everyone.length) : seconds;
  const diff = seconds - avg;
  const fast = diff <= -Math.max(30, avg * 0.25), slow = diff >= Math.max(30, avg * 0.25);
  const line = everyone.length < 2 ? "You're the first to finish. Nothing to race against yet."
    : fast && passed ? "Blazing fast, and right. Quick and sure."
    : fast ? "Blazing fast. Next time slow down a little and read every option."
    : slow && passed ? "You took your time, and it paid off. Careful wins."
    : slow ? "You took your time. A little more practice and it'll feel natural."
    : passed ? "Right on pace, and right on the money." : "Right on pace. Use the learning moments below to close the gap.";
  return { seconds, avg, diff, line };
}

export type Moment = { n: number; text: string; chose: string; right: string; lesson: string; critical: boolean };
/** Their one or two most important mistakes (critical safety questions first), once the right answers are out. */
export function learningMoments(questions: { text: string; options: { text: string }[]; answer?: number; critical?: boolean; lesson?: string }[], answers: number[], max = 2): Moment[] {
  return questions
    .map((q, i) => ({ q, i }))
    .filter(({ q, i }) => q.answer !== undefined && answers[i] !== q.answer)
    .sort((a, b) => Number(Boolean(b.q.critical)) - Number(Boolean(a.q.critical)) || a.i - b.i)
    .slice(0, max)
    .map(({ q, i }) => ({ n: i + 1, text: q.text, chose: q.options[answers[i]]?.text ?? "No answer", right: q.options[q.answer!]?.text ?? "", lesson: q.lesson ?? `The right answer is "${q.options[q.answer!]?.text ?? ""}".`, critical: Boolean(q.critical) }));
}
