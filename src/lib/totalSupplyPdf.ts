import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import { TS, type TsLine, type TsQuote, amountInWords } from "./totalSupply";
import { TS_LOGO, TS_STAMP } from "./totalSupplyAssets";

/*
 * The Total Supply quotation PDF (owner, 5 Nov): the owner's Total Supply invoice turned into a quotation, with the items' descriptions
 * and the terms page from Books' quote. Built here because it never goes through Zoho. Standard fonts need no font file on the server.
 */

const A4 = { w: 595.28, h: 841.89 };
const LEFT = 40, RIGHT = A4.w - 29, TOP = A4.h - 34, BOTTOM = 40;
const WIDTH = RIGHT - LEFT;
const BLACK = rgb(0, 0, 0), GREY = rgb(0.2, 0.2, 0.2), RULE = rgb(0.62, 0.62, 0.62), BAND = rgb(0.95, 0.953, 0.957);
const ROW = 10.5; // line height of 8 pt text

const money = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (ymd: string) => ymd.slice(0, 10).split("-").reverse().join("/");

// The terms page of Books' quote, word for word.
const TERMS_PAGE: { head: string; items: string[]; numbered?: boolean }[] = [
  { head: "Payment Terms", numbered: true, items: [
    "Items Sold Will not be returned",
    "Seller reserves the right to withhold delivery of goods or services until all due payments are received.",
    "Payment shall be made according to the Payment Terms outlined in the Quotation or as otherwise agreed in writing",
    "Late payments may incur a 24% interest charge per year",
  ] },
  { head: "Delivery and Performance:", items: [
    "Delivery dates are estimates and are subject to change due to unforeseen circumstances.",
    "The Supplier shall not be liable for any delays in Delivery caused by factors beyond its reasonable control",
  ] },
  { head: "Warranty and Liability:", items: ["The Supplier warrants that the Goods/Services shall conform to the specifications outlined in the Quotation as per Standard Company Norms."] },
];

/** Standard fonts can't print everything (₹, other scripts): the rupee sign is spelled out, anything else unprintable becomes "?". */
function printable(font: PDFFont, text: string): string {
  const can = new Set(font.getCharacterSet());
  return [...text.replace(/₹/g, "Rs.").replace(/[​-‍﻿]/g, "").replace(/\t/g, " ")].map((c) => (c === "\n" || can.has(c.codePointAt(0)!) ? c : "?")).join("");
}

