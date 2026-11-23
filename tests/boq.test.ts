import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { buildQuote, candidates, draftBlock, findColumns, isNewLine, memoryKey, newItemGroups, priceFor, quoteByDefault, score, sheetLines, totals, words } from "@/lib/boq";
import { db } from "@/lib/db";
import { resetFakeDb } from "./fakes/db";

beforeEach(() => resetFakeDb());

// The owner's sheet (BOQ - Security.xls, 20 Nov), cut down: a title row, the heading, lines, a section, a kit's contents sheet.
const SECURITY: unknown[][] = [
  ["OSnE for Security", "", "", "", ""],
  ["S. No.", "Item", "Make", "Unit", "Qty"],
  [1, "Rechargeable Torches", "WRAL", "Nos.", 10],
  [2, "Mega Phone / Bull Horn", "Ahuja 215M", "Nos.", 2],
  [3, "Fire Blanket 6' X 4'", "", "Nos.", 5],
  [4, "Cable Tie or Plastic Wire Ties", "", "Packet", ""],
  ["", "Items to be added", "", "", ""],
  ["", "Life Buoy (With Standard Rope 10 Mtr)", "", "Nos.", 10],
];
const KIT: unknown[][] = [["Basic First Aid Kit Contents", "", ""], ["QTY", "ITEM", "SIZE"], [1, "Bandage Scissors", ""], [20, "Antibiotic Ointment", "1 ½ gram"]];
const ITEMS = [
  { id: "torch", name: "Rechargeable Torch MZ - M240", rate: 425, gst: 18 },
  { id: "mega", name: "Ahuja Megaphone", rate: 4800, gst: 18 },
  { id: "mega2", name: "Megaphone Rechargeable MZ MIC-23", rate: 2400, gst: 18 },
  { id: "blanket", name: "Fire Blanket 6' X 4'", rate: 650, gst: 12 },
  { id: "lithium", name: "Bridgehill LITHIUM FIRE BLANKET Size: 3 M X 3 M", rate: 325000, gst: 18 },
];

test("the item table: its heading row in any order, lines under it, a words-only row starts a section", () => {
  assert.deepEqual(findColumns(SECURITY), { row: 1, columns: { sno: 0, item: 1, make: 2, unit: 3, qty: 4 } });
  const s = sheetLines("Security", SECURITY);
  assert.deepEqual(s.lines.map((l) => [l.row, l.item.slice(0, 12), l.qty, l.section]), [
    [3, "Rechargeable", 10, ""], [4, "Mega Phone /", 2, ""], [5, "Fire Blanket", 5, ""], [6, "Cable Tie or", null, ""], [8, "Life Buoy (W", 10, "Items to be added"],
  ]);
  assert.equal(quoteByDefault(s), true);
  // A kit's contents (QTY / ITEM / SIZE): read, but not quoted unless picked.
  const kit = sheetLines("Basic First Aid Kit Contents", KIT);
  assert.equal(kit.lines.length, 2);
  assert.equal(quoteByDefault(kit), false);
  assert.equal(sheetLines("Vendor Details", [["Sr. No.", "Vendor Name", "Mobile No."]]).lines.length, 0);
});

test("matching: same words win, sizes and models count, the plain fire blanket beats the ₹3.25 lakh lithium one", () => {
  assert.deepEqual(words("Mega Phone / Bull Horn"), ["megaphone", "megaphone"]);
  assert.deepEqual(words("Oxygen Cylinder Alcan 4.5Ltr"), ["oxygen", "cylinder", "alcan", "4.5", "ltr"]);
  const blanket = { item: "Fire Blanket 6' X 4'", make: "" };
  assert.ok(score(blanket, "Fire Blanket 6' X 4'") > score(blanket, "Bridgehill LITHIUM FIRE BLANKET Size: 3 M X 3 M") + 0.3);
  assert.equal(candidates(blanket, ITEMS, new Map())[0].itemId, "blanket");
  // The make counts: Ahuja asked, Ahuja first.
  assert.equal(candidates({ item: "Mega Phone / Bull Horn", make: "Ahuja 215M" }, ITEMS, new Map())[0].itemId, "mega");
  // Remembered from last time: first, sure.
  const mem = new Map([[memoryKey("Mega Phone / Bull Horn", "Ahuja 215M"), { key: "", itemId: "mega2", rate: 2600 }]]);
  assert.deepEqual(candidates({ item: "Mega Phone / Bull Horn", make: "Ahuja 215M" }, ITEMS, mem)[0], { itemId: "mega2", score: 1 });
});

