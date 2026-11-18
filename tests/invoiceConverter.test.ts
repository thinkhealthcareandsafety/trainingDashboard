import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { ewayFileName, groupByCustomer, isEwayFile, isPoFile, needsEway, poFileName, poState } from "@/lib/invoiceConverterRules";
import { db } from "@/lib/db";
import { resetFakeDb } from "./fakes/db";

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

test("a PI's PO already on one invoice is copied to its others: one real number fills the rest, a PDF only once all are known", async () => {
  const { fillPlan } = await import("@/lib/invoiceConverterRules");
  const it = (id: string, pi: string | null, po: string, poPdf = false, known = true, customerId = "c1") => ({ id, customerId, pi, po, poPdf, known });
  // Performa-25-931 from the owner's screen: 525 has 1000033706, the other three have Verbal / nothing.
  const p = fillPlan([it("547", "P-931", "Verbal"), it("525", "P-931", "1000033706", true), it("370", "P-931", ""), it("369", "P-931", ""), it("400", null, "")]);
  assert.deepEqual(p.numbers, [{ value: "1000033706", ids: ["547", "370", "369"] }]);
  assert.deepEqual(p.pdfs, [{ from: "525", to: ["547", "370", "369"] }]);
  // Two different numbers: left for a person. Attachments not read yet: no PDF copy yet.
  assert.deepEqual(fillPlan([it("1", "P", "A1"), it("2", "P", "B2"), it("3", "P", "")]).numbers, []);
  assert.deepEqual(fillPlan([it("1", "P", "A1", true), it("2", "P", "", false, false)]).pdfs, []);
  // Same PI number at another customer: a separate group.
  assert.deepEqual(fillPlan([it("1", "P", "A1"), it("2", "P", "", false, true, "c2")]).numbers, []);
});

test("an e-way bill number typed in: 12 digits, kept here, Zoho's own number still comes first", async () => {
  const { cleanEway } = await import("@/lib/invoiceConverterRules");
  const { setEway, converterData } = await import("@/lib/invoiceConverter");
  assert.equal(cleanEway(" 2323 2863 8953 "), "232328638953");
  assert.equal(cleanEway("12345"), null);
  const docs = (await db()).collection<{ _id: string; kind: string; id: string; lmt: string; date: string; row: Record<string, unknown> }>("salesDocs");
  await docs.insertOne({ _id: "invoices:31", kind: "invoices", id: "31", lmt: "x", date: "2026-11-01", row: { invoice_number: "2026-01-631", date: "2026-11-01", status: "sent", customer_id: "c1", total: 9000 } });
  await assert.rejects(setEway("31", "123"), /12 digits/);
  assert.deepEqual(await setEway("31", "2323 2863 8953"), { eway: "232328638953" });
  const inv = (await converterData()).customers[0].invoices[0];
  assert.equal(inv.eway, "232328638953");
  assert.equal(inv.ewayZoho, false);
  assert.deepEqual(await setEway("31", ""), { eway: null });
});
