import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import { persona, speed } from "./myReport";

/*
 * A participant's report as a PDF (owner, 17 Nov): when they didn't save their report themselves, it goes with the
 * thank-you email. The same story as My report, plainer: who they are (the persona), their score and rank, their speed
 * against the group, every question as a right / wrong tile, and each one they missed with their pick, the right answer
 * and the lesson. Their own answers only. Usually one A4 page; more pages only when many were missed.
 */

export type ReportPdfFacts = {
  title: string; name: string; th: string; training: string; passPct: number;
  questions: { text: string; options: { text: string }[]; answer?: number; lesson?: string }[];
  everyone: number[];
  result: { pct: number; correct: number; total: number; passed: boolean; badge: boolean; rank: number; of: number; seconds: number; answers: number[] };
};

const NAVY = rgb(3 / 255, 79 / 255, 114 / 255);
const INK = rgb(15 / 255, 42 / 255, 58 / 255);
const INK2 = rgb(58 / 255, 82 / 255, 99 / 255);
const MUTED = rgb(88 / 255, 112 / 255, 128 / 255);
const LINE = rgb(211 / 255, 223 / 255, 231 / 255);
const GROUND = rgb(242 / 255, 246 / 255, 249 / 255);
const RIGHT = rgb(31 / 255, 122 / 255, 77 / 255);
const WRONG = rgb(180 / 255, 35 / 255, 24 / 255);
const WHITE = rgb(1, 1, 1);

/** The standard PDF fonts speak WinAnsi only: curly quotes, dashes and ₹ become plain ones; anything else a "?". */
export function plain(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/₹/g, "Rs ").replace(/\s+/g, " ")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "?").trim();
}

const mmss = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}` : `${s} s`);

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of plain(text).split(" ")) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
    else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out;
}

export async function reportPdf(f: ReportPdfFacts): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(plain(`${f.name} - ${f.title} report`));
  doc.setAuthor("Think Health");
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 48, CW = W - M * 2;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H;
  const text = (s: string, x: number, yy: number, size: number, font: PDFFont, color = INK) => page.drawText(plain(s), { x, y: yy, size, font, color });
  const footer = () => text("Think Health  ·  learn@thinkhealth.in  ·  thinkhealth.in", M, 28, 8.5, reg, MUTED);
  const room = (need: number) => { if (y - need < 56) { footer(); page = doc.addPage([W, H]); y = H - M; } };

  // The band: who and what.
  page.drawRectangle({ x: 0, y: H - 120, width: W, height: 120, color: NAVY });
  text("THINK HEALTH", M, H - 40, 9, bold, rgb(1, 1, 1));
  text("My report", M, H - 72, 26, bold, WHITE);
  text(`${f.title}  ·  ${f.training}`, M, H - 96, 11, reg, rgb(0.85, 0.9, 0.93));
  y = H - 150;

  // The persona.
  const r = f.result;
  const who = persona(r.pct, f.passPct);
  text(`${f.name} (${f.th}) is a`, M, y, 11, reg, MUTED);
  y -= 30;
  text(who.title, M, y, 24, bold, NAVY);
  y -= 20;
  for (const l of wrap(who.line, reg, 11.5, CW)) { text(l, M, y, 11.5, reg, INK2); y -= 15; }
  y -= 10;

  // Three figures in mist tiles.
  const pace = speed(r.seconds, f.everyone, r.passed);
  const tiles: [string, string][] = [[`${r.pct}%`, `${r.correct} of ${r.total} right${r.badge ? " · badge" : r.passed ? " · passed" : ""}`], [`#${r.rank}`, `of ${r.of} who finished`], [mmss(pace.seconds), f.everyone.length > 1 ? `average ${mmss(pace.avg)}` : "your time"]];
  const tw = (CW - 16) / 3;
  tiles.forEach(([v, l], i) => {
    const x = M + i * (tw + 8);
    page.drawRectangle({ x, y: y - 58, width: tw, height: 58, color: GROUND });
    text(v, x + 12, y - 30, 20, bold, INK);
    text(l, x + 12, y - 47, 9.5, reg, MUTED);
  });
  y -= 76;
  for (const l of wrap(pace.line, reg, 11, CW)) { text(l, M, y, 11, reg, INK2); y -= 14; }
  y -= 14;

  // Every question as a tile: right or wrong.
  text("Your answers", M, y, 14, bold, INK);
  y -= 10;
  const per = Math.min(15, f.questions.length || 1), gap = 4, size = (CW - gap * (per - 1)) / per;
  f.questions.forEach((q, i) => {
    const col = i % per, row = Math.floor(i / per);
    const ok = q.answer !== undefined && r.answers[i] === q.answer;
    const x = M + col * (size + gap), yy = y - (row + 1) * (22 + gap);
    page.drawRectangle({ x, y: yy, width: size, height: 22, color: ok ? RIGHT : WRONG });
    const n = String(i + 1);
    text(n, x + size / 2 - bold.widthOfTextAtSize(n, 9) / 2, yy + 7.5, 9, bold, WHITE);
  });
  y -= Math.ceil(f.questions.length / per) * (22 + gap) + 8;
  text("Green: right.  Red: to look at again.", M, y, 9, reg, MUTED);
  y -= 26;

  // What to remember: each one missed, with their pick, the right answer and the lesson.
  const missed = f.questions.map((q, i) => ({ q, i })).filter(({ q, i }) => q.answer !== undefined && r.answers[i] !== q.answer);
  room(40);
  text(missed.length ? "What to remember" : "Nothing to fix: every answer was right.", M, y, 14, bold, INK);
  y -= 20;
  for (const { q, i } of missed) {
    const head = wrap(`${i + 1}. ${q.text}`, bold, 11, CW);
    const chose = wrap(`You chose: ${q.options[r.answers[i]]?.text ?? "no answer"}`, reg, 10.5, CW - 10);
    const right = wrap(`Right answer: ${q.options[q.answer!]?.text ?? ""}`, bold, 10.5, CW - 10);
    const lesson = q.lesson ? wrap(q.lesson, reg, 10.5, CW - 10) : [];
    room((head.length + chose.length + right.length + lesson.length) * 14 + 20);
    for (const l of head) { text(l, M, y, 11, bold, INK); y -= 14; }
    for (const l of chose) { text(l, M + 10, y, 10.5, reg, WRONG); y -= 13.5; }
    for (const l of right) { text(l, M + 10, y, 10.5, bold, RIGHT); y -= 13.5; }
    for (const l of lesson) { text(l, M + 10, y, 10.5, reg, INK2); y -= 13.5; }
    y -= 4;
    page.drawLine({ start: { x: M, y }, end: { x: M + CW, y }, thickness: 0.5, color: LINE });
    y -= 14;
  }
  footer();
  return doc.save();
}

/** The report's file name: "My report - Asha Rao.pdf". */
export const reportFileName = (name: string) => `My report - ${name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Think Health"}.pdf`;
