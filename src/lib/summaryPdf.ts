import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import { type Cell, type Column, type SummaryDoc, type Table, type TableRow } from "./summaryTables";

/*
 * The summary PDF (owner, 19 Nov): the sections of summaryTables.ts drawn as tables on A4, a table's heading repeated when
 * it runs onto the next page. The standard PDF fonts can't draw ₹ or ▲ / ▼, so amounts read "Rs" and the arrows are drawn.
 */

const A4 = { w: 595.28, h: 841.89 };
const L = 36, R = A4.w - 36, TOP = A4.h - 40, BOTTOM = 46;
const W = R - L;
const INK = rgb(0.11, 0.11, 0.12), MUTED = rgb(0.43, 0.43, 0.45), RULE = rgb(0.88, 0.88, 0.9), BAND = rgb(0.955, 0.958, 0.965), GROUP = rgb(0.92, 0.94, 0.97);
const GREEN = rgb(0.08, 0.5, 0.24), RED = rgb(0.85, 0.18, 0.13), BRAND = rgb(0.75, 0.11, 0.13);
const ROW_H = 15, HEAD_H = 16, PAD = 5;

// WinAnsi: Latin-1 and these; anything else would stop the standard fonts, so it becomes "?".
const EXTRA = new Set([..."€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"]);
export function pdfText(s: string): string {
  return [...s.replace(/₹\s?/g, "Rs ").replace(/[−‐‑]/g, "-").replace(/[▲▼]\s?/g, "").replace(/\s+/g, " ")]
    .map((ch) => (ch.charCodeAt(0) <= 0xff || EXTRA.has(ch) ? ch : "?")).join("");
}

type Fonts = { reg: PDFFont; bold: PDFFont };
const cellOf = (c: Cell) => (typeof c === "string" ? { text: c } : c);

/** Cut to fit, with "...". */
function fit(s: string, font: PDFFont, size: number, max: number): string {
  if (font.widthOfTextAtSize(s, size) <= max) return s;
  let t = s;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > max) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
}
/** Words into lines no wider than `max`. */
function wrap(s: string, font: PDFFont, size: number, max: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of s.split(" ")) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= max || !cur) cur = next;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out;
}

class Writer {
  page!: PDFPage;
  y = TOP;
  pages: PDFPage[] = [];
  readonly doc: PDFDocument;
  readonly f: Fonts;
  readonly kicker: string;
  constructor(doc: PDFDocument, f: Fonts, kicker: string) {
    this.doc = doc; this.f = f; this.kicker = kicker;
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.pages.push(this.page);
    this.y = TOP;
    if (this.pages.length > 1) {
      this.page.drawText(pdfText(this.kicker), { x: L, y: this.y, size: 8, font: this.f.reg, color: MUTED });
      this.y -= 18;
    }
  }
  /** Room for `h` more points, else a new page; true when it turned. */
  need(h: number): boolean {
    if (this.y - h >= BOTTOM) return false;
    this.newPage();
    return true;
  }
  text(s: string, x: number, y: number, size: number, font: PDFFont, color = INK) {
    this.page.drawText(pdfText(s), { x, y, size, font, color });
  }
}

function widths(cols: Column[]): number[] {
  const total = cols.reduce((s, c) => s + (c.width ?? 1), 0);
  return cols.map((c) => ((c.width ?? 1) / total) * W);
}

function tableHead(w: Writer, t: Table, ws: number[]) {
  w.page.drawRectangle({ x: L, y: w.y - HEAD_H, width: W, height: HEAD_H, color: BAND });
  let x = L;
  t.columns.forEach((c, i) => {
    const s = fit(pdfText(c.head), w.f.bold, 7.5, ws[i] - 2 * PAD);
    const tx = c.right ? x + ws[i] - PAD - w.f.bold.widthOfTextAtSize(s, 7.5) : x + PAD;
    w.page.drawText(s, { x: tx, y: w.y - HEAD_H + 5.5, size: 7.5, font: w.f.bold, color: MUTED });
    x += ws[i];
  });
  w.y -= HEAD_H;
}

function arrow(p: PDFPage, x: number, y: number, up: boolean) {
  p.drawSvgPath(up ? "M0,0 L6,0 L3,-5.5 Z" : "M0,-5.5 L6,-5.5 L3,0 Z", { x, y: y + 0.5, color: up ? GREEN : RED, borderWidth: 0 });
}

