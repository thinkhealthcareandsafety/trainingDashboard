import { PDFDocument, PDFName, PDFRawStream, PDFRef, concatTransformationMatrix, drawObject, popGraphicsState, pushGraphicsState } from "pdf-lib";

/*
 * The certificate background, as in the certificate generator (D:\Projects\certificate-generator, src/background.ts):
 * the owner's templates are the A4 Photoedit exports with two filled-in certificates ("A4 CA Photoedit.pdf",
 * "A4 FA Photoedit.pdf"); the certificate picture inside them is copied as it is — same print colours (CMYK) — without
 * any of the typed text, onto one A5-landscape page. certPdf.ts then writes the values where the template had them.
 */

/** The background page: one certificate, A5 landscape, in PDF points. The layout in certPdf.ts is measured on it. */
export const DESIGN = { width: 595.72, height: 420.91 };

/** Already a background (one A5-landscape page), or a template that still needs converting? */
export function isBackground(doc: PDFDocument): boolean {
  if (doc.getPageCount() !== 1) return false;
  const { width, height } = doc.getPage(0).getSize();
  return Math.abs(width - DESIGN.width) < 2 && Math.abs(height - DESIGN.height) < 2;
}

/** A blank certificate background from a filled-in template PDF: the largest picture in it, without the typed text. */
export async function backgroundFromTemplate(template: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const src = await PDFDocument.load(template);
  if (isBackground(src)) return src.save();
  let image: PDFRawStream | undefined;
  for (const [, obj] of src.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of("Subtype"))?.toString() === "/Image" && (!image || obj.contents.length > image.contents.length)) image = obj;
  }
  if (!image) throw new Error("This PDF has no certificate picture in it — upload the template exported from Photoedit / Canva");

  const out = await PDFDocument.create();
  const dict = out.context.obj({});
  for (const [key, value] of image.dict.entries()) {
    if (key.toString() === "/Length") continue;
    if (value instanceof PDFRef) throw new Error("This PDF stores its picture in a way that isn't supported — export it as a PDF again");
    dict.set(key, value);
  }
  const ref = out.context.register(PDFRawStream.of(dict, image.contents));
  const page = out.addPage([DESIGN.width, DESIGN.height]);
  const name = page.node.newXObject("Certificate", ref);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(DESIGN.width, 0, 0, DESIGN.height, 0, 0), drawObject(name), popGraphicsState());
  out.setTitle("Certificate background");
  return out.save();
}