function wrap(font: PDFFont, raw: string, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of printable(font, raw).split(/\r?\n/)) {
    let line = "";
    for (let word of para.split(/ +/)) {
      // A word wider than the column is broken up.
      while (font.widthOfTextAtSize(word, size) > width) {
        if (line) { out.push(line); line = ""; }
        let cut = word.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > width) cut--;
        out.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

type Column = { key: string; width: number; align: "left" | "right" | "center"; head: string; group?: string };
const taxCols = (name: string, key: string, each: number): Column[] => [
  { key: `${key}Pct`, width: each * 0.42, align: "right", head: "%", group: name },
  { key: `${key}Amt`, width: each * 0.58, align: "right", head: "Amt", group: name },
];
function columns(mode: TsQuote["taxMode"]): Column[] {
  const taxes = mode === "intra" ? [...taxCols("CGST", "a", 74), ...taxCols("SGST", "b", 74)] : mode === "inter" ? taxCols("IGST", "a", 88) : [];
  const fixed: Column[] = [
    { key: "n", width: 20, align: "center", head: "#" },
    { key: "hsn", width: 44, align: "left", head: "HSN/SAC" },
    { key: "qty", width: 38, align: "right", head: "Qty" },
    { key: "rate", width: 56, align: "right", head: "Rate" },
    { key: "amount", width: 64, align: "right", head: "Amount" },
  ];
  const used = [...fixed, ...taxes].reduce((n, c) => n + c.width, 0);
  return [fixed[0], { key: "item", width: WIDTH - used, align: "left", head: "Item & Description" }, ...fixed.slice(1, 4), ...taxes, fixed[4]];
}

async function picture(pdf: PDFDocument, base64: string): Promise<PDFImage | null> {
  if (!base64) return null;
  const bytes = Buffer.from(base64, "base64");
  return bytes[0] === 0x89 ? pdf.embedPng(bytes) : pdf.embedJpg(bytes);
}

export async function tsQuotePdf(q: TsQuote): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(q.number);
  pdf.setAuthor(TS.name);
  pdf.setCreator(TS.name);
  pdf.setProducer(TS.name);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  const [logo, stamp] = await Promise.all([picture(pdf, TS_LOGO), picture(pdf, TS_STAMP)]);

  let page!: PDFPage;
  const pages: PDFPage[] = [];
  const newPage = () => { page = pdf.addPage([A4.w, A4.h]); pages.push(page); };
  const text = (s: string, x: number, y: number, o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; align?: "left" | "right" | "center"; width?: number } = {}) => {
    const font = o.font ?? regular, size = o.size ?? 8;
    const t = printable(font, s);
    const w = font.widthOfTextAtSize(t, size);
    const at = o.align === "right" ? x + (o.width ?? 0) - w : o.align === "center" ? x + ((o.width ?? 0) - w) / 2 : x;
    page.drawText(t, { x: at, y, font, size, color: o.color ?? BLACK });
  };
  const hline = (y: number, x1 = LEFT, x2 = RIGHT) => page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: RULE });
  const vline = (x: number, y1: number, y2: number) => page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: 0.6, color: RULE });
  const band = (y: number, h: number, x = LEFT, w = WIDTH) => page.drawRectangle({ x, y, width: w, height: h, color: BAND });

  // Header
  newPage();
  let y = TOP;
  const logoSize = 92;
  const orgX = LEFT + logoSize + 16;
  if (logo) {
    const s = Math.min(logoSize / logo.width, logoSize / logo.height);
    page.drawImage(logo, { x: LEFT + 6, y: y - logoSize - 3, width: logo.width * s, height: logo.height * s });
  }
  text(TS.name, orgX, y - 16, { font: bold, size: 13 });
  let oy = y - 30;
  text(`GSTIN: ${TS.gstin}`, orgX, oy);
  for (const l of TS.address) { oy -= ROW; text(l, orgX, oy); }
  y -= logoSize + 6;
  text("QUOTATION", LEFT, y + 7, { size: 22, align: "right", width: WIDTH - 12 });
  hline(y);

  // Details
  const mid = LEFT + WIDTH / 2;
  const details: [string, string][] = [["Quotation Number", q.number], ["Quotation Date", dmy(q.date)], ["Terms", TS.terms], ...(q.expiry ? [["Valid Until", dmy(q.expiry)] as [string, string]] : [])];
  const detailsTop = y;
  let dy = y - 10;
  for (const [k, v] of details) {
    text(k, LEFT + 6, dy, { color: GREY });
    text(`: ${v}`, LEFT + 118, dy, { font: bold });
    dy -= ROW + 1;
  }
  text("Place Of Supply", mid + 6, y - 10, { color: GREY });
  text(`: ${q.place}`, mid + 118, y - 10, { font: bold });
  y = dy - 1;
  vline(mid, detailsTop, y);

  // Bill To / Ship To
  band(y - 14, 14);
  hline(y);
  text("Bill To", LEFT + 6, y - 10, { font: bold, color: GREY });
  text("Ship To", mid + 6, y - 10, { font: bold, color: GREY });
  hline(y - 14);
  const partyTop = y - 14;
  const party = (x: number, lines: string[], name: string, gstin: string) => {
    const w = WIDTH / 2 - 12;
    let py = partyTop - 13;
    for (const l of wrap(bold, name, 9, w)) { text(l, x, py, { font: bold, size: 9 }); py -= 12; }
    if (gstin) { text(`GSTIN ${gstin}`, x, py); py -= ROW; }
    for (const raw of lines) for (const l of wrap(regular, raw, 8, w)) { text(l, x, py); py -= ROW; }
    return py;
  };
  const low = Math.min(party(LEFT + 6, q.customer.billing, q.customer.name, q.customer.gstin), party(mid + 6, q.customer.shipping, q.customer.name, q.customer.gstin));
  y = low - 2;
  vline(mid, partyTop, y);

  // Items
  const cols = columns(q.taxMode);
  const xOf = (i: number) => LEFT + cols.slice(0, i).reduce((n, c) => n + c.width, 0);
  const tableHead = () => {
    const tall = cols.some((c) => c.group);
    const h = tall ? 26 : 16;
    band(y - h, h);
    hline(y);
    cols.forEach((c, i) => {
      const x = xOf(i);
      text(c.head, x + 4, y - h + 5, { font: bold, align: c.align, width: c.width - 8 });
      if (c.group && cols[i - 1]?.group !== c.group) {
        const span = c.width + cols[i + 1].width;
        text(c.group, x, y - 10, { font: bold, align: "center", width: span });
        hline(y - 13, x, x + span);
      }
      if (i) vline(x, c.group && cols[i - 1]?.group === c.group ? y - 13 : y, y - h);
    });
    y -= h;
    hline(y);
  };
  const cellsOf = (l: TsLine, n: number): Record<string, string> => {
    const half = l.gst / 2, each = l.tax / 2;
    return {
      n: String(n), hsn: l.hsn, qty: money(l.qty), rate: money(l.rate), amount: money(l.amount),
      ...(q.taxMode === "intra" ? { aPct: `${half}%`, aAmt: money(each), bPct: `${half}%`, bAmt: money(each) } : q.taxMode === "inter" ? { aPct: `${l.gst}%`, aAmt: money(l.tax) } : {}),
    };
  };
  const nextTablePage = () => { newPage(); y = TOP; tableHead(); };
  tableHead();
  const itemW = cols[1].width - 8;
  q.lines.forEach((l, i) => {
    const nameLines = wrap(regular, l.name, 8, itemW);
    const descLines = l.description ? wrap(regular, l.description, 7.5, itemW) : [];
    const hsnLines = wrap(regular, l.hsn, 8, cols[2].width - 8);
    const needed = (lines: number) => lines * ROW + 7;
    const cells = cellsOf(l, i + 1);
    const rowLines = Math.max(nameLines.length + descLines.length, hsnLines.length, l.unit ? 2 : 1);
    if (y - needed(rowLines) < BOTTOM) nextTablePage();
    const rowTop = y;
    // A description longer than a page carries on over the next one.
    let ty = y - 10;
    cols.forEach((c, ci) => {
      if (c.key === "item" || c.key === "hsn") return;
      text(cells[c.key] ?? "", xOf(ci) + 4, ty, { align: c.align, width: c.width - 8 });
    });
    const qtyCol = cols.findIndex((c) => c.key === "qty");
    if (l.unit) text(l.unit, xOf(qtyCol) + 4, ty - ROW, { align: "right", width: cols[qtyCol].width - 8 });
    hsnLines.forEach((h, k) => text(h, xOf(2) + 4, ty - k * ROW));
    const closeRow = (top: number, bottom: number) => {
      cols.forEach((_, ci) => { if (ci) vline(xOf(ci), top, bottom); });
      hline(bottom);
    };
    let segTop = rowTop;
    for (const [k, line] of [...nameLines, ...descLines].entries()) {
      if (ty < BOTTOM + 4) { closeRow(segTop, ty + ROW - 4); nextTablePage(); segTop = y; ty = y - 10; }
      text(line, xOf(1) + 4, ty, k < nameLines.length ? {} : { size: 7.5, color: GREY });
      ty -= ROW;
    }
    y = Math.min(ty + ROW - 7, rowTop - needed(rowLines) + 3);
    if (segTop !== rowTop && ty + ROW - 7 < y) y = ty + ROW - 7;
    closeRow(segTop, y);
  });

  // Totals on the right; words, notes and terms on the left.
  const totals: [string, string, boolean?][] = [["Sub Total", money(q.subTotal)]];
  if (q.discount) totals.push([`Discount(${money(q.discountPercent)}%)`, `(-) ${money(q.discount)}`]);
  for (const t of q.taxes) totals.push([t.label, money(t.amount)]);
  if (q.shipping) totals.push(["Shipping charge", money(q.shipping)]);
  if (q.adjustment) totals.push([q.adjustmentLabel, money(q.adjustment)]);
  if (q.rounding) totals.push(["Rounding", money(q.rounding)]);
  totals.push(["Total", `Rs.${money(q.total)}`, true]);
  const leftW = WIDTH * 0.53;
  const rightX = LEFT + WIDTH * 0.56;
  const wordsLines = wrap(italic, amountInWords(q.total), 8, leftW - 10);
  const notesLines = wrap(regular, TS.notes, 8, leftW - 10);
  const blockH = Math.max(totals.length * 14 + 150, 26 + wordsLines.length * ROW + 22 + notesLines.length * ROW + 40);
  if (y - blockH < BOTTOM) { newPage(); y = TOP; hline(y); }
  const blockTop = y;
  let ly = y - 14;
  text("Total In Words", LEFT + 6, ly);
  ly -= ROW + 1;
  for (const l of wordsLines) { text(l, LEFT + 6, ly, { font: italic }); ly -= ROW; }
  ly -= 8;
  text("Notes", LEFT + 6, ly, { color: GREY });
  ly -= ROW + 1;
  for (const l of notesLines) { text(l, LEFT + 6, ly); ly -= ROW; }
  ly -= 8;
  text("Terms & Conditions", LEFT + 6, ly, { color: GREY });
  ly -= ROW + 1;
  text(TS.shipping, LEFT + 6, ly);
  let ty = y - 12;
  const valueW = 76;
  for (const [k, v, strong] of totals) {
    const font = strong ? bold : regular;
    text(k, rightX, ty, { font, align: "right", width: RIGHT - rightX - valueW - 12 });
    text(v, RIGHT - valueW - 6, ty, { font, align: "right", width: valueW });
    ty -= 14;
  }
  hline(ty + 6, rightX, RIGHT);
  const stampH = 112;
  if (stamp) {
    const s = Math.min(stampH / stamp.height, (RIGHT - rightX - 20) / stamp.width);
    page.drawImage(stamp, { x: rightX + (RIGHT - rightX - stamp.width * s) / 2, y: ty - 4 - stamp.height * s, width: stamp.width * s, height: stamp.height * s });
  }
  ty -= stampH + 16;
  text("Authorized Signature", rightX, ty, { align: "center", width: RIGHT - rightX });
  y = ty - 7;
  hline(y, rightX, RIGHT);
  vline(rightX, blockTop, y);

  // Terms page
  newPage();
  let py = TOP - 16;
  text("Terms and Condition", LEFT + 6, py, { size: 9 });
  py -= 20;
  for (const s of TERMS_PAGE) {
    text(s.head, LEFT + 6, py, { font: bold, size: 9 });
    py -= 15;
    s.items.forEach((it, i) => {
      wrap(regular, it, 9, WIDTH - 40).forEach((l, k) => {
        if (!k) text(s.numbered ? `${i + 1}.` : "•", LEFT + 16, py, { size: 9 });
        text(l, LEFT + 30, py, { size: 9 });
        py -= 13;
      });
    });
    py -= 10;
  }

  // The frame round every page, and page numbers.
  pages.forEach((p, i) => {
    page = p;
    p.drawRectangle({ x: LEFT, y: BOTTOM - 8, width: WIDTH, height: TOP - BOTTOM + 8, borderColor: RULE, borderWidth: 0.6 });
    text(String(i + 1), LEFT, 18, { size: 6, align: "right", width: WIDTH });
  });
  return pdf.save();
}
