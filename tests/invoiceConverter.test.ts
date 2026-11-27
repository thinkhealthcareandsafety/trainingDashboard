import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { ewayFileName, groupByCustomer, isEwayFile, isPoFile, needsEway, poFileName, poFileTest, poState, splitAttachments, isSignedFile, signedFileName } from "@/lib/invoiceConverterRules";
import { dscSpot } from "@/lib/pdfMerge";
import { db } from "@/lib/db";
import { resetFakeDb } from "./fakes/db";
import { clearPo, orderText, poInPdf, poKey } from "@/lib/poMatch";
import { poLogGroup } from "@/lib/poLog";
import { checkAgain, matchNewKeys, poFileFor, poFiles, poLog, poLogFile } from "@/lib/poFolder";
import { GET as convGet, POST as convPost } from "@/app/api/invoice-converter/route";

// The Invoice Converter (owner, 17 Nov): customers, their invoices, the PO and (over ₹50,000) the e-way bill.

beforeEach(() => resetFakeDb());

test("PO: a real number ticks; Verbal, NA, dashes or nothing cross", () => {
  assert.deepEqual(poState("1000033706"), { ok: true, label: "1000033706" });
  assert.deepEqual(poState(" 6566219 - OP - 4470300006 "), { ok: true, label: "6566219 - OP - 4470300006" });
  assert.deepEqual(poState("Verbal"), { ok: false, label: "Verbal" });
  assert.equal(poState("NA").ok, false);
  assert.equal(poState("--").ok, false);
  assert.deepEqual(poState(undefined), { ok: false, label: "No PO" });
});

test("e-way bills over ₹50,000; our attachment names are told apart", () => {
  assert.equal(needsEway(50_000), false);
  assert.equal(needsEway(51_531), true);
  assert.equal(poFileName("2026-01-525"), "PO - 2026-01-525.pdf");
  assert.equal(ewayFileName("2026-01-525"), "E-way bill - 2026-01-525.pdf");
  assert.ok(isPoFile("PO - 2026-01-525.pdf") && isPoFile("Purchase Order 4470.pdf") && !isPoFile("Poster.pdf"));
  assert.ok(isEwayFile("E-way bill - 2026-01-525.pdf") && isEwayFile("eway 2323.pdf") && !isEwayFile("PO - 1.pdf"));
});

test("customers newest first, their invoices newest first, and how many still miss something", () => {
  const inv = (customerId: string, number: string, date: string, total: number, poOk: boolean, extra: Partial<{ poPdf: boolean; eway: string | null; ewayPdf: boolean }> = {}) =>
    ({ customerId, customerName: customerId.toUpperCase(), id: number, number, date, total, status: "sent", pi: null, po: poOk ? "123" : "Verbal", poOk, poPdf: false, eway: null, ewayZoho: false, ewayPdf: false, needsEway: needsEway(total), pending: false, ...extra });
  const g = groupByCustomer([
    inv("a", "1", "2026-10-01", 9000, true, { poPdf: true }),
    inv("b", "2", "2026-11-10", 80000, true, { poPdf: true, eway: "232328638953", ewayPdf: true }),
    inv("a", "3", "2026-11-12", 60000, false),
  ]);
  assert.deepEqual(g.map((c) => [c.id, c.invoices.map((i) => i.number), c.missing]), [["a", ["3", "1"], 1], ["b", ["2"], 0]]);
});

test("the converter reads the Sales copy: invoices by customer, the PO from the invoice field; small ones need no Zoho read", async () => {
  const { converterData } = await import("@/lib/invoiceConverter");
  const docs = (await db()).collection<{ _id: string; kind: string; id: string; lmt: string; date: string; row: Record<string, unknown> }>("salesDocs");
  await docs.insertOne({ _id: "invoices:11", kind: "invoices", id: "11", lmt: "x", date: "2026-11-01", row: { invoice_number: "2026-01-600", date: "2026-11-01", status: "sent", customer_id: "c1", customer_name: "The Grand", total: 22404, cf_purchase_order_number: "PO26-2008-V1" } });
  await docs.insertOne({ _id: "invoices:12", kind: "invoices", id: "12", lmt: "x", date: "2026-11-02", row: { invoice_number: "2026-01-601", date: "2026-11-02", status: "sent", customer_id: "c1", customer_name: "The Grand", total: 30975, cf_purchase_order_number: "Verbal" } });
  await docs.insertOne({ _id: "estimates:9", kind: "estimates", id: "9", lmt: "x", date: "2026-11-02", row: { estimate_number: "Q-1", total: 5 } });
  await (await db()).collection<{ _id: string; name: string }>("zohoCustomers").insertOne({ _id: "c1", name: "The Grand Hotel, Pune" }); // renamed in Zoho since
  const r = await converterData();
  assert.equal(r.pending, 0);
  assert.equal(r.customers[0].name, "The Grand Hotel, Pune"); // the name Zoho has now, not the one on the invoices
  assert.equal(r.customers.length, 1);
  assert.deepEqual(r.customers[0].invoices.map((i) => [i.number, i.po, i.poOk, i.needsEway]), [["2026-01-601", "Verbal", false, false], ["2026-01-600", "PO26-2008-V1", true, false]]);
  assert.equal(r.customers[0].missing, 2); // neither has a PO PDF yet
});

