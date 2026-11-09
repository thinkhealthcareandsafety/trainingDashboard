// Editing an item (src/lib/itemEdit.ts + /api/quotations): what's checked, what changed, what Zoho is sent. Nothing here reaches Zoho.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { cleanItemFields, gstKnown, isPicture, itemBody, itemChanges, itemFieldsOf, itemPictures, itemProblem } from "@/lib/itemEdit";
import { POST } from "@/app/api/quotations/route";
import { resetFakeDb } from "./fakes/db";

const zoho = { name: "Hot Water Bag", rate: 249, description: "", hsn_or_sac: "40149020", custom_field_hash: { cf_item_identifier: "Medical Safety" } };
const before = itemFieldsOf(zoho);

test("reads Zoho's answer; fields it leaves out are empty", () => {
  assert.deepEqual(before, { name: "Hot Water Bag", rate: 249, description: "", hsn: "40149020", identifier: "Medical Safety", stock: "", offerPrice: "", gst: "" });
  assert.equal(itemFieldsOf({ name: "X", rate: 1, cf_stock_status: "In Stock" }).stock, "In Stock");
});

test("only what changed goes to Zoho, with the name and rate it always wants", () => {
  const after = { ...before, offerPrice: "200", description: "New" };
  const changes = itemChanges(before, after);
  assert.deepEqual(Object.keys(changes).sort(), ["description", "offerPrice"]);
  assert.deepEqual(changes.offerPrice, { from: "", to: "200" });
  assert.deepEqual(itemBody(after, changes), { name: "Hot Water Bag", rate: 249, description: "New", custom_fields: [{ customfield_id: "982417000021532093", value: "200" }] });
  assert.deepEqual(itemBody(before, itemChanges(before, before)), { name: "Hot Water Bag", rate: 249 }); // nothing else
});

test("GST: both of Zoho's taxes go when it changes, nothing when it doesn't; a rate it doesn't list isn't sent", () => {
  const prefs = [{ tax_specification: "inter", tax_percentage: 18 }, { tax_specification: "intra", tax_percentage: 18 }];
  const was = itemFieldsOf({ ...zoho, item_tax_preferences: prefs });
  assert.equal(was.gst, "18");
  assert.equal(itemBody(was, itemChanges(was, was)).item_tax_preferences, undefined);
  const to5 = { ...was, gst: "5" };
  assert.deepEqual(itemBody(to5, itemChanges(was, to5)).item_tax_preferences, [{ tax_id: "982417000000014433", tax_specification: "intra" }, { tax_id: "982417000000014359", tax_specification: "inter" }]);
  assert.equal(gstKnown("40"), true);
  assert.equal(gstKnown("12"), false);
  assert.equal(gstKnown("constructor"), false);
  const to12 = { ...was, gst: "12" };
  assert.equal(itemBody(to12, itemChanges(was, to12)).item_tax_preferences, undefined);
});

test("clearing a field is a change; the same number written differently isn't", () => {
  const had = { ...before, offerPrice: "200" };
  assert.deepEqual(itemBody({ ...had, offerPrice: "" }, itemChanges(had, { ...had, offerPrice: "" })).custom_fields, [{ customfield_id: "982417000021532093", value: "" }]);
  assert.deepEqual(itemChanges(had, { ...had, offerPrice: "200.00" }), {});
});

test("what a person can't save, in plain words", () => {
  const ok = cleanItemFields(before);
  assert.equal(itemProblem(ok), null);
  assert.match(itemProblem({ ...ok, name: "" })!, /name/);
  assert.match(itemProblem({ ...ok, rate: -1 })!, /price/);
  assert.match(itemProblem(cleanItemFields({ ...ok, rate: "abc" }))!, /price/);
  assert.match(itemProblem({ ...ok, identifier: "" })!, /Identifier/);
  assert.match(itemProblem({ ...ok, stock: "Maybe" })!, /Stock/);
  assert.match(itemProblem({ ...ok, offerPrice: "abc" })!, /offer price/);
  assert.match(itemProblem({ ...ok, hsn: "40 14" })!, /HSN/);
  assert.equal(cleanItemFields({ ...ok, name: `  ${"x".repeat(200)}` }).name.length, 100);
});

const post = async (who: { id: string; name: string }, editItem: object) => {
  const r = await POST(new Request("http://x/api/quotations", { method: "POST", headers: { "x-test-member": JSON.stringify(who), "content-type": "application/json" }, body: JSON.stringify({ editItem }) }));
  return { s: r.status, j: await r.json() };
};
const sumit = { id: "sumit", name: "Sumit A Shah" };
const fields = { name: "Bag", rate: 249, description: "", hsn: "", identifier: "Medical Safety", stock: "", offerPrice: "" };

beforeEach(() => { resetFakeDb(); process.env.VERCEL_ENV = "production"; });

const upload = async (who: { id: string; name: string }, id: string, file?: File) => {
  const form = new FormData();
  form.set("brochure", id);
  if (file) form.set("file", file);
  const r = await POST(new Request("http://x/api/quotations", { method: "POST", headers: { "x-test-member": JSON.stringify(who) }, body: form }));
  return { s: r.status, j: await r.json() };
};
const pdf = (bytes: Uint8Array | string) => new File([bytes as BlobPart], "brochure.pdf", { type: "application/pdf" });

