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

/** Zoho Books' "Authorized Signature" label: its page (0-based), left x and baseline y (PDF points, bottom-left origin). */
export type SignLabel = { page: number; x: number; y: number; pageHeight: number };
export type SignBox = { type: "Signature" | "Date" | "Name"; label: string; page: number; x: number; y: number; w: number; h: number };
/** Where the label sits on our standard Zoho invoice (A4), for when it can't be found. */
const STANDARD = { page: 0, x: 412.9, y: 117.9, pageHeight: 841.69 };

/**
 * The boxes as the owner placed them (20 Nov screenshot): signature, then date, then full name, stacked to the left of
 * the "Authorized Signature" box, under the bank details, measured from the label so a longer invoice moves them along.
 * Points, top-left origin (what Zoho Sign takes).
 */
export function signBoxes(label: SignLabel | null): SignBox[] {
  const l = label ?? STANDARD;
  const top = l.pageHeight - l.y; // the label's baseline, from the top
  return [
    { type: "Signature", label: "Signature", page: l.page, x: l.x - 203, y: top - 70, w: 125, h: 32 },
    { type: "Date", label: "Date", page: l.page, x: l.x - 194, y: top - 33, w: 100, h: 14 },
    { type: "Name", label: "Full name", page: l.page, x: l.x - 194, y: top - 17, w: 130, h: 14 },
  ].map((b) => ({ ...b, x: Math.round(b.x), y: Math.round(b.y) })) as SignBox[];
}

/**
 * Where the DSC signer's stamp goes (owner, 27 Nov: the DSC token instead of Zoho Sign): where the Zoho Sign boxes were,
 * inside the bank-details box, left of the "Authorized Signature" box and under the bank address (checked on 2026-01-552). PDF points, bottom-left origin (what pdf-lib takes).
 */
export function dscSpot(label: SignLabel | null): { page: number; x: number; y: number; w: number; h: number } {
  const l = label ?? STANDARD;
  return { page: l.page, x: Math.round(l.x - 290), y: Math.round(l.y + 1), w: 200, h: 56 };
}

/** Finds "Authorized Signature" in the invoice's own pages (the first `pages` of the merged PDF; the T&C page has none). */
export async function findSignLabel(bytes: Uint8Array, pages: number): Promise<SignLabel | null> {
  try {
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    for (let p = 1; p <= Math.min(pages, pdf.numPages); p++) {
      const page = await pdf.getPage(p);
      const items = (await page.getTextContent()).items as { str?: string; transform?: number[] }[];
      const hit = items.find((it) => /authori[sz]ed\s+signat/i.test(it.str ?? ""));
      if (hit?.transform) return { page: p - 1, x: hit.transform[4], y: hit.transform[5], pageHeight: page.getViewport({ scale: 1 }).height };
    }
  } catch (e) {
    console.error(`[invoice-converter] reading the signature spot: ${e instanceof Error ? e.message : e}`);
  }
  return null;
}
