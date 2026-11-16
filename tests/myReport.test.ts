import { test } from "node:test";
import assert from "node:assert/strict";
import { learningMoments, persona, speed, superpowerAndKryptonite } from "@/lib/myReport";
import { publicQuiz } from "@/lib/quizRules";
import { CPR_AED_QUIZ } from "@/lib/quizCprAed";

// A participant's report as a story (owner, 16 Nov).
test("persona: CPR Rookie below the pass mark, Certified Lifesaver from it, Emergency Maestro at 100%", () => {
  assert.equal(persona(60, 70).title, "CPR Rookie");
  assert.equal(persona(70, 70).title, "Certified Lifesaver");
  assert.equal(persona(96.7, 70).title, "Certified Lifesaver");
  assert.equal(persona(100, 70).title, "Emergency Maestro");
});

test("superpower and kryptonite: best and weakest topic, named; no kryptonite on a clean sweep", () => {
  const t = [{ name: "First Aid basics", right: 7, of: 8 }, { name: "CPR", right: 5, of: 9 }, { name: "AED", right: 8, of: 8 }, { name: "Heart attack", right: 4, of: 5 }];
  const r = superpowerAndKryptonite(t);
  assert.deepEqual([r.power?.title, r.weak?.title], ["AED Setup Master", "Chest compressions"]);
  assert.equal(superpowerAndKryptonite(t.map((x) => ({ ...x, right: x.of }))).weak, null);
});

test("speed: against everyone's average, with a line that fits", () => {
  const s = speed(240, [240, 600, 660], true);
  assert.deepEqual([s.avg, s.diff], [500, -260]);
  assert.match(s.line, /Blazing fast, and right/);
  assert.match(speed(240, [240, 600, 660], false).line, /slow down/);
  assert.match(speed(300, [300], true).line, /first to finish/);
});

test("learning moments: only once revealed, critical safety mistakes first, at most two; lessons never sent before the reveal", () => {
  const hidden = publicQuiz(CPR_AED_QUIZ, false).questions;
  assert.ok(hidden.every((q) => q.answer === undefined && q.lesson === undefined && q.critical === undefined));
  const shown = publicQuiz(CPR_AED_QUIZ, true).questions;
  const answers = CPR_AED_QUIZ.questions.map((q, i) => (i === 0 || i === 13 || i === 27 ? (q.answer + 1) % q.options.length : q.answer)); // Q1, Q14 (critical), Q28 (critical) wrong
  const m = learningMoments(shown, answers);
  assert.deepEqual(m.map((x) => [x.n, x.critical]), [[14, true], [28, true]]);
  assert.match(m[0].lesson, /5 cm/);
  assert.deepEqual(learningMoments(hidden, answers), []); // nothing before the answers are out
  assert.deepEqual(learningMoments(shown, CPR_AED_QUIZ.questions.map((q) => q.answer)), []);
});