function tableRow(w: Writer, t: Table, ws: number[], r: TableRow) {
  if (r.group) {
    w.page.drawRectangle({ x: L, y: w.y - ROW_H, width: W, height: ROW_H, color: GROUP });
    w.page.drawText(fit(pdfText(cellOf(r.cells[0]).text), w.f.bold, 8.5, W - 2 * PAD), { x: L + PAD, y: w.y - ROW_H + 4.5, size: 8.5, font: w.f.bold, color: INK });
    w.y -= ROW_H;
    return;
  }
  let x = L;
  r.cells.forEach((raw, i) => {
    const c = cellOf(raw);
    const col = t.columns[i];
    if (!col || !c.text) { x += ws[i] ?? 0; return; }
    const font = r.bold || c.bold ? w.f.bold : w.f.reg;
    const indent = i === 0 && r.indent ? 10 : 0;
    const room = ws[i] - 2 * PAD - indent - (c.tone ? 9 : 0);
    const s = fit(pdfText(c.text), font, 8.5, room);
    const tw = font.widthOfTextAtSize(s, 8.5);
    const color = c.tone === "up" ? GREEN : c.tone === "down" ? RED : c.muted || (r.indent && i === 0) ? MUTED : INK;
    const tx = col.right ? x + ws[i] - PAD - tw : x + PAD + indent + (c.tone ? 9 : 0);
    if (c.tone) arrow(w.page, tx - 9, w.y - ROW_H + 4.5, c.tone === "up");
    w.page.drawText(s, { x: tx, y: w.y - ROW_H + 4.5, size: 8.5, font, color });
    x += ws[i];
  });
  w.y -= ROW_H;
  w.page.drawLine({ start: { x: L, y: w.y }, end: { x: R, y: w.y }, thickness: 0.5, color: RULE });
}

function table(w: Writer, t: Table) {
  const ws = widths(t.columns);
  w.need(HEAD_H + ROW_H * Math.min(3, t.rows.length));
  tableHead(w, t, ws);
  t.rows.forEach((r, i) => {
    // A heading row keeps its rows with it (a GST period, a training day).
    let after = 0;
    if (r.group) while (after < 3 && t.rows[i + 1 + after] && !t.rows[i + 1 + after].group) after++;
    if (w.need(ROW_H * (1 + after))) tableHead(w, t, ws);
    tableRow(w, t, ws, r);
  });
  w.y -= 8;
}

function paragraph(w: Writer, s: string, size: number, font: PDFFont, color = INK, gap = 3) {
  for (const line of wrap(pdfText(s), font, size, W)) {
    w.need(size + gap);
    w.y -= size;
    w.text(line, L, w.y, size, font, color);
    w.y -= gap;
  }
}

/** The PDF's bytes. */
export async function summaryPdf(d: SummaryDoc): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfText(d.kicker));
  doc.setAuthor("Think Health dashboard");
  const f: Fonts = { reg: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const w = new Writer(doc, f, d.kicker);

  w.text("THINK HEALTH", L, w.y, 8, f.bold, BRAND);
  w.y -= 14;
  paragraph(w, d.kicker, 10, f.reg, MUTED, 4);
  paragraph(w, d.headline, 15, f.bold, INK, 5);
  w.y -= 8;

  for (const s of d.sections) {
    w.need(26 + HEAD_H + ROW_H * 2);
    w.page.drawLine({ start: { x: L, y: w.y }, end: { x: R, y: w.y }, thickness: 1, color: RULE });
    w.y -= 15;
    w.text(s.title.toUpperCase(), L, w.y, 9, f.bold, MUTED);
    w.y -= 9;
    for (const b of s.blocks) {
      if ("table" in b) table(w, b.table);
      else if ("note" in b) { paragraph(w, b.note, 7.5, f.reg, MUTED, 2.5); w.y -= 4; }
      else { paragraph(w, b.text, 9.5, f.reg, b.tone === "up" ? GREEN : b.tone === "down" ? RED : INK, 3); w.y -= 3; }
    }
    w.y -= 6;
  }
  // The footer on every page, beside the page number.
  w.pages.forEach((p, i) => {
    const s = `Page ${i + 1} of ${w.pages.length}`;
    const sw = f.reg.widthOfTextAtSize(s, 7.5);
    p.drawText(fit(pdfText(d.footer), f.reg, 7.5, W - sw - 20), { x: L, y: 24, size: 7.5, font: f.reg, color: MUTED });
    p.drawText(s, { x: R - sw, y: 24, size: 7.5, font: f.reg, color: MUTED });
  });
  return doc.save();
}