test("add PDF: a real PDF up to 4 MB, for everyone; else on to Zoho (not connected here)", async () => {
  assert.match((await upload(sumit, "abc", pdf("%PDF-1.4"))).j.error, /Unknown item/);
  assert.match((await upload(sumit, "1")).j.error, /Pick a PDF/);
  assert.match((await upload(sumit, "1", pdf("not a pdf at all"))).j.error, /isn't a PDF/);
  assert.match((await upload(sumit, "1", pdf(new Uint8Array(4 * 1024 * 1024)))).j.error, /over 4 MB/i);
  const ok = await upload({ id: "pranjal", name: "Pranjal Nikalje" }, "1", pdf("%PDF-1.4 small"));
  assert.equal(ok.s, 502);
  assert.match(ok.j.error, /isn't connected/);
  assert.equal((await upload({ id: "priyanka", name: "Priyanka A" }, "1", pdf("%PDF-1.4"))).s, 502); // anyone may add a PDF (owner, 5 Nov); here it stops at the missing connection
});

test("an item's pictures: main first, back images last, PDFs left out", () => {
  const documents = [
    { document_id: "pdf", file_type: "pdf", attachment_order: 1 },
    { document_id: "back", file_type: "PNG", attachment_order: 2, is_back_image: true },
    { document_id: "b", file_type: "jpg", attachment_order: 4 },
    { document_id: "a", file_type: "jpeg", attachment_order: 3 },
    { document_id: "main", file_type: "png", attachment_order: 5 },
  ];
  assert.deepEqual(itemPictures({ documents, image_document_id: "main" }), ["main", "a", "b", "back"]);
  assert.deepEqual(itemPictures({ documents, image_document_id: "" }), ["a", "b", "main", "back"]);
  assert.deepEqual(itemPictures({}), []);
});

test("a picture is known by its first bytes, not its name", () => {
  assert.equal(isPicture(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(isPicture(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), true);
  assert.equal(isPicture(new TextEncoder().encode("GIF89a")), true);
  assert.equal(isPicture(new TextEncoder().encode("RIFF1234WEBP")), true);
  assert.equal(isPicture(new TextEncoder().encode("RIFF1234WAVE")), false);
  assert.equal(isPicture(new TextEncoder().encode("%PDF-1.4")), false);
});

const addPicture = async (who: { id: string; name: string }, id: string, file?: File) => {
  const form = new FormData();
  form.set("picture", id);
  if (file) form.set("file", file);
  const r = await POST(new Request("http://x/api/quotations", { method: "POST", headers: { "x-test-member": JSON.stringify(who) }, body: form }));
  return { s: r.status, j: await r.json() };
};

test("add picture: a real picture under 4 MB, for every member; else on to Zoho (not connected here)", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
  assert.match((await addPicture(sumit, "abc", new File([png], "a.png"))).j.error, /Unknown item/);
  assert.match((await addPicture(sumit, "1")).j.error, /Pick a picture/);
  assert.match((await addPicture(sumit, "1", new File(["%PDF-1.4"], "a.png"))).j.error, /isn't a JPG/);
  assert.match((await addPicture(sumit, "1", new File([new Uint8Array(4 * 1024 * 1024)], "a.png"))).j.error, /under 4 MB/);
  const ok = await addPicture({ id: "pranjal", name: "Pranjal Nikalje" }, "1", new File([png], "a.png"));
  assert.equal(ok.s, 502);
  assert.match(ok.j.error, /isn't connected/);
  assert.equal((await addPicture({ id: "priyanka", name: "Priyanka A" }, "1", new File([png], "a.png"))).s, 502); // every member (owner, 5 Nov); here it stops at the missing connection
});

test("who can edit: every member (owner, 5 Nov); here it stops at the missing connection", async () => {
  assert.equal((await post({ id: "pranjal", name: "Pranjal Nikalje" }, { id: "1", fields })).s, 502);
  assert.equal((await post({ id: "p", name: "Prashant Sawale" }, { id: "1", fields })).s, 502);
  assert.equal((await post(sumit, { id: "abc", fields })).s, 400);
  assert.match((await post(sumit, { id: "1", fields: { ...fields, name: "" } })).j.error, /name/);
  const ok = await post(sumit, { id: "1", fields });
  assert.equal(ok.s, 502); // on to Zoho: not connected here, so nothing is written
  assert.match(ok.j.error, /isn't connected/);
});

test("a brochure's file id, wherever Zoho puts it on an item", async () => {
  const { brochureIdOf } = await import("@/lib/zoho");
  assert.equal(brochureIdOf({ custom_field_hash: { cf_product_brochure: "Cabinet.pdf", cf_product_brochure_unformatted: "982417000023697006" } }), "982417000023697006");
  assert.equal(brochureIdOf({ custom_fields: [{ api_name: "cf_product_brochure", value: "982417000023697006" }] }), "982417000023697006");
  assert.equal(brochureIdOf({ cf_product_brochure_unformatted: "982417000023697006" }), "982417000023697006");
  assert.equal(brochureIdOf({ custom_field_hash: { cf_product_brochure: "Cabinet.pdf" } }), undefined);
  assert.equal(brochureIdOf({}), undefined);
});
