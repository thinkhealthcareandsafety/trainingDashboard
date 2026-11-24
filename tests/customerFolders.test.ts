// Customer folders (owner, 23 Nov; Sprints I148): a WorkDrive folder in SALES for each customer added from now on.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { PURCHASE_FOLDER, SALES_FOLDER, entryFolder, folderName, makeCustomerFolders, makeVendorFolders, needFolders } from "@/lib/customerFolders";
import { db } from "@/lib/db";
import { resetFakeDb } from "./fakes/db";

beforeEach(() => resetFakeDb());

test("a customer's name becomes a folder name WorkDrive accepts", () => {
  assert.equal(folderName("Tata Projects Ltd."), "Tata Projects Ltd");
  assert.equal(folderName("  A/B: Safety *Pvt*  "), "A B Safety Pvt");
  assert.equal(folderName("???"), "");
});

test("only customers created after the start, not done yet, oldest first", () => {
  const since = "2026-11-23T10:00:00.000Z";
  const got = needFolders([
    { _id: "old", name: "Old Co", createdAt: "2026-11-01T00:00:00.000Z" },
    { _id: "b", name: "Beta", createdAt: "2026-11-24T09:00:00.000Z" },
    { _id: "a", name: "Alpha", createdAt: "2026-11-23T11:00:00.000Z" },
    { _id: "done", name: "Done Co", createdAt: "2026-11-23T12:00:00.000Z" },
  ], since, new Set(["done"]));
  assert.deepEqual(got, [{ id: "a", folder: "Alpha" }, { id: "b", folder: "Beta" }]);
});

test("first run only marks the start; then new customers get a folder, one already there is kept, nothing twice", async () => {
  const d = await db();
  assert.deepEqual(await makeCustomerFolders(new Date("2026-11-23T10:00:00.000Z")), []);
  for (const c of [
    { _id: "old", name: "Old Co", createdAt: "2026-11-01T00:00:00.000Z" },
    { _id: "n1", name: "New Co", createdAt: "2026-11-23T11:00:00.000Z" },
    { _id: "n2", name: "Kept Co", createdAt: "2026-11-23T12:00:00.000Z" },
  ]) await d.collection<any>("zohoCustomers").insertOne(c);
  // Read-only WorkDrive (before reconnecting): waits quietly.
  await d.collection<any>("kv").insertOne({ _id: "zoho_workdrive", clientId: "c", clientSecret: "s", refreshToken: "r", token: { value: "t", expiresAt: Date.now() + 3600_000 }, connectedAt: "", connectedBy: "Admin", scopes: "WorkDrive.files.READ" });
  assert.deepEqual(await makeCustomerFolders(), []);
  await d.collection<any>("kv").updateOne({ _id: "zoho_workdrive" }, { $set: { scopes: "WorkDrive.files.READ,WorkDrive.files.CREATE" } });
  const made: unknown[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") { made.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ data: { id: "newid" } }), { status: 201 }); }
    assert.ok(String(u).includes(`/files/${SALES_FOLDER}/files`));
    return new Response(JSON.stringify({ data: [{ id: "k1", attributes: { name: "kept co", is_folder: true } }, { id: "s1", attributes: { name: "CLIENT NAME", is_folder: true } }] }));
  }) as typeof fetch;
  try {
    assert.deepEqual(await makeCustomerFolders(), ["New Co", "Kept Co"]);
    assert.deepEqual(made, [{ data: { attributes: { name: "New Co", parent_id: SALES_FOLDER }, type: "files" } }]);
    assert.equal((await d.collection<any>("customerFolders").findOne({ _id: "n2" }))?.how, "kept");
    assert.deepEqual(await makeCustomerFolders(), []);
    assert.equal(made.length, 1);
  } finally { globalThis.fetch = real; }
});

