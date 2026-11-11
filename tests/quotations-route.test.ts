// /api/quotations "New customer" checks (#151): Zoho refuses a customer without Type and Sector, and its CRM sync needs a
// last name. Only refusals and the not-connected answer are reached — the fake database has no Zoho connection, so
// nothing here can call Zoho.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "@/app/api/quotations/route";
import { db } from "@/lib/db";
import { resetFakeDb } from "./fakes/db";

const sumit = { id: "sumit", name: "Sumit A Shah" };
const create = async (n: object) => {
  const req = new Request("http://x/api/quotations", { method: "POST", headers: { "x-test-member": JSON.stringify(sumit), "content-type": "application/json" }, body: JSON.stringify({ newCustomer: n }) });
  const r = await POST(req);
  return { s: r.status, j: await r.json() };
};
const good = { company: "Test Co", firstName: "Asha", lastName: "Rao", email: "asha@example.com", state: "MH", sector: "IT" };

beforeEach(() => { resetFakeDb(); process.env.VERCEL_ENV = "production"; });

test("a new customer needs a last name and a sector", async () => {
  const noLast = await create({ ...good, lastName: "" });
  assert.equal(noLast.s, 400);
  assert.match(noLast.j.error, /last name/);
  const noSector = await create({ ...good, sector: "" });
  assert.equal(noSector.s, 400);
  assert.match(noSector.j.error, /sector/);
  assert.equal((await create({ ...good, sector: "Hotels" })).s, 400); // not one of Zoho's options
});

test("with everything Zoho needs it goes on to Zoho (here: not connected, so nothing is sent)", async () => {
  const r = await create(good); // Type left out → New Customer
  assert.equal(r.s, 502);
  assert.match(r.j.error, /isn't connected/);
});

test("an individual needs no company; a bad GSTIN state or PIN is refused", async () => {
  assert.equal((await create({ ...good, kind: "individual", company: "" })).s, 502); // passed the checks
  assert.equal((await create({ ...good, company: "" })).s, 400); // a business does
  assert.match((await create({ ...good, gstin: "99ABCDE1234F1Z5" })).j.error, /state code/);
  assert.match((await create({ ...good, zip: "4000" })).j.error, /PIN/);
});

const email = async (fields: Record<string, string>, files: File[] = []) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  for (const f of files) form.append("attachments", f);
  const r = await POST(new Request("http://x/api/quotations", { method: "POST", headers: { "x-test-member": JSON.stringify(sumit) }, body: form }));
  return { s: r.status, j: await r.json() };
};
const mail = { estimateId: "9001", to: "asha@example.com", subject: "Quote QT-1" };

