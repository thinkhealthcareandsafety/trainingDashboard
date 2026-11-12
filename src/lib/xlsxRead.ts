/*
 * Reads the first sheet of an .xlsx file into rows of text, in the browser, with no package (docs/TRAINING_MANAGER_PLAN.md
 * step 6: the coordinator's Excel import). An .xlsx is a zip of XML files: this finds the sheet and the shared strings in
 * the zip's directory, inflates them with the browser's DecompressionStream, and reads the cells. Enough for a list of
 * names and phone numbers; formulas show their last value, dates their serial number.
 */

const dec = new TextDecoder();

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The zip's files by name → a function that gives each one's bytes. */
function zipEntries(buf: Uint8Array): Map<string, () => Promise<Uint8Array>> {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66_000); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error("not a zip");
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const out = new Map<string, () => Promise<Uint8Array>>();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error("bad zip directory");
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    out.set(name, async () => {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const raw = buf.subarray(start, start + size);
      if (method === 0) return raw;
      if (method === 8) return inflate(raw);
      throw new Error("unsupported zip compression");
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const unxml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1])).join("");
const colIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
/** 9.87654321E9 → "9876543210" (Excel keeps long numbers that way). */
const plainNumber = (s: string) => (/^-?\d+(\.\d+)?e[+-]?\d+$/i.test(s) ? Number(s).toFixed(0) : s.replace(/\.0+$/, ""));

/** The rows of a sheet's XML, given the workbook's shared strings. */
export function sheetRows(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const r of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = [];
    for (const c of (r[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], body = c[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
      const value = type === "s" ? shared[Number(v)] ?? "" : type === "inlineStr" ? texts(body) : type === "str" || type === "b" || type === "e" ? unxml(v) : plainNumber(v);
      const i = ref ? colIndex(ref) : row.length;
      while (row.length < i) row.push("");
      row[i] = value;
    }
    rows.push(row);
  }
  return rows;
}

/** The first sheet of an .xlsx as rows of text. */
export async function readXlsx(data: ArrayBuffer): Promise<string[][]> {
  const files = zipEntries(new Uint8Array(data));
  const text = async (name: string) => { const f = files.get(name); return f ? dec.decode(await f()) : ""; };
  const sharedXml = await text("xl/sharedStrings.xml");
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  // The workbook's first sheet, through its relationship; sheet1.xml when that can't be read.
  let path = "xl/worksheets/sheet1.xml";
  const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(await text("xl/workbook.xml"))?.[1];
  const target = rid ? new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(await text("xl/_rels/workbook.xml.rels"))?.[1] ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(await text("xl/_rels/workbook.xml.rels"))?.[1] : undefined;
  if (target) path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  const sheet = (await text(path)) || (await text([...files.keys()].filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort()[0] ?? ""));
  if (!sheet) throw new Error("no sheet in the file");
  return sheetRows(sheet, shared);
}