test("vendors: first run only marks the start; a new one gets a folder in PURCHASE; Books is asked once an hour", async () => {
  const d = await db();
  const at = (s: string) => new Date(`2026-11-24T${s}:00.000Z`);
  let asked = 0;
  let list = [{ _id: "old", name: "Old Vendor", createdAt: "2026-11-01T00:00:00.000Z" }, { _id: "v1", name: "New Vendor", createdAt: "2026-11-24T10:30:00.000Z" }];
  const newest = async () => { asked++; return list; };
  await d.collection<any>("kv").insertOne({ _id: "zoho_workdrive", clientId: "c", clientSecret: "s", refreshToken: "r", token: { value: "t", expiresAt: Date.now() + 3600_000 }, connectedAt: "", connectedBy: "Admin", scopes: "WorkDrive.files.READ,WorkDrive.files.CREATE" });
  assert.deepEqual(await makeVendorFolders(newest, at("10:00")), []);
  assert.equal(asked, 0);
  const made: unknown[] = [];
  let fail = true;
  const real = globalThis.fetch;
  globalThis.fetch = (async (_u: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method !== "POST") return new Response(null, { status: 204 });
    if (fail) return new Response(JSON.stringify({ errors: [{ title: "busy" }] }), { status: 500 });
    made.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ data: { id: "f" } }), { status: 201 });
  }) as typeof fetch;
  try {
    await assert.rejects(makeVendorFolders(newest, at("11:00")), /busy/);
    fail = false;
    assert.deepEqual(await makeVendorFolders(newest, at("11:05")), ["New Vendor"]); // tried again at the next sync
    assert.deepEqual(made, [{ data: { attributes: { name: "New Vendor", parent_id: PURCHASE_FOLDER }, type: "files" } }]);
    list = [...list, { _id: "v2", name: "Later Vendor", createdAt: "2026-11-24T11:06:00.000Z" }];
    assert.deepEqual(await makeVendorFolders(newest, at("11:30")), []);
    assert.equal(asked, 2);
    assert.deepEqual(await makeVendorFolders(newest, at("12:10")), ["Later Vendor"]);
  } finally { globalThis.fetch = real; }
});

test("the folder of one entry: city and GSTIN; pincode, then a number, only when taken", () => {
  const e = { city: "Mumbai", zip: "400051", gst: "27AAACL2089B1ZS" };
  assert.equal(entryFolder(e, []), "Mumbai - 27AAACL2089B1ZS");
  assert.equal(entryFolder(e, ["mumbai - 27AAACL2089B1ZS"]), "Mumbai 400051 - 27AAACL2089B1ZS");
  assert.equal(entryFolder(e, ["Mumbai - 27AAACL2089B1ZS", "Mumbai 400051 - 27AAACL2089B1ZS"]), "Mumbai 400051 - 27AAACL2089B1ZS (2)");
  assert.equal(entryFolder({ city: "Pune" }, []), "Pune");
  assert.equal(entryFolder({}, ["Entry"]), "Entry (2)");
});

test("same name: one folder, a folder inside for each entry; a failure is tried again without doubling", async () => {
  const d = await db();
  await makeCustomerFolders(new Date("2026-11-23T10:00:00.000Z"));
  await d.collection<any>("kv").insertOne({ _id: "zoho_workdrive", clientId: "c", clientSecret: "s", refreshToken: "r", token: { value: "t", expiresAt: Date.now() + 3600_000 }, connectedAt: "", connectedBy: "Admin", scopes: "WorkDrive.files.READ,WorkDrive.files.CREATE" });
  await d.collection<any>("customerFolders").insertOne({ _id: "c1", name: "Tata", folder: "Tata", folderId: "tata", how: "made", at: new Date() });
  await d.collection<any>("zohoCustomers").insertOne({ _id: "c2", name: "TATA", createdAt: "2026-11-24T11:00:00.000Z" });
  const kids: Record<string, { id: string; attributes: object }[]> = { [SALES_FOLDER]: [{ id: "tata", attributes: { name: "Tata", is_folder: true } }], tata: [] };
  const entries: Record<string, object> = { c1: { city: "Mumbai", gst: "27X" }, c2: { city: "New Delhi", gst: "07X" } };
  let down = true;
  const entry = async (id: string) => { if (id === "c2" && down) throw new Error("Zoho down"); return entries[id]; };
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      const a = JSON.parse(String(init.body)).data.attributes;
      const id = `s${kids.tata.length}`;
      kids[a.parent_id].push({ id, attributes: { name: a.name, is_folder: true } });
      return new Response(JSON.stringify({ data: { id } }), { status: 201 });
    }
    return new Response(JSON.stringify({ data: kids[String(u).match(/files\/(\w+)\/files/)![1]] }));
  }) as typeof fetch;
  try {
    await assert.rejects(makeCustomerFolders(new Date(), entry), /Zoho down/);
    down = false;
    assert.deepEqual(await makeCustomerFolders(new Date(), entry), ["TATA"]);
    assert.deepEqual(kids.tata.map((k) => (k.attributes as { name: string }).name), ["Mumbai - 27X", "New Delhi - 07X"]);
    assert.equal(kids[SALES_FOLDER].length, 1);
    assert.equal((await d.collection<any>("customerFolders").findOne({ _id: "c2" }))?.sub, "New Delhi - 07X");
    assert.equal((await d.collection<any>("customerFolders").findOne({ _id: "c1" }))?.subId, "s0");
  } finally { globalThis.fetch = real; }
});
