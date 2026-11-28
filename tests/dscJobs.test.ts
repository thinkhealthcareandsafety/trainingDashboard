import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { resetFakeDb } from "./fakes/db";
import { failJob, jobStatus, nextJob, pairSigner, queueJob, signerByKey, signerState } from "@/lib/dscJobs";
import { canPairDscSigner } from "@/lib/roles";
import { GET as convGet, POST as convPost } from "@/app/api/invoice-converter/route";

// Signing with the DSC token from anyone's login (owner, 28 Nov): jobs queued here, the signer PC asks for them with its key.

beforeEach(() => resetFakeDb());

const PDF = new TextEncoder().encode("%PDF-1.7 test");
const spot = { page: 0, x: 46, y: 133, w: 200, h: 56 };
const queue = (invoiceId = "1000001", by = "Shikha") => queueJob({ invoiceId, number: "2026-01-552", title: "Invoice 2026-01-552 - PO.pdf", spot, bytes: PDF, by });

test("the signer PC: one key at a time, checked exactly; seen = on", async () => {
  assert.equal((await signerState()).paired, false);
  await assert.rejects(queue(), /isn.t set up yet/);
  const { key } = await pairSigner("Sumit Shah");
  assert.ok(key.length >= 40);
  assert.equal(await signerByKey("x".repeat(43)), false);
  assert.equal(await signerByKey(null), false);
  assert.equal(await signerByKey(key, "SUMIT SHAH"), true);
  assert.deepEqual({ ...(await signerState()), seenAt: null }, { paired: true, online: true, seenAt: null, certificate: "SUMIT SHAH" });
  const again = await pairSigner("Admin");
  assert.equal(await signerByKey(key), false, "the old key stops working");
  assert.equal(await signerByKey(again.key), true);
});

test("a job: queued once per invoice, picked up once, its status and failure told back", async () => {
  await pairSigner("Sumit Shah");
  const a = await queue();
  assert.equal((await queue()).job, a.job, "the same invoice already waiting is that job");
  assert.equal((await jobStatus(a.job))?.status, "waiting");
  const n = await nextJob();
  assert.equal(n?.id, a.job);
  assert.deepEqual(n?.spot, spot);
  assert.equal(n?.reason, "Invoice 2026-01-552");
  assert.equal(new TextDecoder().decode(n!.bytes), "%PDF-1.7 test");
  assert.equal((await jobStatus(a.job))?.status, "signing");
  assert.equal(await nextJob(), null, "not given out twice");
  await failJob(a.job, "The token isn't plugged in");
  const st = await jobStatus(a.job);
  assert.equal(st?.status, "failed");
  assert.equal(st?.error, "The token isn't plugged in");
  assert.equal((await (await db()).collection<any>("dscJobs").findOne({ _id: a.job }))?.pdf, undefined, "the PDF is dropped");
  assert.notEqual((await queue()).job, a.job, "a failed job can be asked again");
});

test("old jobs fail: waiting 30 minutes, or picked up and not back in 5", async () => {
  await pairSigner("Sumit Shah");
  const a = await queue("1000001"), b = await queue("1000002");
  const col = (await db()).collection<any>("dscJobs");
  await col.updateOne({ _id: a.job }, { $set: { at: new Date(Date.now() - 31 * 60_000).toISOString() } });
  await col.updateOne({ _id: b.job }, { $set: { status: "signing", claimedAt: new Date(Date.now() - 6 * 60_000).toISOString() } });
  assert.match((await jobStatus(a.job))?.error ?? "", /didn't pick it up/);
  assert.match((await jobStatus(b.job))?.error ?? "", /didn't finish/);
  assert.equal(await nextJob(), null);
});

test("who connects the signer PC: Sumit and Admin", () => {
  assert.ok(canPairDscSigner({ id: "admin", name: "Admin" }) && canPairDscSigner({ id: "m1", name: "Sumit Shah" }));
  assert.ok(!canPairDscSigner({ id: "m2", name: "Nikita Patil" }));
});

test("the route: the signer PC with its key (no login) gets the next PDF; a wrong key is refused", async () => {
  const signer = (key: string, init: RequestInit = {}, q = "?dscNext") => new Request(`http://x/api/invoice-converter${q}`, { ...init, headers: { "x-dsc-key": key, ...(init.headers ?? {}) } });
  assert.equal((await convGet(signer("y".repeat(43)))).status, 401);
  const member = (id: string, body: object) => new Request("http://x/api/invoice-converter", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-test-member": JSON.stringify({ id, name: id }) } });
  const paired = await (await convPost(member("admin", { action: "dscPair" }))).json();
  assert.ok(paired.key);
  assert.equal((await convGet(signer(paired.key))).status, 204);
  const { job } = await queue();
  const r = await convGet(signer(paired.key));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("x-job"), job);
  assert.equal(r.headers.get("x-sign-at"), "0,46,133,200,56");
  assert.equal(decodeURIComponent(r.headers.get("x-reason") ?? ""), "Invoice 2026-01-552");
  assert.equal(new TextDecoder().decode(await r.arrayBuffer()), "%PDF-1.7 test");
  const fail = await convPost(signer(paired.key, { method: "POST", body: JSON.stringify({ action: "dscFail", job, error: "No token" }), headers: { "content-type": "application/json" } }, ""));
  assert.equal(fail.status, 200);
  const st = await (await convGet(new Request(`http://x/api/invoice-converter?dscJob=${job}`, { headers: { "x-test-member": JSON.stringify({ id: "admin", name: "Admin" }) } }))).json();
  assert.equal(st.status, "failed");
  assert.equal(st.error, "No token");
});
