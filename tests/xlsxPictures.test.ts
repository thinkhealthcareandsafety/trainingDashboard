// Pictures in the Sheet → Quotation download: the workbook gets Excel's drawing parts and still opens.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { addPictures, imageInfo, unzip } from "@/lib/xlsxPictures";

// A 2×1 red PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DAwMDAAAAPAwH/0aBpNQAAAABJRU5ErkJggg==", "base64");

test("knows PNG, JPEG and GIF sizes; anything else is no picture", () => {
  assert.deepEqual(imageInfo(PNG), { ext: "png", w: 2, h: 1 });
  const gif = Buffer.from("R0lGODlhAwAEAIAAAP///wAAACH5BAEAAAAALAAAAAADAAQAAAIDhI8FADs=", "base64");
  assert.deepEqual(imageInfo(gif), { ext: "gif", w: 3, h: 4 });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 50, 0, 80, 3, 0, 0, 0]);
  assert.deepEqual(imageInfo(jpeg), { ext: "jpeg", w: 80, h: 50 });
  assert.equal(imageInfo(Buffer.from("RIFF0000WEBP")), null);
});

test("pictures land on the right sheets, and the workbook still reads the same", () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Item", "Qty"], ["AED", 1]]), "BOQ");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Our item"], ["Zoll AED Plus"]]), "Quotation");
  const before = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  const after = addPictures(before, [{ sheet: 1, row: 1, col: 1, bytes: PNG }, { sheet: 1, row: 2, col: 1, bytes: PNG }, { sheet: 0, row: 1, col: 2, bytes: Buffer.from("not a picture") }]);
  const files = new Map(unzip(after).map((f) => [f.name, f.data.toString("utf8")]));
  assert.ok(files.has("xl/media/image1.png") && files.has("xl/media/image2.png"));
  assert.match(files.get("xl/drawings/drawing1.xml")!, /oneCellAnchor[^]*oneCellAnchor/);
  assert.match(files.get("xl/worksheets/sheet2.xml")!, /<drawing r:id="rIdDrawing1"\/><\/worksheet>$/);
  assert.doesNotMatch(files.get("xl/worksheets/sheet1.xml")!, /<drawing/); // the sheet whose only "picture" wasn't one
  assert.match(files.get("xl/worksheets/_rels/sheet2.xml.rels")!, /drawings\/drawing1\.xml/);
  assert.match(files.get("[Content_Types].xml")!, /Extension="png"[^]*drawing1.xml/);
  const back = XLSX.read(after, { type: "array" });
  assert.deepEqual(back.SheetNames, ["BOQ", "Quotation"]);
  assert.equal(back.Sheets.Quotation.A2.v, "Zoll AED Plus");
  assert.equal(addPictures(before, []), before);
});
