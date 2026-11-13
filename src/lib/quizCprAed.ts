/*
 * The CPR-AED quiz (owner, 13 Nov: "this is the quiz form" — "CPR-AED Quiz - by Think Health", Google Forms), copied in
 * so the portal doesn't depend on Google: the 30 questions, their options and pictures (public/portal/quiz/), 10 points
 * each, 70% to pass, 100% earns a free First Aid Badge. The form's name / phone / email / location questions are left out
 * (the portal knows who each participant is). `answer` = the index of the right option (owner confirmed the key, 13 Nov).
 * Every question is required here (in the form Q26–30 were optional), so everyone is scored out of the same 300.
 */
export type QuizOption = { text: string; image?: string };
export type QuizQuestion = { id: string; text: string; options: QuizOption[]; answer: number };
export type Quiz = { id: string; title: string; intro: string[]; pointsEach: number; passPct: number; badgePct: number; badge: string; questions: QuizQuestion[] };

const img = (file: string) => `/portal/quiz/${file}`;
const q = (n: number, text: string, options: (string | QuizOption)[], answer: number): QuizQuestion =>
  ({ id: `q${n}`, text, options: options.map((o) => (typeof o === "string" ? { text: o } : o)), answer });

export const CPR_AED_QUIZ: Quiz = {
  id: "cpr-aed",
  title: "CPR-AED Quiz",
  intro: ["Basic Life Support Training by Think Health", "You must score at least 70% to pass.", "Participants who score 100% will receive a free First Aid Badge."],
  pointsEach: 10,
  passPct: 70,
  badgePct: 100,
  badge: "First Aid Badge",
  questions: [
    q(1, "What is First Aid?", ["Treatment provided by doctors", "Immediate help given to a person who is ill or injured"], 1),
    q(2, "What is the role of First Aider?", ["Call for Help", "Declare Dead", "Give Medications"], 0),
    q(3, "What is the first thing you should check when you arrive at an emergency scene?", ["Check for Danger", "Check for Response", "Check for Pulse", "Check for Breathing"], 0),
    q(4, "If you are not sure how to handle a danger, what should you do?", ["Try anyway", "Call someone who can handle it"], 1),
    q(5, "After ensuring the scene is safe, what should you check next?", ["Pulse", "Breathing", "Response", "Injuries"], 2),
    q(6, "How do you check if a person is responsive?", ["Give water", "Tap the shoulder and shout in the ear", "Check pulse", "Start CPR"], 1),
    q(7, "How do you quickly check for breathing?", ["Use AED machine", "Check pulse", "Open Airway and Perform - Look, Listen & Feel", "Ask others"], 2),
    q(8, "When should you start CPR?", ["Person is talking", "Person is not responding and not breathing", "Person is breathing normally", "Person is sleeping"], 1),
    q(9, "What is the full form of CPR?", ["Cardiac Pulse Recovery", "Cardiopulmonary Resuscitation", "Cardio Pressure Response", "Circulation Pulse Restart"], 1),
    q(10, "What are the CPR age groups?", ["Adult, Child, Infant", "Young, Old", "Male, Female"], 0),
    q(11, "What is the correct age group for a child in CPR?", ["10-18 years", "1-8 years", "2-15 years", "0-7 years"], 1),
    q(12, "What is the CPR mantra?", ["Push Hard, Push Fast in the Center of the Chest", "Slow and soft Compressions", "Call Ambulance and Wait"], 0),
    q(13, "Which is the right place of compression for adult victims?", [
      { text: "Above the Center", image: img("q13a.jpg") }, { text: "Exactly in the Center", image: img("q13b.jpg") },
      { text: "Below the Center Line", image: img("q13c.jpg") }, { text: "Center but on Left Side", image: img("q13d.jpg") },
    ], 1),
    q(14, "What is the minimum compression depth required for adult victims?", ["1-2 cm", "4-5 cm", "5 cm", "More than 10 cm"], 2),
    q(15, "What is the CPR speed per minute?", ["60-80", "80-100", "100-120", "140"], 2),
    q(16, "What should you do if ribs break during CPR?", ["Stop CPR", "Continue CPR", "Wait", "Leave"], 1),
    q(17, "How to perform CPR on a 12-year-old drowning victim?", [
      { text: "Two Fingers", image: img("q17a.png") }, { text: "One Hand", image: img("q17b.png") }, { text: "Two Hands", image: img("q17c.png") },
    ], 2),
    q(18, "What does AED stand for?", ["Automatic Emergency Device", "Automated External Defibrillator", "Advanced Electric Device"], 1),
    q(19, "What is the correct placement of AED pads for an adult?", [
      { text: "A", image: img("q19a.jpg") }, { text: "B", image: img("q19b.jpg") }, { text: "C", image: img("q19c.jpg") },
    ], 1),
    q(20, "What is the correct placement of AED pads for an infant or a child?", [
      { text: "A", image: img("q20a.jpg") }, { text: "B", image: img("q20b.jpg") }, { text: "C", image: img("q20c.jpg") },
    ], 1),
    q(21, "Select the right power button of an AED", [
      { text: "A", image: img("q21a.png") }, { text: "B", image: img("q21b.png") }, { text: "C", image: img("q21c.png") }, { text: "D", image: img("q21d.png") },
    ], 3),
    q(22, "Select the right Shock button of an AED", [
      { text: "A", image: img("q22a.png") }, { text: "B", image: img("q22b.png") }, { text: "C", image: img("q22c.png") }, { text: "D", image: img("q22d.png") },
    ], 3),
    q(23, "Why do we use an AED?", ["Give oxygen", "Check BP", "Reduce pain", "Defibrillate the heart with a shock"], 3),
    q(24, "What changes are required when using an AED on a child?", ["Don't use AED", "Same as adult", "Use child pads / child key and change pad position", "Increase shock"], 2),
    q(25, "What are the roles of an AED operator?", ["Declare that they are the AED operator and follow AED prompts", "Wait for help", "Call for doctor"], 0),
    q(26, "Difference between heart attack & cardiac arrest?", ["Same", "Heart attack means blockage & cardiac arrest means irregular rhythm"], 1),
    q(27, "What is the best way to handle a heart attack victim?", [
      { text: "Walk them", image: img("q27a.jpg") }, { text: "Put in W Position", image: img("q27b.jpg") },
      { text: "Give Water", image: img("q27c.jpg") }, { text: "Start CPR", image: img("q27d.jpg") },
    ], 1),
    q(28, "Can an AED be used during a heart attack?", ["Only if a person is unconscious & not breathing", "Yes, always", "No", "Only doctors"], 0),
    q(29, "What are the symptoms of a heart attack?", ["Chest pain", "Sweating", "Breathing problem", "All of the above"], 3),
    q(30, "If the person starts breathing, what should you do next?", [
      { text: "Give Water", image: img("q30a.jpg") }, { text: "Continue CPR", image: img("q30b.jpg") },
      { text: "Recovery Position", image: img("q30c.jpg") }, { text: "W Position", image: img("q30d.jpg") },
    ], 2),
  ],
};

export const QUIZZES: Quiz[] = [CPR_AED_QUIZ];