test("merge: the invoice first, then the PO and the e-way bill; a picture becomes a page; the signature sits on the invoice's last page", async () => {
  const { PDFDocument } = await import("pdf-lib");
  const { mergeParts, signSpot } = await import("@/lib/pdfMerge");
  const pdf = async (pages: number, w = 595, h = 842) => { const d = await PDFDocument.create(); for (let i = 0; i < pages; i++) d.addPage([w, h]); return d.save(); };
  // A 1×1 PNG.
  const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  const m = await mergeParts([
    { bytes: await pdf(2), type: "application/pdf", name: "Invoice.pdf" },
    { bytes: png, type: "image/png", name: "PO - 1.png" },
    { bytes: await pdf(1, 612, 792), type: "application/pdf", name: "E-way bill - 1.pdf" },
    { bytes: new Uint8Array([1, 2, 3]), type: "application/zip", name: "notes.zip" },
  ], "Invoice 1");
  const doc = await PDFDocument.load(m.bytes);
  assert.equal(doc.getPageCount(), 4);
  assert.equal(m.firstPages, 2);
  assert.deepEqual(m.signPage, { index: 1, width: 595, height: 842 });
  assert.deepEqual(m.skipped, ["notes.zip"]);
  assert.deepEqual(signSpot(m.signPage), { page: 1, x: 385, y: 712 });
  await assert.rejects(mergeParts([{ bytes: new Uint8Array([1]), type: "text/plain" }]), /Nothing to merge/);
});

test("merge & draft: signature, date and name sit left of 'Authorized Signature' on the invoice's page, not the T&C page", async () => {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const { findSignLabel, signBoxes } = await import("@/lib/pdfMerge");
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.Helvetica);
  d.addPage([595.42, 841.69]);
  const p2 = d.addPage([595.42, 841.69]);
  p2.drawText("Authorized Signature", { x: 412.9, y: 117.9, size: 8, font });
  d.addPage([595.42, 841.69]).drawText("VENDOR-CUSTOMER TERMS & CONDITIONS", { x: 45.6, y: 767.9, size: 8, font });
  const label = await findSignLabel(await d.save(), 3);
  assert.equal(label?.page, 1);
  assert.ok(Math.abs((label?.x ?? 0) - 412.9) < 0.5 && Math.abs((label?.y ?? 0) - 117.9) < 0.5);
  const boxes = signBoxes(label);
  assert.deepEqual(boxes.map((b) => b.type), ["Signature", "Date", "Name"]);
  assert.deepEqual(boxes.map((b) => [b.page, b.x, b.y]), [[1, 210, 654], [1, 219, 691], [1, 219, 707]]);
  // Stacked top to bottom without overlapping, all left of the box (x 337) and above the label.
  for (let k = 1; k < boxes.length; k++) assert.ok(boxes[k].y >= boxes[k - 1].y + boxes[k - 1].h);
  for (const b of boxes) assert.ok(b.x + b.w <= 360 && b.y + b.h <= 841.69 - 117.9);
  // Not found (not in the invoice's own pages): the standard spot on the first page.
  assert.equal(await findSignLabel(await d.save(), 1), null);
  assert.deepEqual(signBoxes(null)[0], { ...boxes[0], page: 0 });
});

