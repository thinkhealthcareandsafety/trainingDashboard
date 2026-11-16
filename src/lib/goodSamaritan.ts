import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

/*
 * The Good Samaritan certificate (owner, 16 Nov: participants get this one, "not the templates we currently have"), drawn
 * on the owner's own design (assets/certificates/good-samaritan.pdf, A4 landscape, 842 × 595 pt). The design carries a
 * sample name ("Your Name here") and a sample number ("IAGS-SN/001"): both are covered with white and printed again —
 * the person's name in the script face on the line, their own number after "Certificate No:". Pure (bytes in, bytes
 * out), so tests and the server share it.
 */

// Measured on the design (points, y from the bottom of what shows: the design's page box starts 8.58 pt up, added below).
const NAME = { x: 60, y: 361, size: 40, minSize: 22, maxWidth: 318, cover: { x: 50, y: 344, w: 340, h: 80 } };
const NUMBER = { x: 620.5, y: 13, size: 10.5, cover: { x: 617, y: 5, w: 96, h: 20.5 } };
const INK = rgb(0.137, 0.231, 0.302); // the design's own slate, #233B4D

/** IAGS-SN/001, 002, … : the running number, three digits at least, never reused. */
export const goodSamaritanNumber = (n: number) => `IAGS-SN/${String(n).padStart(3, "0")}`;

export async function goodSamaritanPdf(template: Uint8Array, scriptFont: Uint8Array, c: { name: string; certNo: string }): Promise<Uint8Array> {
  const name = c.name.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("A certificate needs a name");
  const pdf = await PDFDocument.load(template);
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`Good Samaritan certificate · ${name}`);
  pdf.setCreator("Think Health");
  const script = await pdf.embedFont(scriptFont, { subset: true });
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.getPage(0);
  const oy = page.getMediaBox().y; // the design's page box doesn't start at 0
  const white = rgb(1, 1, 1);
  page.drawRectangle({ x: NAME.cover.x, y: NAME.cover.y + oy, width: NAME.cover.w, height: NAME.cover.h, color: white });
  page.drawRectangle({ x: NUMBER.cover.x, y: NUMBER.cover.y + oy, width: NUMBER.cover.w, height: NUMBER.cover.h, color: white });
  // A long name only gets smaller, so it always stays on the line.
  let size = NAME.size;
  while (size > NAME.minSize && script.widthOfTextAtSize(name, size) > NAME.maxWidth) size -= 1;
  page.drawText(name, { x: NAME.x, y: NAME.y + oy, size, font: script, color: INK });
  page.drawText(c.certNo, { x: NUMBER.x, y: NUMBER.y + oy, size: NUMBER.size, font: sans, color: INK });
  return pdf.save();
}