test("price: your rate for the line last time, else our last quote / invoice, else Zoho's rate", () => {
  const items = new Map(ITEMS.map((i) => [i.id, i]));
  const latest = new Map([["mega", { itemId: "mega", rate: 4500, date: "2026-10-02", party: "Leela", kind: "estimates" as const }]]);
  assert.equal(priceFor("mega", "k", new Map([["k", { key: "k", itemId: "mega", rate: 4400 }]]), latest, items).source, "memory");
  const h = priceFor("mega", "k", new Map(), latest, items);
  assert.equal(h.rate, 4500);
  assert.match(h.note, /Last quoted 2 Oct 2026 · Leela/);
  assert.deepEqual(priceFor("torch", "k", new Map(), latest, items), { rate: 425, source: "zoho", note: "Zoho item rate" });
  assert.equal(priceFor(undefined, "k", new Map(), latest, items).rate, 0);
});

test("the temporary quotation: matched lines priced, an unknown line left for a person, totals with each line's GST", () => {
  const lines = buildQuote([sheetLines("Security", SECURITY)], ITEMS, new Map(), []);
  assert.deepEqual(lines.map((l) => [l.item.slice(0, 10), l.itemId ?? null, l.rate]), [["Rechargeab", "torch", 425], ["Mega Phone", "mega", 4800], ["Fire Blank", "blanket", 650], ["Cable Tie ", null, 0], ["Life Buoy ", null, 0]]);
  assert.deepEqual(totals(lines), { subtotal: 4250 + 9600 + 3250, gst: 765 + 1728 + 390, total: 4250 + 9600 + 3250 + 765 + 1728 + 390, priced: 3 });
});

const xls = (sheets: Record<string, unknown[][]>) => {
  const wb = XLSX.utils.book_new();
  for (const [n, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), n);
  return new File([XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer], "BOQ - Security.xlsx");
};

test("upload → save → the next sheet with the same line fills itself; Download Excel = their sheet with our rates", async () => {
  const d = await db();
  await d.collection<{ _id: string; items: object[] }>("kv").replaceOne({ _id: "zoho_items" }, { items: ITEMS }, { upsert: true });
  const { newQuote, saveQuote, exportQuote, listQuotes } = await import("@/lib/boqServer");
  const q = await newQuote(xls({ Security: SECURITY, "Basic First Aid Kit Contents": KIT }), "Sumit");
  assert.equal(q.title, "BOQ - Security");
  assert.deepEqual(q.sheets.map((s) => [s.name, s.chosen]), [["Security", true], ["Basic First Aid Kit Contents", false]]);
  const buoy = q.lines.find((l) => l.item.startsWith("Life Buoy"))!;
  assert.equal(buoy.itemId, undefined);
  // A person prices the life buoy by hand and swaps the torch for nothing.
  const saved = await saveQuote(q._id, { title: "Leela Waterstone", lines: [{ sheet: buoy.sheet, row: buoy.row, rate: 1850, qty: 10, gst: 18 }] }, "Sumit");
  assert.equal(saved.title, "Leela Waterstone");
  assert.equal(saved.lines.find((l) => l.row === buoy.row)!.rate, 1850);
  assert.equal((await listQuotes())[0].title, "Leela Waterstone");
  // The next customer's sheet with the same line: priced from memory.
  const again = await newQuote(xls({ Security: SECURITY }), "Arti");
  const buoy2 = again.lines.find((l) => l.item.startsWith("Life Buoy"))!;
  assert.deepEqual([buoy2.rate, buoy2.source], [1850, "memory"]);
  // The export: the customer's Security sheet with Rate / GST % / Amount / Our item after its last column, and a Quotation sheet.
  const f = await exportQuote(q._id);
  const wb = XLSX.read(f.bytes, { type: "array" });
  assert.deepEqual(wb.SheetNames, ["Security", "Basic First Aid Kit Contents", "Quotation"]);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Security, { header: 1, defval: "" });
  assert.deepEqual(rows[1].slice(5, 9), ["Rate (Rs)", "GST %", "Amount (Rs)", "Our item"]);
  assert.deepEqual(rows[2].slice(5, 9), [425, 18, 4250, "Rechargeable Torch MZ - M240"]);
  assert.deepEqual(rows[7].slice(5, 8), [1850, 18, 18500]);
  assert.match(f.name, /Leela Waterstone - quotation\.xlsx/);
});