test("signer details: a real email and a full name, saved per person", async () => {
  const { setSigner, signerOf } = await import("@/lib/invoiceConverter");
  await assert.rejects(setSigner("m1", { email: "nope", name: "Arti Sirohi" }), /email/);
  await assert.rejects(setSigner("m1", { email: "a@x.in", name: " " }), /full name/);
  await setSigner("m1", { email: " Logistics@ThinkHealth.in ", name: "Aarti  Sirohi" });
  assert.deepEqual(await signerOf("m1"), { _id: "m1", email: "logistics@thinkhealth.in", name: "Aarti Sirohi" });
});

test("the number from an attached PDF's text: the PO number after its label, the 12-digit e-way bill number", async () => {
  const { poFromText, ewayFromText } = await import("@/lib/invoiceConverterRules");
  assert.equal(poFromText("PURCHASE ORDER\nPO No: 4470300008\nDate: 12/11/2026"), "4470300008");
  assert.equal(poFromText("P.O. Number : PO26-2008-V1  Vendor: Think Health"), "PO26-2008-V1");
  assert.equal(poFromText("Purchase Order No. 6566219-OP-4470300006 dated 3 Nov"), "6566219-OP-4470300006");
  assert.equal(poFromText("Purchase Order Date: 12 Nov 2026"), null);
  assert.equal(poFromText("Tax invoice"), null);
  assert.equal(ewayFromText("E-Way Bill No: 2323 2863 8953  Generated Date"), "232328638953");
  assert.equal(ewayFromText("EWB No. 292328646488"), "292328646488");
  assert.equal(ewayFromText("Generated by NIC 351234567890 valid until"), "351234567890");
  assert.equal(ewayFromText("GSTIN 27AACCT1234Q1Z5"), null);
});

test("an attached PDF's text is read on the server (unpdf), so its PO number can be filled in", async () => {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const { pdfText } = await import("@/lib/invoiceConverter");
  const { poFromText } = await import("@/lib/invoiceConverterRules");
  const d = await PDFDocument.create();
  const p = d.addPage([595, 842]);
  const font = await d.embedFont(StandardFonts.Helvetica);
  p.drawText("PURCHASE ORDER", { x: 50, y: 780, size: 18, font });
  p.drawText("PO No: 4470300008", { x: 50, y: 750, size: 12, font });
  const text = await pdfText(await d.save());
  assert.equal(poFromText(text), "4470300008");
  assert.equal(await pdfText(new Uint8Array([1, 2, 3])), ""); // not a PDF: nothing, no crash
});

test("one PI, many invoices: the PI from the invoice's Reference, linked blocks where a PI has two or more", async () => {
  const { piOf, blocksOf } = await import("@/lib/invoiceConverterRules");
  assert.equal(piOf("Performa-25-1223"), "Performa-25-1223");
  assert.equal(piOf(" performa 25/1223 part 2"), "Performa-25-1223");
  assert.equal(piOf("Quotation-24-002774"), null);
  assert.equal(piOf(undefined), null);
  const inv = (id: string, pi: string | null) => ({ id, number: id, date: "", total: 1, status: "sent", pi, po: "No PO", poOk: false, poPdf: false, eway: null, ewayZoho: false, ewayPdf: false, needsEway: false, pending: false });
  // Newest first: the PI's block sits where its newest invoice is; a PI with one invoice stands alone.
  const b = blocksOf([inv("5", "P-1"), inv("4", null), inv("3", "P-1"), inv("2", "P-2"), inv("1", "P-1")]);
  assert.deepEqual(b.map((x) => [x.pi, x.invoices.map((i) => i.id)]), [["P-1", ["5", "3", "1"]], [null, ["4"]], [null, ["2"]]]);
});

test("a PO saved on one invoice finds every invoice of the same PI and customer (not void, not other customers)", async () => {
  const { samePiInvoices, converterData } = await import("@/lib/invoiceConverter");
  const docs = (await db()).collection<{ _id: string; kind: string; id: string; lmt: string; date: string; row: Record<string, unknown> }>("salesDocs");
  const put = (id: string, ref: string, customer = "c1", status = "sent") => docs.insertOne({ _id: `invoices:${id}`, kind: "invoices", id, lmt: "x", date: "2026-11-01", row: { invoice_number: `2026-01-${id}`, date: "2026-11-01", status, customer_id: customer, customer_name: "A", total: 1000, reference_number: ref } });
  await put("21", "Performa-25-1214");
  await put("22", "Performa-25-1214");
  await put("23", "Performa-25-1214", "c1", "void");
  await put("24", "Performa-25-1214", "c2");
  await put("25", "Performa-25-1215");
  await put("26", "");
  assert.deepEqual((await samePiInvoices("22")).map((r) => r.id), ["22", "21"]);
  assert.deepEqual((await samePiInvoices("26")).map((r) => r.id), ["26"]);
  assert.deepEqual(await samePiInvoices("99"), []);
  const r = await converterData();
  assert.equal(r.customers.find((c) => c.id === "c1")!.invoices.find((i) => i.id === "21")!.pi, "Performa-25-1214");
});