test("the quote email: To, a subject and 4 MB of attachments at most; else on to Zoho (not connected here)", async () => {
  assert.match((await email({ ...mail, to: "" })).j.error, /To/);
  assert.match((await email({ ...mail, to: "asha@" })).j.error, /doesn't look like an email/);
  assert.match((await email({ ...mail, subject: "" })).j.error, /subject/);
  assert.match((await email(mail, [new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.pdf")])).j.error, /4 MB/);
  const ok = await email({ ...mail, cc: "boss@example.com" }, [new File(["x"], "brochure.pdf")]);
  assert.equal(ok.s, 502);
  assert.match(ok.j.error, /isn't connected/);
});

test("the item list says Added, Missing or not read yet (a copy from before the field); inactive items stay out", async () => {
  await (await db()).collection<{ _id: string; items: object[] }>("kv").replaceOne({ _id: "zoho_items" }, { items: [
    { id: "1", name: "With", brochure: "AED.pdf" }, { id: "2", name: "Without", brochure: "" }, { id: "3", name: "Old copy" }, { id: "4", name: "Gone", active: false, brochure: "x.pdf" },
  ] }, { upsert: true });
  const r = await GET(new Request("http://x/api/quotations?items=1", { headers: { "x-test-member": JSON.stringify(sumit) } }));
  const { items } = (await r.json()) as { items: { id: string; brochure: string | null }[] };
  assert.deepEqual(items.map((i) => [i.id, i.brochure]), [["1", "AED.pdf"], ["2", ""], ["3", null]]);
});

test("add email: a customer, a real email and both names; else on to Zoho (not connected here, so nothing is written)", async () => {
  const add = async (a: object) => {
    const r = await POST(new Request("http://x/api/quotations", { method: "POST", headers: { "x-test-member": JSON.stringify(sumit), "content-type": "application/json" }, body: JSON.stringify({ addEmail: a }) }));
    return { s: r.status, j: await r.json() };
  };
  const good = { customerId: "9001", email: "New.Person@Example.com", firstName: "New", lastName: "Person" };
  assert.match((await add({ ...good, customerId: "abc" })).j.error, /customer/);
  assert.match((await add({ ...good, email: "new@" })).j.error, /doesn't look right/);
  assert.match((await add({ ...good, firstName: " " })).j.error, /first and last name/);
  assert.match((await add({ ...good, lastName: "" })).j.error, /first and last name/);
  const ok = await add(good);
  assert.equal(ok.s, 502);
  assert.match(ok.j.error, /isn't connected/);
  process.env.VERCEL_ENV = "preview";
  assert.equal((await add(good)).s, 409); // only the live site writes to Zoho
});

test("the Items page's Everything also gets inactive items; quotations never do", async () => {
  await (await db()).collection<{ _id: string; items: object[] }>("kv").replaceOne({ _id: "zoho_items" }, { items: [{ id: "1", name: "On" }, { id: "2", name: "Off", active: false }] }, { upsert: true });
  const ask = async (q: string) => ((await (await GET(new Request(`http://x/api/quotations?${q}`, { headers: { "x-test-member": JSON.stringify(sumit) } }))).json()) as { items: { id: string; active: boolean }[] }).items.map((i) => [i.id, i.active]);
  assert.deepEqual(await ask("items=1"), [["1", true]]);
  assert.deepEqual(await ask("items=1&all=1"), [["1", true], ["2", false]]);
});

test("the two fixed Cc addresses count towards the 20-address limit", async () => {
  const list = (n: number) => Array.from({ length: n }, (_, i) => `p${i}@example.com`).join(",");
  assert.match((await email({ ...mail, to: list(19) })).j.error, /At most 20/); // 19 + 2
  assert.match((await email({ ...mail, to: list(18) })).j.error, /isn't connected/); // 18 + 2
  assert.match((await email({ ...mail, to: `${list(18)},sales@thinkhealth.in,sshah@thinkhealth.in` })).j.error, /isn't connected/); // they're in To: not twice
});

const tsMail = { tsEstimateId: "9001", to: "asha@example.com", subject: "Quotation-2026-11-05-001", markups: "5" };
const tsGet = async (q: string) => {
  const r = await GET(new Request(`http://x/api/quotations?${q}`, { headers: { "x-test-member": JSON.stringify(sumit) } }));
  return { s: r.status, j: await r.json() };
};

test("Total Supply: the same checks; nothing goes without the Gmail password; nothing can leave a local server", async () => {
  const had = process.env.TS_GMAIL_APP_PASSWORD;
  delete process.env.TS_GMAIL_APP_PASSWORD;
  try {
    assert.match((await email({ ...tsMail, to: "" })).j.error, /To/);
    assert.match((await email({ ...tsMail, subject: "" })).j.error, /subject/);
    assert.match((await email({ ...tsMail, tsEstimateId: "abc" })).j.error, /Unknown quotation/);
    assert.match((await email(tsMail, [new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.pdf")])).j.error, /4 MB/);
    const off = await email(tsMail);
    assert.equal(off.s, 409);
    assert.match(off.j.error, /Gmail isn't connected/);
    process.env.TS_GMAIL_APP_PASSWORD = "not-a-real-one";
    const noZoho = await email(tsMail); // gets as far as reading the quote; the fake database has no Zoho connection, so no email
    assert.equal(noZoho.s, 502);
    process.env.VERCEL_ENV = "preview";
    assert.equal((await email(tsMail)).s, 409);
  } finally {
    if (had === undefined) delete process.env.TS_GMAIL_APP_PASSWORD; else process.env.TS_GMAIL_APP_PASSWORD = had;
  }
});

test("Add email: the team's own address is refused, so it never lands on a customer (owner, 9 Nov)", async () => {
  const r = await POST(new Request("http://x/api/quotations", { method: "POST", headers: { "x-test-member": JSON.stringify(sumit), "content-type": "application/json" }, body: JSON.stringify({ addEmail: { customerId: "1", firstName: "Shikha", lastName: "Dixit", email: "Shikha.Dixit@ThinkHealth.in" } }) }));
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /Cc/);
});

test("brochures on the quote email: at most 10 attachments together; checked against the quote in Zoho (not connected here)", async () => {
  const send = async (ids: string[]) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(mail)) fd.set(k, v);
    for (const id of ids) fd.append("brochureDocs", id);
    const r = await POST(new Request("http://x/api/quotations", { method: "POST", headers: { "x-test-member": JSON.stringify(sumit) }, body: fd }));
    return { s: r.status, j: await r.json() };
  };
  assert.match((await send(Array.from({ length: 11 }, (_, i) => String(1000 + i)))).j.error, /At most 10/);
  assert.equal((await send(["982417000023697006"])).s, 502); // reads the quote's items from Zoho first: not connected, so nothing is sent
});

test("Total Supply: a bad quote id is refused before anything is read", async () => {
  assert.equal((await tsGet("ts=abc")).s, 400);
  assert.equal((await tsGet("tsPdf=abc")).s, 400);
});

test("training coordinator on the quote email: checked first; a good one goes on to Zoho (not connected here, nothing written or sent)", async () => {
  const co = { coName: "Riya Mehta", coEmail: "riya@example.com", coPhone: "9876543210", customerId: "77" };
  assert.match((await email({ ...mail, ...co, coName: "Riya" })).j.error, /first and last/);
  assert.match((await email({ ...mail, ...co, coPhone: "12" })).j.error, /10-digit/);
  assert.match((await email({ ...mail, ...co, customerId: "" })).j.error, /customer/);
  const ok = await email({ ...mail, ...co, to: "" }); // the coordinator alone is enough
  assert.equal(ok.s, 502);
  assert.match(ok.j.error, /isn't connected/);
  assert.equal(await (await db()).collection("portalTrainings").countDocuments({}), 0);
});
