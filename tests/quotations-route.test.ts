// /api/quotations "New customer" checks (#151): Zoho refuses a customer without Type and Sector, and its CRM sync needs a
// last name. Only refusals and the not-connected answer are reached — the fake database has no Zoho connection, so
// nothing here can call Zoho.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "@/app/api/quotations/route";
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