test("an e-way bill number: 12 digits; the invoice's E-way Bill Number field from Zoho shows, editable here", async () => {
  const { cleanEway } = await import("@/lib/invoiceConverterRules");
  const { setEway, converterData } = await import("@/lib/invoiceConverter");
  assert.equal(cleanEway(" 2323 2863 8953 "), "232328638953");
  assert.equal(cleanEway("12345"), null);
  const docs = (await db()).collection<{ _id: string; kind: string; id: string; lmt: string; date: string; row: Record<string, unknown> }>("salesDocs");
  await docs.insertOne({ _id: "invoices:31", kind: "invoices", id: "31", lmt: "x", date: "2026-11-01", row: { invoice_number: "2026-01-631", date: "2026-11-01", status: "sent", customer_id: "c1", total: 9000, cf_e_way_bill_number: "232328638953" } });
  await assert.rejects(setEway("31", "123"), /12 digits/); // checked before anything goes to Zoho
  const inv = (await converterData()).customers[0].invoices[0];
  assert.equal(inv.eway, "232328638953");
  assert.equal(inv.ewayZoho, false); // our field, not Zoho's own e-way bill: can be changed here
});

test("PO found: the whole number, only its marks may differ; short ones only after a PO label (from the real folder)", () => {
  const on = (po: string, text: string) => poInPdf(poKey(po), text);
  assert.ok(on("6566219-OP-4470300006", "Purchase Order 6566219 OP -- 4470300006 7 Item"));
  assert.ok(on("6568686 - OP - 4470300047", "Purchase Order 4470300047- -OP 6568686"));
  assert.ok(on("4500149348 / 0", "PURCHASE ORDER : 4500149348 / 0 ORDER DATE"));
  assert.ok(on("B202610-05628", "Novotel Goa PanjimP.O. No.: B202610-05628"));
  assert.ok(on("3981", "DATE 02-04-2026 PO # 3981 GSTIN") && on("161647", "Purchase Order No Dated Think Health Care & Safety 161647 30/12/2025"));
  assert.ok(on("6013", "Purchase Order page 1 of To, SUPAB23 Furchase order No {TT 6013 THINK") && on("3793", "Purchase Order medic assist Lise-Meitner-Allee 27 + 44801 Bochum Think Health Care and Safety 3793 22-07-2026 1/1"));
  assert.ok(clearPo("Purchase Order No 1518 Date") && clearPo("PO NUMBER : KOLKA0000072306") && !clearPo("Purchase Order Document No. Date") && !clearPo(""));
  assert.ok(on("STS/ 84/LPO", "Local Purchase Order No:STS/ 84 /LPO"));
  // Never part of a longer number, an unlabelled short one, or too little to go by.
  assert.ok(!on("52600831", "PO No 152600831") && !on("52600831", "PO No 526008312") && !on("5628", "B202610-05628"));
  assert.ok(!on("25-367", "Other References PI No - 25-367") && !on("1518", "Purchase Order HSN 1518 qty") && !on("3981", "HSN 3981 02-04-2026") && !on("6013", "Purchase Order No 77 for 6013"));
  for (const bad of ["", "00", "Verbal", "whatsapp", "2026-01-450", "Performa-26-1060"]) assert.equal(poKey(bad), "", bad);
  assert.ok(orderText("PURCHASE ORDER PO NO : 31") && !orderText("Statement of account"));
});

