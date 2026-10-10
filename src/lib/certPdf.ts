import { PDFDocument, type PDFEmbeddedPage, type PDFFont, type PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { printedDate } from "./certificates";
import type { CertRow } from "./types";

/*
 * Prints certificates in the browser — the certificate generator's library (D:\Projects\certificate-generator, src/),
 * same layout and fonts: two A5 certificates on each A4 page (top and bottom, with a light cut line), in one PDF, ready
 * to print at actual size. Long names and locations only get a smaller font, so they always stay inside the border.
 * Fonts (SIL Open Font License) are served from /certificate-fonts.
 */

// Where each field goes, measured from the Canva templates: PDF points on the design (A5 landscape), y = baseline.
const DESIGN = { width: 595.72, height: 420.91 };
type FontKey = "name" | "location" | "label";
type FieldLayout = { x: number; y: number; size: number; maxWidth: number; align: "left" | "center"; font: FontKey; color: [number, number, number] };
const TEAL: [number, number, number] = [14, 63, 81]; // #0E3F51
const BLUE: [number, number, number] = [0, 153, 211]; // #0099D3
type Field = "date" | "certNo" | "name" | "location";
const LAYOUT: Record<Field, FieldLayout> = {
  date: { x: 112.5, y: 402.8, size: 9.2, maxWidth: 140, align: "left", font: "label", color: TEAL }, // after "Training Date:"
  certNo: { x: 433.5, y: 402.8, size: 9.2, maxWidth: 140, align: "left", font: "label", color: TEAL }, // after "Certificate No:"
  name: { x: 430, y: 268.3, size: 39, maxWidth: 232, align: "center", font: "name", color: BLUE }, // under "proudly presented to"
  location: { x: 302.6, y: 173.8, size: 12, maxWidth: 262, align: "center", font: "location", color: TEAL }, // under "course conducted at,"
};
const FIELDS: Field[] = ["date", "certNo", "name", "location"];
const FIELD_LABEL: Record<Field, string> = { date: "date", certNo: "certificate no.", name: "name", location: "location" };
const FONT_FILES: Record<FontKey, string> = { name: "GreatVibes-Regular.ttf", location: "Montserrat-BoldItalic.ttf", label: "OpenSans-BoldItalic.ttf" };

const A4 = { width: 595.28, height: 841.89 };
const HALF = A4.height / 2;

type Printed = Record<Field, string>;
type Fonts = Record<FontKey, PDFFont>;
const clean = (text: string) => text.trim().replace(/\s+/g, " ");

let fontBytes: Promise<Record<FontKey, ArrayBuffer>> | null = null;
function loadFonts() {
  fontBytes ??= Promise.all((Object.keys(FONT_FILES) as FontKey[]).map(async (k) => {
    const r = await fetch(`/certificate-fonts/${FONT_FILES[k]}`);
    if (!r.ok) throw new Error("Couldn't load the certificate fonts");
    return [k, await r.arrayBuffer()] as const;
  })).then((xs) => Object.fromEntries(xs) as Record<FontKey, ArrayBuffer>).catch((e) => { fontBytes = null; throw e; });
  return fontBytes;
}

async function embedFonts(pdf: PDFDocument): Promise<Fonts> {
  pdf.registerFontkit(fontkit);
  const b = await loadFonts();
  return {
    name: await pdf.embedFont(b.name, { subset: true }),
    location: await pdf.embedFont(b.location, { subset: true }),
    label: await pdf.embedFont(b.label, { subset: true }),
  };
}

const fitScale = (font: PDFFont, text: string, f: FieldLayout) => {
  const width = font.widthOfTextAtSize(text, f.size);
  return width > f.maxWidth ? f.maxWidth / width : 1;
};

function drawField(page: PDFPage, text: string, f: FieldLayout, font: PDFFont, oy: number, scale: number) {
  const value = clean(text);
  if (!value) return;
  const size = f.size * fitScale(font, value, f);
  const w = font.widthOfTextAtSize(value, size);
  const x = f.align === "center" ? f.x - w / 2 : f.x;
  page.drawText(value, { x: x * scale, y: oy + f.y * scale, size: size * scale, font, color: rgb(f.color[0] / 255, f.color[1] / 255, f.color[2] / 255) });
}

function drawCertificate(page: PDFPage, design: PDFEmbeddedPage, fonts: Fonts, c: Printed, oy: number, width: number) {
  const scale = width / DESIGN.width;
  page.drawPage(design, { x: 0, y: oy, width, height: DESIGN.height * scale });
  for (const k of FIELDS) drawField(page, c[k], LAYOUT[k], fonts[LAYOUT[k].font], oy, scale);
}

/** What can't be printed: an empty field, or letters the certificate fonts don't have (a name typed in another script). */
function problemsOf(fonts: Fonts, c: Printed): string[] {
  const out: string[] = [];
  for (const k of FIELDS) {
    const chars = fonts[LAYOUT[k].font].getCharacterSet();
    const bad = [...new Set([...c[k]])].filter((ch) => ch.trim() && !chars.includes(ch.codePointAt(0)!));
    if (bad.length) out.push(`the ${FIELD_LABEL[k]} "${clean(c[k])}" has letters the certificate font can't print — type it in English letters`);
    if (!clean(c[k])) out.push(`no ${FIELD_LABEL[k]}`);
  }
  return out;
}

/** Names the fonts can't print, before anything goes to the sheet. */
export async function checkCertificates(rows: CertRow[]): Promise<string[]> {
  const fonts = await embedFonts(await PDFDocument.create());
  return rows.flatMap((r) => problemsOf(fonts, printed(r)).map((p) => `${r.name || "(no name)"}: ${p}`));
}

const printed = (r: CertRow): Printed => ({ date: printedDate(r.date), certNo: r.certNo, name: r.name, location: r.location });

/** One PDF with every certificate: A4 pages, two A5 certificates each; an odd last one leaves the bottom half blank. */
export async function generateCertificates(background: ArrayBuffer, rows: CertRow[]): Promise<Uint8Array> {
  if (!rows.length) throw new Error("No certificates to generate.");
  const pdf = await PDFDocument.create();
  pdf.setTitle("Certificates");
  pdf.setCreator("ThinkHealth training dashboard");
  const fonts = await embedFonts(pdf);
  const problems = rows.flatMap((r, i) => problemsOf(fonts, printed(r)).map((p) => `#${i + 1} ${r.name || "(no name)"}: ${p}`));
  if (problems.length) throw new Error(`Some certificates can't be printed:\n${problems.join("\n")}`);
  const [design] = await pdf.embedPdf(background, [0]);
  const h = DESIGN.height * (A4.width / DESIGN.width);
  for (let i = 0; i < rows.length; i += 2) {
    const page = pdf.addPage([A4.width, A4.height]);
    rows.slice(i, i + 2).forEach((r, j) => drawCertificate(page, design, fonts, printed(r), (j === 0 ? HALF : 0) + (HALF - h) / 2, A4.width));
    page.drawLine({ start: { x: 0, y: HALF }, end: { x: A4.width, y: HALF }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7), dashArray: [3, 3] });
  }
  return pdf.save();
}
