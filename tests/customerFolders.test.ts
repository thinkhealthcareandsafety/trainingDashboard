// Customer folders (owner, 23 Nov; Sprints I148): a WorkDrive folder in SALES for each customer added from now on.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { SALES_FOLDER, folderName, makeCustomerFolders, needFolders } from "@/lib/customerFolders";
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