test("PO found: PDFs by PO number, the same copy once; a number typed later is compared too; only that invoice's PDF opens", async () => {
  const d = await db();
  const s = (id: string, name: string, size: number, depth: number, text: string, hits: string[]) => d.collection<any>("poScans").insertOne({ _id: id, name, size, depth, text, hits, look: "no", v: 2, at: "" });
  await s("filecopy0001", "PO 52600831.pdf", 10, 2, "", ["52600831"]);
  await s("filetop00001", "PO 52600831.pdf", 10, 0, "PO No 52600831", ["52600831"]);
  await s("fileother001", "a.pdf", 5, 0, "Purchase Order 7001629499", []);
  await d.collection<any>("kv").insertOne({ _id: "po_folder", keys: ["52600831"], at: "" });
  await d.collection<any>("salesDocs").insertOne({ _id: "invoices:1000001", id: "1000001", kind: "invoices", row: { cf_purchase_order_number: "52600831", invoice_number: "A" } });
  assert.deepEqual((await poFiles()).get("52600831"), [{ id: "filetop00001", name: "PO 52600831.pdf" }]);
  await matchNewKeys(["52600831", "7001629499"]);
  assert.deepEqual((await poFiles()).get("7001629499"), [{ id: "fileother001", name: "a.pdf" }]);
  assert.equal((await poFileFor("1000001", "filetop00001")).key, "52600831");
  await assert.rejects(poFileFor("1000001", "fileother001"));
  const req = (id: string, body?: object) => new Request("http://x/api/invoice-converter?po=filetop00001&id=1000001", { method: body ? "POST" : "GET", ...(body ? { body: JSON.stringify(body) } : {}), headers: { "content-type": "application/json", ...(id ? { "x-test-member": JSON.stringify({ id, name: id }) } : {}) } });
  assert.equal((await convGet(req(""))).status, 401);
  assert.equal((await convGet(req("shreya"))).status, 403);
  assert.equal((await convPost(req("shreya", { action: "scanPo" }))).status, 403);
  assert.equal((await convPost(req("admin", { action: "usePo", id: "1000001", file: "../x" }))).status, 400);
});