test("new items: no item or an unconfirmed weak one, the same words once across sheets; the draft waits for them and for quantities", () => {
  const lines = buildQuote([sheetLines("Security", SECURITY)], ITEMS, new Map(), []);
  assert.equal(isNewLine({ itemId: undefined, score: 0 }), true);
  assert.equal(isNewLine({ itemId: "x", score: 0.6 }), true); // "check"
  assert.equal(isNewLine({ itemId: "x", score: 1 }), false);
  const groups = newItemGroups([{ id: "a", title: "Leela", lines }, { id: "b", title: "Taj", lines }]);
  const buoy = groups.find((g) => g.item.startsWith("Life Buoy"))!;
  assert.deepEqual([buoy.lines, buoy.qty, buoy.quotes.map((q) => q.title)], [2, 20, ["Leela", "Taj"]]);
  assert.ok(groups.some((g) => g.item.startsWith("Cable Tie")));
  assert.ok(!groups.some((g) => g.item.startsWith("Rechargeable")));
  assert.match(draftBlock(lines), /^2 lines need our item first/);
  assert.equal(draftBlock(lines.map((l) => ({ ...l, itemId: "x", score: 1 }))), "1 line has no quantity.");
  assert.equal(draftBlock(lines.map((l) => ({ ...l, itemId: "x", score: 1, qty: 1 }))), "");
});

test("new items on the server: a pick settles the words on every sheet and the next; an item made in Zoho matches by itself", async () => {
  const d = await db();
  const kv = d.collection<{ _id: string; items: object[] }>("kv");
  await kv.replaceOne({ _id: "zoho_items" }, { items: ITEMS }, { upsert: true });
  const { newQuote, newItems, matchItem, saveQuote, getQuote } = await import("@/lib/boqServer");
  const a = await newQuote(xls({ Security: SECURITY }), "Sumit");
  const b = await newQuote(xls({ Security: SECURITY }), "Arti");
  const listed = await newItems();
  const buoy = listed.find((g) => g.item.startsWith("Life Buoy"))!;
  assert.equal(buoy.quotes.length, 2);
  // Picked once → both sheets, score 1, priced; gone from the list.
  assert.deepEqual(await matchItem(buoy.key, "blanket", "Sumit"), { lines: 2 });
  for (const id of [a._id, b._id]) {
    const l = (await getQuote(id))!.lines.find((x) => x.item.startsWith("Life Buoy"))!;
    assert.deepEqual([l.itemId, l.score, l.rate], ["blanket", 1, 650]);
  }
  assert.ok(!(await newItems()).some((g) => g.key === buoy.key));
  // The next sheet with the same line: matched from memory.
  const c = await newQuote(xls({ Security: SECURITY }), "Arti");
  assert.equal(c.lines.find((x) => x.item.startsWith("Life Buoy"))!.itemId, "blanket");
  // Someone makes the cable ties in Zoho: the next look matches them on every sheet.
  await kv.replaceOne({ _id: "zoho_items" }, { items: [...ITEMS, { id: "ties", name: "Cable Ties Plastic", rate: 90, gst: 18 }] }, { upsert: true });
  assert.ok(!(await newItems()).some((g) => g.item.startsWith("Cable Tie")));
  assert.equal((await getQuote(a._id))!.lines.find((x) => x.item.startsWith("Cable Tie"))!.itemId, "ties");
  // A different item picked on the quotation itself counts as confirmed.
  const torch = (await getQuote(a._id))!.lines.find((x) => x.item.startsWith("Rechargeable"))!;
  const saved = await saveQuote(a._id, { lines: [{ sheet: torch.sheet, row: torch.row, itemId: "mega2", rate: 400, qty: 10, gst: 18 }] }, "Sumit");
  assert.equal(saved.lines.find((x) => x.row === torch.row)!.score, 1);
});
