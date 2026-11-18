import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import { type DaySums, PEOPLE, type Remark, type Side, fyLines, inrShort, monthly, remarks, vsLastYear } from "./overviewMath";
import { plain } from "./reportPdf";

/*
 * The Overview as a PDF for Sumit (owner, 18 Nov: "all the reports of that Overview page — Company's, Sumit's,
 * Ashish's, Pranjal's — in a PDF, sent automatically to sshah@thinkhealth.in at 7 pm, daily; and a monthly report at
 * the end of every month"). One A4 page per person, the same figures as the Overview (salespeople against the
 * company's last year):
 *  - daily: Today, This week, This month, This year — each against last year, with its green / red remarks — then this
 *    FY against last FY day by day (running totals) for quotations and for invoices;
 *  - monthly: the month and the year so far against last year, the FY month by month, and the same two charts.
 * The standard PDF fonts can't draw ₹, so amounts read "Rs" (as in the other PDFs).
 */

export type ReportKind = "daily" | "monthly";
const VS_COMPANY = true; // as on the Overview

const W = 595.28, H = 841.89, M = 40;
const INK = rgb(0.11, 0.11, 0.12), INK2 = rgb(0.23, 0.23, 0.24), MUTED = rgb(0.43, 0.43, 0.45), LINE = rgb(0.88, 0.88, 0.9);
const GROUND = rgb(0.96, 0.96, 0.97), BRAND = rgb(15 / 255, 118 / 255, 110 / 255), GOOD = rgb(21 / 255, 128 / 255, 61 / 255), BAD = rgb(217 / 255, 45 / 255, 32 / 255);
const S1 = rgb(13 / 255, 148 / 255, 136 / 255), S2 = rgb(124 / 255, 58 / 255, 237 / 255), GREY = rgb(0.63, 0.63, 0.65), WHITE = rgb(1, 1, 1);

type Fonts = { reg: PDFFont; bold: PDFFont };
const money = (n: number) => plain(inrShort(n));
const longDate = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const monthName = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

function text(p: PDFPage, s: string, x: number, y: number, size: number, font: PDFFont, color = INK, maxW?: number) {
  let t = plain(s);
  if (maxW && font.widthOfTextAtSize(t, size) > maxW) {
    while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > maxW) t = t.slice(0, -1);
    t = `${t.trimEnd()}...`;
  }
  p.drawText(t, { x, y, size, font, color });
}
const right = (p: PDFPage, s: string, xr: number, y: number, size: number, font: PDFFont, color = INK) => text(p, s, xr - font.widthOfTextAtSize(plain(s), size), y, size, font, color);

/** A side of a row: a title, then quotations, invoiced and conversion. */
function sideBox(p: PDFPage, f: Fonts, x: number, y: number, w: number, h: number, title: string, s: Side, tint: boolean) {
  if (tint) p.drawRectangle({ x, y: y - h, width: w, height: h, color: GROUND });
  else p.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: LINE, borderWidth: 0.8 });
  text(p, title, x + 10, y - 15, 9.5, f.bold, INK2, w - 20);
  const cw = (w - 20) / 3;
  [["Quotations", money(s.quoted)], ["Invoiced", money(s.invoiced)], ["Conversion", s.conversion === null ? "-" : `${s.conversion}%`]].forEach(([l, v], i) => {
    text(p, l, x + 10 + i * cw, y - 30, 8, f.reg, MUTED);
    text(p, v, x + 10 + i * cw, y - 46, 13, f.bold, INK, cw - 4);
  });
}

/** One Overview row: this period, last year, and the remarks under them. Returns its height. */
function row(p: PDFPage, f: Fonts, y: number, title: string, nowTitle: string, lastTitle: string, now: Side, last: Side, lines: Remark[]): number {
  const half = (W - 2 * M - 10) / 2, boxH = 54;
  text(p, title, M, y - 10, 11.5, f.bold, INK);
  sideBox(p, f, M, y - 16, half, boxH, nowTitle, now, false);
  sideBox(p, f, M + half + 10, y - 16, half, boxH, lastTitle, last, true);
  let ly = y - 16 - boxH - 13;
  for (const l of lines) {
    const c = l.tone === "good" ? GOOD : l.tone === "bad" ? BAD : MUTED;
    text(p, l.tone === "good" ? "+" : l.tone === "bad" ? "-" : "·", M + 2, ly, 9.5, f.bold, c);
    text(p, l.text, M + 14, ly, 9, f.reg, l.tone === "neutral" ? INK2 : c, W - 2 * M - 14);
    ly -= 12;
  }
  return y - ly + 4;
}

