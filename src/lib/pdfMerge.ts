import { PDFDocument } from "pdf-lib";

/*
 * The Invoice Converter's merge (owner, 17 Nov: "merge invoice PDF + PO PDF + e-way bill PDF"): the parts in order, one
 * PDF. A part that is a picture (a photographed PO) becomes an A4 page with the picture fitted on it. Says where the
 * first part (the invoice) ends, so the signature can sit on the invoice's last page.
 */

export type Part = { bytes: Uint8Array; type: string; name?: string };
export type Merged = { bytes: Uint8Array; firstPages: number; signPage: { index: number; width: number; height: number }; skipped: string[] };

const isPdf = (p: Part) => /pdf/i.test(p.type) || /\.pdf$/i.test(p.name ?? "") || (p.bytes[0] === 0x25 && p.bytes[1] === 0x50); // "%P"
const isPng = (p: Part) => /png/i.test(p.type) || /\.png$/i.test(p.name ?? "");
const isJpg = (p: Part) => /jpe?g/i.test(p.type) || /\.jpe?g$/i.test(p.name ?? "");

export async function mergeParts(parts: Part[], title = "Invoice"): Promise<Merged> {
  const out = await PDFDocument.create();
  out.setTitle(title);
  out.setProducer("Think Health dashboard");
  const skipped: string[] = [];
  let firstPages = 0;
  for (const [i, p] of parts.entries()) {
    const before = out.getPageCount();
    try {
      if (isPdf(p)) {
        const src = await PDFDocument.load(p.bytes, { ignoreEncryption: true });
        for (const page of await out.copyPages(src, src.getPageIndices())) out.addPage(page);
      } else if (isPng(p) || isJpg(p)) {
        const img = isPng(p) ? await out.embedPng(p.bytes) : await out.embedJpg(p.bytes);
        const W = 595.28, H = 841.89, M = 28;
        const k = Math.min((W - 2 * M) / img.width, (H - 2 * M) / img.height, 1);
        const page = out.addPage([W, H]);
        page.drawImage(img, { x: (W - img.width * k) / 2, y: (H - img.height * k) / 2, width: img.width * k, height: img.height * k });
      } else {
        skipped.push(p.name ?? `part ${i + 1}`);
      }
    } catch {
      skipped.push(p.name ?? `part ${i + 1}`);
    }
    if (i === 0) firstPages = out.getPageCount() - before;
  }
  if (!out.getPageCount()) throw new Error("Nothing to merge: the invoice PDF couldn't be read.");
  const index = Math.max(0, firstPages - 1);
  const { width, height } = out.getPage(index).getSize();
  return { bytes: await out.save(), firstPages, signPage: { index, width, height }, skipped };
}

/** The signature boxes' top-left on the invoice's last page: bottom right, clear of the page edge (points, top-left origin). */
export const signSpot = (page: { index: number; width: number; height: number }) => ({ page: page.index, x: page.width - 210, y: page.height - 130 });
