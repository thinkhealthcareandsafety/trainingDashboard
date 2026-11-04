// Editing an item (src/lib/itemEdit.ts + /api/quotations): what's checked, what changed, what Zoho is sent. Nothing here reaches Zoho.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { cleanItemFields, itemBody, itemChanges, itemFieldsOf, itemProblem } from "@/lib/itemEdit";
import { POST } from "@/app/api/quotations/route";
import { resetFakeDb } from "./fakes/db";

const zoho = { name: "Hot Water Bag", rate: 249, description: "", hsn_or_sac: "40149020", custom_field_hash: { cf_item_identifier: "Medical Safety" } };
const before = itemFieldsOf(zoho);

test("reads Zoho's answer; fields it leaves out are empty", () => {
  assert.deepEqual(before, { name: "Hot Water Bag", rate: 249, description: "", hsn: "40149020", identifier: "Medical Safety", stock: "", offerPrice: "" });
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

test("add PDF: a real PDF under 1 MB, for everyone who can use the page; else on to Zoho (not connected here)", async () => {
  assert.match((await upload(sumit, "abc", pdf("%PDF-1.4"))).j.error, /Unknown item/);
  assert.match((await upload(sumit, "1")).j.error, /Pick a PDF/);
  assert.match((await upload(sumit, "1", pdf("not a pdf at all"))).j.error, /isn't a PDF/);
  assert.match((await upload(sumit, "1", pdf(new Uint8Array(1024 * 1024)))).j.error, /under 1 MB/);
  const ok = await upload({ id: "pranjal", name: "Pranjal Nikalje" }, "1", pdf("%PDF-1.4 small"));
  assert.equal(ok.s, 502);
  assert.match(ok.j.error, /isn't connected/);
  assert.equal((await upload({ id: "priyanka", name: "Priyanka A" }, "1", pdf("%PDF-1.4"))).s, 403); // can't use the page
});

test("who can edit: full access, not someone who can only quote", async () => {
  assert.equal((await post({ id: "pranjal", name: "Pranjal Nikalje" }, { id: "1", fields })).s, 403);
  assert.equal((await post(sumit, { id: "abc", fields })).s, 400);
  assert.match((await post(sumit, { id: "1", fields: { ...fields, name: "" } })).j.error, /name/);
  const ok = await post(sumit, { id: "1", fields });
  assert.equal(ok.s, 502); // on to Zoho: not connected here, so nothing is written
  assert.match(ok.j.error, /isn't connected/);
});