/** This FY against last FY, day by day (running totals): x = days from 1 April, y = rupees. */
function fyChart(p: PDFPage, f: Fonts, x: number, y: number, w: number, h: number, title: string, now: number[], last: number[], color: ReturnType<typeof rgb>) {
  p.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: LINE, borderWidth: 0.8 });
  text(p, title, x + 10, y - 15, 10.5, f.bold, INK);
  text(p, `This FY so far ${money(now.at(-1) ?? 0)} · last FY by now ${money(last[now.length - 1] ?? 0)}`, x + 10, y - 41, 7.5, f.reg, MUTED, w - 20);
  p.drawLine({ start: { x: x + 10, y: y - 26 }, end: { x: x + 22, y: y - 26 }, thickness: 1.6, color });
  text(p, "This FY", x + 26, y - 29, 7.5, f.reg, INK2);
  p.drawLine({ start: { x: x + 66, y: y - 26 }, end: { x: x + 78, y: y - 26 }, thickness: 1.2, color: GREY });
  text(p, "Last FY", x + 82, y - 29, 7.5, f.reg, INK2);
  const pl = x + 42, pr = x + w - 10, pt = y - 52, pb = y - h + 18;
  const max = Math.max(1, ...now, ...last) * 1.05;
  const px = (k: number) => pl + (last.length <= 1 ? 0 : (k / (last.length - 1)) * (pr - pl));
  const py = (v: number) => pb + (v / max) * (pt - pb);
  for (const fr of [0, 0.5, 1]) {
    p.drawLine({ start: { x: pl, y: py(max * fr) }, end: { x: pr, y: py(max * fr) }, thickness: 0.5, color: LINE });
    right(p, money(max * fr), pl - 4, py(max * fr) - 3, 6.5, f.reg, MUTED);
  }
  ["Apr", "Jun", "Aug", "Oct", "Dec", "Feb"].forEach((m, i) => text(p, m, px(Math.round((i * 2 * last.length) / 12)), pb - 11, 6.5, f.reg, MUTED));
  const draw = (vals: number[], c: ReturnType<typeof rgb>, t: number) => {
    const step = Math.max(1, Math.floor(vals.length / 120)); // ~120 segments are plenty at this size
    for (let k = step; k < vals.length; k += step) p.drawLine({ start: { x: px(k - step), y: py(vals[k - step]) }, end: { x: px(k), y: py(vals[k]) }, thickness: t, color: c });
    const lastK = vals.length - 1;
    if (lastK % step) p.drawLine({ start: { x: px(lastK - (lastK % step)), y: py(vals[lastK - (lastK % step)]) }, end: { x: px(lastK), y: py(vals[lastK]) }, thickness: t, color: c });
  };
  draw(last, GREY, 0.9);
  draw(now, color, 1.6);
}

function header(p: PDFPage, f: Fonts, kicker: string, who: string, when: string, pageNo: number, pages: number) {
  p.drawRectangle({ x: 0, y: H - 74, width: W, height: 74, color: BRAND });
  text(p, `Think Health · ${kicker}`, M, H - 30, 10, f.reg, WHITE);
  text(p, who, M, H - 56, 20, f.bold, WHITE);
  right(p, when, W - M, H - 30, 10, f.reg, WHITE);
  right(p, `${pageNo} / ${pages}`, W - M, H - 56, 9, f.reg, WHITE);
}