test("a scan: its bytes only while it waits; the words read on it are matched, for its copies too, once", async () => {
  const d = await db();
  const s = (id: string, look: string, name = "scan.pdf") => d.collection<any>("poScans").insertOne({ _id: id, name, size: 9, depth: 0, text: "", hits: [], look, v: 3, at: "" });
  await s("scanfile00001", "due"); await s("scanfile00002", "due"); await s("scanfile00003", "no", "other.pdf");
  await d.collection<any>("kv").insertOne({ _id: "po_folder", keys: ["6013"], at: "" });
  const call = (id: string, body: object) => convPost(new Request("http://x/api/invoice-converter", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-test-member": JSON.stringify({ id, name: id }) } }));
  const bytes = (f: string) => convGet(new Request(`http://x/api/invoice-converter?scan=${f}`, { headers: { "x-test-member": JSON.stringify({ id: "admin", name: "Admin" }) } }));
  assert.equal((await bytes("scanfile00003")).status, 404);
  assert.equal((await call("shreya", { action: "pageText", file: "scanfile00001", text: "x" })).status, 403);
  assert.equal((await call("admin", { action: "pageText", file: "scanfile00001", text: 5 })).status, 400);
  assert.equal((await call("admin", { action: "pageText", file: "scanfile00001", text: "Purchase Order No 6013 THINK" })).status, 200);
  assert.deepEqual((await poFiles()).get("6013"), [{ id: "scanfile00001", name: "scan.pdf" }]);
  assert.equal((await d.collection<any>("poScans").findOne({ _id: "scanfile00002" })).look, "done");
  await call("admin", { action: "pageText", file: "scanfile00001", text: null });
  assert.equal((await d.collection<any>("poScans").findOne({ _id: "scanfile00001" })).look, "done");
  assert.equal((await bytes("scanfile00001")).status, 404);
});

test("the scan log: each PDF, how it was read, its PO number, and whether its invoice has it; only what changed when asked", async () => {
  const d = await db();
  const s = (id: string, text: string, hits: string[], look: string, at: string) => d.collection<any>("poScans").insertOne({ _id: id, name: id + ".pdf", size: 1, depth: 0, text, hits, look, v: 3, at });
  await s("a", "Purchase Order No 52600831 x", ["52600831"], "no", "2026-11-25T01:00:00.000Z");
  await s("b", "Purchase Order No: 70001234 x", [], "done", "2026-11-25T02:00:00.000Z");
  await s("c", "", [], "failed", "2026-11-25T03:00:00.000Z");
  await s("e", "", [], "due", "2026-11-25T00:00:00.000Z");
  const inv = (id: string) => d.collection<any>("salesDocs").insertOne({ _id: "invoices:" + id, id, kind: "invoices", row: { cf_purchase_order_number: "52600831", invoice_number: "N" + id } });
  await inv("1"); await inv("2");
  await d.collection<any>("invoiceExtras").insertOne({ _id: "1", files: ["PO - N1.pdf"] });
  const l = await poLog();
  assert.deepEqual(l.entries.map((e) => [e.id, poLogGroup(e), e.po]), [["c", "unread", ""], ["b", "none", "70001234"], ["a", "open", "52600831"], ["e", "waiting", ""]]);
  assert.deepEqual([l.matched, l.waiting], [2, 1]);
  // Each scan compares them again with the PO numbers on the invoices now.
  await d.collection<any>("salesDocs").insertOne({ _id: "invoices:3", id: "3", kind: "invoices", row: { cf_purchase_order_number: "70001234", invoice_number: "N3" } });
  assert.deepEqual((await checkAgain(["b", "a"])).entries.map((e) => [e.id, e.invoices.length]), [["b", 1], ["a", 2]]);
  assert.deepEqual((await d.collection<any>("poScans").findOne({ _id: "b" })).hits, ["70001234"]);
  // Preview: what reads like an order only.
  assert.equal(await poLogFile("a"), "a.pdf");
  await assert.rejects(poLogFile("c"));
  await assert.rejects(poLogFile("nope"));
  await d.collection<any>("invoiceExtras").insertOne({ _id: "2", files: ["PO - N2.pdf"] });
  assert.equal(poLogGroup((await poLog()).entries[2]), "has");
});

test("an attachment is the PO when its name says so, carries the PO number, or it was opened and does; payments aren't", () => {
  const is = poFileTest("6567134-OP-4470300035", ["letter.pdf"]);
  for (const n of ["6567134.pdf", "JLL 4470300035 (1).PDF", "PO - 2026-01-593.pdf", "letter.pdf"]) assert.ok(is(n), n);
  for (const n of ["6567134.jpeg", "16567134.pdf", "unicorn payment.pdf", "E-way bill - 6567134.pdf", "OP.pdf"]) assert.ok(!is(n), n);
  assert.ok(!poFileTest("Verbal")("unicorn payment.pdf") && !poFileTest("3793")("3793.pdf"));
});

test("a report carrying the PO number is an attachment, not a second PO (2026-01-552, 27 Nov)", () => {
  const is = poFileTest("6570080-OP-4470300036");
  const wcc = "WCC_ThinkHealthcareSafety_6570080_Equipment Inspection Report_ETV_5_Bengaluru.pdf";
  const s = splitAttachments([wcc, "PO - 2026-01-552.pdf", "E-way bill - 2026-01-552.pdf"], (n) => n, is);
  assert.equal(s.po, "PO - 2026-01-552.pdf");
  assert.equal(s.eway, "E-way bill - 2026-01-552.pdf");
  assert.deepEqual(s.others, [wcc]);
  // Only a PO number in the name and nothing named "PO": that file is the PO, the rest are attachments.
  assert.deepEqual(splitAttachments(["6570080.pdf", "photo.jpg"], (n) => n, is), { po: "6570080.pdf", eway: undefined, others: ["photo.jpg"] });
});

test("the DSC-signed copy is known by its name and never merged in as an attachment (27 Nov)", () => {
  assert.equal(signedFileName("2026-01-552"), "Invoice 2026-01-552 signed.pdf");
  assert.ok(isSignedFile("Invoice 2026-01-552 signed.pdf") && isSignedFile("invoice 2026-01-552 - PO signed.PDF"));
  assert.ok(!isSignedFile("Signed WCC report.pdf") && !isSignedFile("Invoice 2026-01-552.pdf"));
  const s = splitAttachments(["PO - 2026-01-552.pdf", "Invoice 2026-01-552 signed.pdf", "WCC report.pdf"], (n) => n, poFileTest("6570080-OP-4470300036"));
  assert.deepEqual(s.others, ["WCC report.pdf"]);
});

test("the DSC stamp sits left of Authorized Signature, under the bank details, and moves with the label", () => {
  assert.deepEqual(dscSpot({ page: 0, x: 412.9, y: 130.1, pageHeight: 841.69 }), { page: 0, x: 123, y: 131, w: 200, h: 56 });
  assert.deepEqual(dscSpot({ page: 1, x: 412.9, y: 300, pageHeight: 841.69 }), { page: 1, x: 123, y: 301, w: 200, h: 56 });
  assert.equal(dscSpot(null).page, 0);
});
