// Add PDF from WorkDrive. The parsing is checked against the sample in Zoho's docs; the fake database has no WorkDrive connection, so nothing here reaches Zoho.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { GET, POST, PUT } from "@/app/api/quotations/route";
import { parseListing, parseWdPath, pickerEntries, wdFileProblem } from "@/lib/workdrive";
import { resetFakeDb } from "./fakes/db";

const sumit = { id: "sumit", name: "Sumit A Shah" };
const FOLDER = "cjrrr1b298cf52cf44acebc713ab5b73bbd77", FILE = "abcde1b298cf52cf44acebc713ab5b73bbd77";
const headers = (m: object) => ({ "x-test-member": JSON.stringify(m), "content-type": "application/json" });
beforeEach(() => { resetFakeDb(); process.env.VERCEL_ENV = "production"; });

test("WorkDrive's answer: folder, PDF with its size, other files", () => {
  const got = parseListing({ data: [
    { id: FOLDER, attributes: { name: "April", is_folder: true, type: "folder", extn: "", storage_info: { size_in_bytes: 0 } } },
    { id: "a1", attributes: { name: "Brochure.PDF", is_folder: false, type: "file", extn: "PDF", storage_info: { size_in_bytes: 2048 } } },
    { id: "a2", attributes: { name: "photo.png", is_folder: false, type: "image", extn: "png", storage_info: { size_in_bytes: 10 } } },
    { id: "", attributes: { name: "no id" } },
  ] });
  assert.deepEqual(got[0], { id: FOLDER, name: "April", folder: true, pdf: false, size: null });
  assert.deepEqual(got[1], { id: "a1", name: "Brochure.PDF", folder: false, pdf: true, size: 2048 });
  assert.equal(got.length, 3);
});

test("the picker shows folders first, then PDFs, in order; other files don't show", () => {
  const e = (name: string, folder = false, pdf = !folder) => ({ id: name, name, folder, pdf, size: 1 });
  assert.deepEqual(pickerEntries([e("b.pdf"), e("Z", true), e("notes.docx", false, false), e("a 10.pdf"), e("a 9.pdf"), e("A", true)]).map((x) => x.name), ["A", "Z", "a 9.pdf", "a 10.pdf", "b.pdf"]);
});

test("a file is refused when it's gone, not a PDF, or 50 MB and over; 1 MB is fine (owner, 5 Nov)", () => {
  const pdf = { id: "a", name: "a.pdf", folder: false, pdf: true, size: 1024 };
  assert.equal(wdFileProblem(pdf), "");
  assert.match(wdFileProblem(undefined), /isn't in the shared folder/);
  assert.match(wdFileProblem({ ...pdf, folder: true }), /isn't in the shared folder/);
  assert.match(wdFileProblem({ ...pdf, pdf: false }), /isn't a PDF/);
  assert.equal(wdFileProblem({ ...pdf, size: 5 * 1024 * 1024 }), "");
  assert.match(wdFileProblem({ ...pdf, size: 50 * 1024 * 1024 }), /over 50 MB/);
});

test("folder paths: only ids, and not too deep", () => {
  assert.deepEqual(parseWdPath(""), []);
  assert.deepEqual(parseWdPath(`${FOLDER},${FILE}`), [FOLDER, FILE]);
  for (const bad of ["../secret", "a/b", `${FOLDER},x y`, Array(13).fill(FOLDER).join(",")]) assert.equal(parseWdPath(bad), null, bad);
});

test("not connected: the folder answers so, and only Admin is offered Connect", async () => {
  const ask = async (m: object) => (await GET(new Request("http://x/api/quotations?wd=1", { headers: headers(m) }))).json();
  const j = await ask(sumit);
  assert.equal(j.connected, false);
  assert.equal(j.admin, false);
  assert.match(j.link, /workdrive\.zoho\.in/);
  assert.equal((await ask({ id: "admin", name: "Admin" })).admin, true);
  assert.equal((await GET(new Request("http://x/api/quotations?wd=1&path=..%2Fx", { headers: headers(sumit) }))).status, 400);
});

test("picking: bad ids refused; no connection, no copy; only people who quote; only the live site", async () => {
  const pick = async (b: object, m: object = sumit) => { const r = await POST(new Request("http://x/api/quotations", { method: "POST", headers: headers(m), body: JSON.stringify({ wdPick: b }) })); return { s: r.status, j: await r.json() }; };
  const good = { itemId: "982417000007512064", path: "", fileId: FILE };
  assert.match((await pick({ ...good, itemId: "abc" })).j.error, /Unknown item/);
  assert.match((await pick({ ...good, fileId: "../x" })).j.error, /Unknown file/);
  assert.match((await pick({ ...good, path: "a/b" })).j.error, /Unknown file/);
  const off = await pick(good);
  assert.equal(off.s, 502);
  assert.match(off.j.error, /WorkDrive isn't connected/);
  assert.equal((await pick(good, { id: "p", name: "Prashant Sawale" })).s, 403);
  process.env.VERCEL_ENV = "preview";
  assert.equal((await pick(good)).s, 409);
});

test("only Admin connects WorkDrive", async () => {
  const r = await PUT(new Request("http://x/api/quotations", { method: "PUT", headers: headers(sumit), body: JSON.stringify({ workdrive: true, code: "1000.x" }) }));
  assert.equal(r.status, 403);
});