/** The report: one page per person (Company, Sumit, Ashish, Pranjal), for the day `on` (yyyy-mm-dd, India). */
export async function overviewReportPdf(days: DaySums, on: string, kind: ReportKind): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Think Health ${kind === "daily" ? "daily" : "monthly"} report · ${on}`);
  const f: Fonts = { reg: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  PEOPLE.forEach((person, i) => {
    const p = doc.addPage([W, H]);
    const who = person.key;
    const against = VS_COMPANY && who !== "all" ? "all" : who;
    const lastWord = (t: string) => (against !== who ? t.replace("Last year", "Company last year") : t);
    header(p, f, kind === "daily" ? "Daily report" : "Monthly report", person.label, kind === "daily" ? longDate(on) : monthName(on), i + 1, PEOPLE.length);
    let y = H - 92;
    const rows: { kind: "day" | "week" | "month" | "year"; title: string; now: string; last: string; word: string }[] = kind === "daily"
      ? [
        { kind: "day", title: "Daily", now: "Today", last: "Last year · average day", word: "today" },
        { kind: "week", title: "Weekly", now: "This week", last: "Last year · average week", word: "this week" },
        { kind: "month", title: "Monthly", now: "This month", last: "Last year · average month", word: "this month" },
        { kind: "year", title: "Yearly", now: "This year", last: "Last year · same days", word: "this year so far" },
      ]
      : [
        { kind: "month", title: monthName(on), now: "This month", last: "Last year · average month", word: "this month" },
        { kind: "year", title: "This financial year", now: "So far", last: "Last year · same days", word: "this year so far" },
      ];
    for (const r of rows) {
      const v = vsLastYear(days, who, r.kind, on, against);
      y -= row(p, f, y, r.title, r.kind === "day" ? r.now : `${r.now} · ${v.label}`, lastWord(r.last), v.now, v.last, remarks(v, r.word)) + 6;
    }
    if (kind === "monthly") {
      // The FY month by month.
      const pts = monthly(days, who, on);
      text(p, "Month by month, this financial year", M, y - 10, 11.5, f.bold, INK);
      y -= 22;
      const cols = [M + 8, M + 140, M + 290, M + 440];
      p.drawRectangle({ x: M, y: y - 14, width: W - 2 * M, height: 16, color: GROUND });
      ["Month", "Quotations", "Invoiced", "Conversion"].forEach((h2, k) => text(p, h2, cols[k], y - 9, 8.5, f.bold, INK2));
      y -= 16;
      for (const m of pts) {
        text(p, `${m.label} ${m.year}${m.partial ? " (so far)" : ""}`, cols[0], y - 10, 9, f.reg, INK);
        text(p, money(m.quoted), cols[1], y - 10, 9, f.reg, INK);
        text(p, money(m.invoiced), cols[2], y - 10, 9, f.reg, INK);
        text(p, m.conversion === null ? "-" : `${m.conversion}%`, cols[3], y - 10, 9, f.reg, INK);
        p.drawLine({ start: { x: M, y: y - 14 }, end: { x: W - M, y: y - 14 }, thickness: 0.4, color: LINE });
        y -= 15;
      }
      y -= 10;
    }
    // This FY against last FY, day by day.
    const fy = fyLines(days, who, on, true);
    const chartH = Math.min(190, Math.max(130, y - M - 4));
    const half = (W - 2 * M - 10) / 2;
    fyChart(p, f, M, y, half, chartH, "Quotations · day by day", fy.now.quoted, fy.last.quoted, S1);
    fyChart(p, f, M + half + 10, y, half, chartH, "Invoices · day by day", fy.now.invoiced, fy.last.invoiced, S2);
    text(p, `${who === "all" ? "All quotations and invoices" : `${person.label}'s quotations and invoices, against the company's last year`} · from Zoho Books`, M, 22, 7.5, f.reg, MUTED);
  });
  return doc.save();
}

/** The email around it: a few lines per person, the PDF attached. */
export function overviewReportEmail(days: DaySums, on: string, kind: ReportKind): { subject: string; html: string } {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const rowsHtml = PEOPLE.map((person) => {
    const who = person.key;
    const v = vsLastYear(days, who, kind === "daily" ? "day" : "month", on, VS_COMPANY && who !== "all" ? "all" : who);
    const cell = (a: number, b: number) => {
      const up = a >= b;
      return `<td style="padding:6px 10px;text-align:right">${esc(inrShort(a))} <span style="color:${up ? "#15803d" : "#d92d20"};font-size:12px">${up ? "▲" : "▼"}</span></td>`;
    };
    return `<tr><td style="padding:6px 10px;font-weight:600">${esc(person.label)}</td>${cell(v.now.quoted, v.last.quoted)}${cell(v.now.invoiced, v.last.invoiced)}<td style="padding:6px 10px;text-align:right">${v.now.conversion === null ? "—" : `${v.now.conversion}%`}</td></tr>`;
  }).join("");
  const when = kind === "daily" ? longDate(on) : monthName(on);
  const what = kind === "daily" ? "Today" : "This month";
  return {
    subject: `${kind === "daily" ? "Daily" : "Monthly"} report · ${when}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c1c1e">
<p>${kind === "daily" ? "Today's" : `${esc(monthName(on))}'s`} figures from the dashboard (▲ / ▼ against last year${kind === "daily" ? "'s average day" : "'s average month"}; salespeople against the company's).</p>
<table style="border-collapse:collapse;border:1px solid #e5e5ea"><thead><tr style="background:#f5f5f7"><th style="padding:6px 10px;text-align:left">${what}</th><th style="padding:6px 10px;text-align:right">Quotations</th><th style="padding:6px 10px;text-align:right">Invoiced</th><th style="padding:6px 10px;text-align:right">Conversion</th></tr></thead><tbody>${rowsHtml}</tbody></table>
<p>The full report for Company, Sumit, Ashish and Pranjal is attached as a PDF.</p>
<p style="color:#6e6e73;font-size:12px">Sent automatically by the Think Health dashboard.</p></div>`,
  };
}
