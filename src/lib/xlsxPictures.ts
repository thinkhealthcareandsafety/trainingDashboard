import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

/*
 * Pictures in an .xlsx (owner: item pictures in the Sheet → Quotation download). SheetJS's free edition can't write
 * images, so this opens the finished workbook (a zip), adds the drawing parts Excel expects, and zips it again:
 *  xl/media/imageN.<ext>, xl/drawings/drawingN.xml (+ its rels), a <drawing> on the sheet (+ the sheet's rels),
 *  and the content types. Node's own zlib does the zip work; no extra package.
 */

// sheet: 0-based order; row/col: 0-based; rowPx: the row's height, to sit the picture at its bottom, level with the text (Excel's default)
export type Picture = { sheet: number; row: number; col: number; bytes: Uint8Array; maxPx?: number; rowPx?: number };

/* ---------------- A minimal zip: read every entry, write them all back ---------------- */

type Entry = { name: string; data: Buffer };

export function unzip(buf: Uint8Array): Entry[] {
  const b = Buffer.from(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Not a zip file");
  const count = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  const out: Entry[] = [];
  for (let n = 0; n < count; n++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error("Broken zip directory");
    const method = b.readUInt16LE(p + 10), size = b.readUInt32LE(p + 20);
    const nameLen = b.readUInt16LE(p + 28), extraLen = b.readUInt16LE(p + 30), commentLen = b.readUInt16LE(p + 32);
    const local = b.readUInt32LE(p + 42);
    const name = b.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const raw = b.subarray(start, start + size);
    out.push({ name, data: method === 0 ? Buffer.from(raw) : method === 8 ? inflateRawSync(raw) : (() => { throw new Error(`Zip method ${method} not supported`); })() });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export function zip(entries: Entry[]): Uint8Array {
  const locals: Buffer[] = [], dirs: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const packed = deflateRawSync(e.data);
    const crc = crc32(e.data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
    head.writeUInt32LE(0x00210000, 10); // a fixed DOS date (1980-01-01): the content is what matters
    head.writeUInt32LE(crc, 14); head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(e.data.length, 22); head.writeUInt16LE(name.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0x0800, 8); dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(0x00210000, 12); dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(packed.length, 20); dir.writeUInt32LE(e.data.length, 24);
    dir.writeUInt16LE(name.length, 28); dir.writeUInt32LE(offset, 42);
    locals.push(head, name, packed);
    dirs.push(dir, name);
    offset += 30 + name.length + packed.length;
  }
  const dirBuf = Buffer.concat(dirs);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dirBuf.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, dirBuf, end]));
}

/* ---------------- Pictures ---------------- */

/** PNG, JPEG or GIF and its size in pixels; null for anything else (Excel shows those three everywhere). */
export function imageInfo(bytes: Uint8Array): { ext: "png" | "jpeg" | "gif"; w: number; h: number } | null {
  const b = Buffer.from(bytes);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { ext: "png", w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.length > 10 && b.toString("latin1", 0, 3) === "GIF") return { ext: "gif", w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let p = 2;
    while (p + 9 < b.length) {
      if (b[p] !== 0xff) { p++; continue; }
      const m = b[p + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { p += 2; continue; }
      const len = b.readUInt16BE(p + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { ext: "jpeg", w: b.readUInt16BE(p + 7), h: b.readUInt16BE(p + 5) };
      p += 2 + len;
    }
  }
  return null;
}

const EMU = 9525; // per pixel
const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** The workbook with the pictures added, each in its cell's top-left corner, scaled to fit `maxPx` (default 72). */
export function addPictures(xlsx: Uint8Array, pictures: Picture[]): Uint8Array {
  const pics = pictures.map((p) => ({ ...p, info: imageInfo(p.bytes) })).filter((p) => p.info && p.info.w > 0 && p.info.h > 0);
  if (!pics.length) return xlsx;
  const files = unzip(xlsx);
  const get = (n: string) => files.find((f) => f.name === n);
  const text = (n: string) => get(n)?.data.toString("utf8") ?? "";
  const put = (n: string, s: string | Buffer) => { const d = typeof s === "string" ? Buffer.from(s, "utf8") : s; const f = get(n); if (f) f.data = d; else files.push({ name: n, data: d }); };

  // Sheet order → its file, from the workbook and its rels.
  const wbRels = text("xl/_rels/workbook.xml.rels");
  const target = (rid: string) => wbRels.match(new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*>`))?.[0].match(/Target="([^"]+)"/)?.[1] ?? "";
  const sheetFiles = [...text("xl/workbook.xml").matchAll(/<sheet\b[^>]*r:id="([^"]+)"/g)].map((m) => {
    const t = target(m[1]).replace(/^\/?xl\//, "").replace(/^\//, "");
    return `xl/${t}`;
  });

  let types = text("[Content_Types].xml");
  for (const ext of new Set(pics.map((p) => p.info!.ext))) {
    if (!new RegExp(`Extension="${ext}"`, "i").test(types)) types = types.replace("<Default ", `<Default Extension="${ext}" ContentType="image/${ext}"/><Default `);
  }
  let media = files.filter((f) => f.name.startsWith("xl/media/")).length;
  let drawingNo = files.filter((f) => /^xl\/drawings\/drawing\d+\.xml$/.test(f.name)).length;

  for (const [sheet, list] of Map.groupBy(pics, (p) => p.sheet)) {
    const file = sheetFiles[sheet];
    if (!file || !get(file)) continue;
    let xml = text(file);
    if (/<drawing\b/.test(xml)) continue; // already has drawings: leave that sheet alone
    drawingNo++;
    const drawing = `xl/drawings/drawing${drawingNo}.xml`;
    const rels: string[] = [];
    const anchors = list.map((p, i) => {
      media++;
      const name = `image${media}.${p.info!.ext}`;
      put(`xl/media/${name}`, Buffer.from(p.bytes));
      rels.push(`<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${name}"/>`);
      const max = p.maxPx ?? 72, k = Math.min(1, max / Math.max(p.info!.w, p.info!.h));
      const wPx = Math.round(p.info!.w * k), hPx = Math.round(p.info!.h * k), cx = wPx * EMU, cy = hPx * EMU;
      const top = p.rowPx ? Math.max(2, p.rowPx - hPx - 3) : 4;
      return `<xdr:oneCellAnchor><xdr:from><xdr:col>${p.col}</xdr:col><xdr:colOff>${4 * EMU}</xdr:colOff><xdr:row>${p.row}</xdr:row><xdr:rowOff>${top * EMU}</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 2}" name="${xmlEsc(`Picture ${i + 1}`)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rIdImg${i + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
    });
    put(drawing, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join("")}</xdr:wsDr>`);
    put(`xl/drawings/_rels/drawing${drawingNo}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`);
    types = types.replace("</Types>", `<Override PartName="/${drawing}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);

    // The sheet's rels: point at the drawing.
    const relsFile = file.replace(/([^/]+)$/, "_rels/$1.rels");
    const sheetRels = text(relsFile) || `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    put(relsFile, sheetRels.replace("</Relationships>", `<Relationship Id="rIdDrawing1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingNo}.xml"/></Relationships>`));

    // The <drawing> goes before legacyDrawing / tableParts / extLst when there are any (the schema's order), else at the end.
    if (!/xmlns:r=/.test(xml.slice(0, xml.indexOf(">", xml.indexOf("<worksheet"))))) xml = xml.replace("<worksheet ", `<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" `);
    const tag = `<drawing r:id="rIdDrawing1"/>`;
    const at = xml.search(/<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/);
    xml = at >= 0 ? xml.slice(0, at) + tag + xml.slice(at) : xml.replace("</worksheet>", `${tag}</worksheet>`);
    put(file, xml);
  }
  put("[Content_Types].xml", types);
  return zip(files);
}
