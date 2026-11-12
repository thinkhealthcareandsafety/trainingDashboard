// The Training Manager, steps 5–8: proposals, the attendee list, the QR join, participants' pages, the login email —
// on the fake database, nothing sent.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { duplicatePhones, fmtProposalDate, parseCsv, peopleFromRows, readPerson, readProposal, thId } from "@/lib/portalRules";
import { sheetRows, readXlsx } from "@/lib/xlsxRead";
import { loginBoxHtml, loginEmail, trainingLink } from "@/lib/portalEmail";
import { addPeople, join, joinInfo, newJoinKey, participantPage, propose, removePerson, staffPortal, trainingsFor } from "@/lib/portalTrainings";
import { issueLogin, signIn } from "@/lib/portalAuth";
import { POST as training } from "@/app/api/portal/training/route";
import { GET as joinGet, POST as joinPost } from "@/app/api/portal/join/route";
import { GET as tmGet, POST as tmPost } from "@/app/api/training-management/route";
import { db } from "@/lib/db";
import { resetFakeDb } from "./fakes/db";

beforeEach(() => resetFakeDb());
const RIYA = "riya@grand.com";

const seed = async () => {
  const d = await db();
  await d.collection<{ _id: string; items: object[] }>("kv").replaceOne({ _id: "zoho_items" }, { items: [{ id: "cpr", name: "CPR & AED Training (I)", identifier: "Training Services" }] }, { upsert: true });
  await d.collection<{ _id: string } & Record<string, unknown>>("zohoDocs").insertOne({
    _id: "estimates:1", kind: "estimates", training: true,
    doc: { estimate_id: "1", estimate_number: "QT-1", status: "sent", date: "2026-11-01", customer_name: "The Grand", customer_id: "77", total: 45000, line_items: [{ item_id: "cpr", name: "CPR & AED Training (I)", description: "Hands-on CPR", quantity: 30, rate: 1500, item_total: 45000 }] },
  });
  await d.collection<{ _id: string } & Record<string, unknown>>("portalTrainings").insertOne({ _id: "1", customerId: "77", coordinator: { name: "Riya Mehta", email: RIYA, phone: "9800000000" } });
};

/* ---------------- Pure rules ---------------- */

test("a proposal: dates today or later, a location, a headcount; days sorted; the same day twice refused", () => {
  const ok = readProposal({ dates: [{ date: "2026-12-05", time: "" }, { date: "2026-12-04", time: "10:00" }], tentative: true, location: " The Grand,  Ballroom 2 ", headcount: 28 }, "2026-11-12");
  assert.deepEqual(ok, { dates: [{ date: "2026-12-04", time: "10:00" }, { date: "2026-12-05", time: "" }], tentative: true, location: "The Grand, Ballroom 2", headcount: 28 });
  const err = (raw: object) => (readProposal(raw, "2026-11-12") as { error: string }).error;
  assert.match(err({ dates: [], location: "x y", headcount: 3 }), /Pick the training date/);
  assert.match(err({ dates: [{ date: "2026-11-01" }], location: "x y", headcount: 3 }), /past/);
  assert.match(err({ dates: [{ date: "2026-12-01" }, { date: "2026-12-01" }], location: "x y", headcount: 3 }), /twice/);
  assert.match(err({ dates: [{ date: "2026-12-01", time: "25:00" }], location: "x y", headcount: 3 }), /time/);
  assert.match(err({ dates: [{ date: "2026-12-01" }], location: "", headcount: 3 }), /location/);
  assert.match(err({ dates: [{ date: "2026-12-01" }], location: "x y", headcount: 0 }), /How many/);
  assert.equal(fmtProposalDate({ date: "2026-12-04", time: "14:30" }), "Fri, 4 Dec 2026, 2:30 pm");
});

test("people from a sheet: header and phoneless rows skipped with why; phones cleaned; duplicates found", () => {
  const { people, skipped } = peopleFromRows([["Name", "Number"], ["Aman Shah", "+91 98765 43210"], ["", ""], ["9876543211", "Neha K", "neha@x.com"], ["Ravi", "12345"], ["9876543210", "Aman again"]]);
  assert.deepEqual(people, [{ name: "Aman Shah", phone: "9876543210" }, { name: "Neha K", phone: "9876543211", email: "neha@x.com" }, { name: "Aman again", phone: "9876543210" }]);
  assert.deepEqual(skipped.map((s) => [s.row, s.why]), [[1, "no 10-digit mobile number"], [5, "no 10-digit mobile number"]]);
  assert.deepEqual([...duplicatePhones(people)], ["9876543210"]);
  assert.deepEqual(parseCsv('Name,Phone\r\n"Shah, Aman",9876543210\n"Say ""hi""";9\n'), [["Name", "Phone"], ["Shah, Aman", "9876543210"], ['Say "hi";9']]);
  assert.deepEqual(parseCsv("Name;Phone\nA;1\n"), [["Name", "Phone"], ["A", "1"]]);
  assert.equal(thId(7), "TH007");
  assert.equal(thId(1234), "TH1234");
  assert.match((readPerson({ name: "A", phone: "123" }) as { error: string }).error, /10-digit/);
  assert.match((readPerson({ name: "A", phone: "9876543210", email: "nope" }) as { error: string }).error, /email/);
});

/** A minimal .xlsx (a real zip, deflated) with a shared string table and one sheet. */
function xlsx(sheet: string, shared: string[]): ArrayBuffer {
  const files: [string, string][] = [
    ["xl/workbook.xml", '<workbook><sheets><sheet name="People" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ["xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ["xl/sharedStrings.xml", `<sst>${shared.map((s) => `<si><t>${s}</t></si>`).join("")}</sst>`],
    ["xl/worksheets/sheet1.xml", sheet],
  ];
  const locals: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const nameB = Buffer.from(name), data = deflateRawSync(Buffer.from(text));
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt16LE(nameB.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt16LE(nameB.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameB, data); central.push(ch, nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...locals, cd, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length) as ArrayBuffer;
}

test("Excel: shared strings, inline strings, long numbers, gaps between cells", async () => {
  const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
    + '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>9.87654321E9</v></c></row>'
    + '<row r="3"><c r="A3" t="inlineStr"><is><t>Neha &amp; Co</t></is></c><c r="B3"><v>9876543211</v></c></row></sheetData></worksheet>';
  assert.deepEqual(sheetRows(sheet, ["Name", "Phone", "Aman"]), [["Name", "Phone"], ["Aman", "", "9876543210"], ["Neha & Co", "9876543211"]]);
  const rows = await readXlsx(xlsx(sheet, ["Name", "Phone", "Aman"]));
  assert.deepEqual(peopleFromRows(rows).people.map((p) => p.phone), ["9876543210", "9876543211"]);
});

test("the login box: link, email, password (escaped), or 'the password you already have'", () => {
  const html = loginBoxHtml({ intro: "Hi <there>", link: trainingLink("https://work.thinkhealth.in/training", "QT-1"), email: RIYA, password: "abc&def" });
  assert.match(html, /work\.thinkhealth\.in\/training\/QT-1/);
  assert.match(html, /abc&amp;def/);
  assert.match(html, /Hi &lt;there&gt;/);
  assert.match(loginBoxHtml({ intro: "", link: "https://x/QT-1", email: RIYA, password: null }), /password you already have/);
  const m = loginEmail({ subject: "Login · {number}", body: "Hello {name},\n\nFor {training}.", box: "Box for {training}" }, { name: "Riya Mehta", training: "CPR", number: "QT-1" }, { link: "https://x/QT-1", email: RIYA, password: "p" });
  assert.equal(m.subject, "Login · QT-1");
  assert.match(m.html, /Hello Riya,/);
  assert.match(m.html, /Box for CPR/);
});

/* ---------------- The coordinator's side ---------------- */

test("propose: only on their own training; a change keeps the earlier one; the stamp says Proposed", async () => {
  await seed();
  const p = { dates: [{ date: "2099-01-10", time: "10:00" }], location: "Ballroom 2", headcount: 30 };
  assert.equal(((await propose("someone@else.com", "1", p)) as { status: number }).status, 404);
  assert.ok("proposal" in (await propose(RIYA, "1", p)));
  await propose(RIYA, "1", { ...p, headcount: 32 });
  const [t] = await trainingsFor(RIYA);
  assert.equal(t.stamp, "Proposed");
  assert.equal(t.proposal?.headcount, 32);
  assert.deepEqual(t.history.map((h) => h.headcount), [30]);
  assert.ok(t.joinKey.length >= 10);
  // Sending the same again changes nothing.
  await propose(RIYA, "1", { ...p, headcount: 32 });
  assert.equal((await trainingsFor(RIYA))[0].history.length, 1);
  assert.equal((await staffPortal(["1"])).get("1")?.status, "Date proposed");
});

test("the list: typed and imported people get TH numbers in order; duplicates marked; remove; others can't touch it", async () => {
  await seed();
  const r = await addPeople(RIYA, "1", [{ name: "Aman", phone: "9876543210" }, { name: "Neha", phone: "98765 43211" }], "typed");
  assert.ok("list" in r);
  const r2 = await addPeople(RIYA, "1", [{ name: "Aman twice", phone: "+919876543210" }], "excel");
  assert.ok("list" in r2);
  if ("list" in r2) {
    assert.deepEqual(r2.list.map((p) => [p.th, p.duplicate, p.source]), [["TH001", true, "typed"], ["TH002", false, "typed"], ["TH003", true, "excel"]]);
  }
  assert.match(((await addPeople(RIYA, "1", [{ name: "X", phone: "1" }], "typed")) as { error: string }).error, /10-digit/);
  assert.equal(((await removePerson("someone@else.com", "1", "TH001")) as { status: number }).status, 404);
  const after = await removePerson(RIYA, "1", "TH003");
  assert.ok("list" in after && after.list.every((p) => !p.duplicate));
  // Numbers are never reused.
  const r3 = await addPeople(RIYA, "1", [{ name: "Ravi", phone: "9876543212" }], "typed");
  assert.ok("list" in r3 && r3.list.at(-1)?.th === "TH004");
});

test("QR join: the right key lets people in; the same phone gets their page back; a new link shuts the old one", async () => {
  await seed();
  const [t] = await trainingsFor(RIYA);
  assert.deepEqual(await joinInfo("QT-1", t.joinKey), { training: "CPR & AED Training", customer: "The Grand", coordinator: "Riya Mehta" });
  assert.equal(await joinInfo("QT-1", "wrong-key-123"), null);
  const a = await join("QT-1", t.joinKey, { name: "Aman Shah", phone: "9876543210" });
  assert.ok("th" in a && !a.existed);
  const again = await join("QT-1", t.joinKey, { name: "Aman S", phone: "+91 98765 43210" });
  assert.ok("th" in again && again.existed && "th" in a && again.th === a.th);
  // Their own page: only with their token; it shows the latest proposal.
  if (!("th" in a)) return;
  assert.equal(await participantPage("QT-1", a.th, "not-it"), null);
  let page = await participantPage("QT-1", a.th, a.token);
  assert.equal(page?.name, "Aman Shah");
  assert.deepEqual(page?.dates, []);
  await propose(RIYA, "1", { dates: [{ date: "2099-02-01", time: "" }], tentative: true, location: "Hall A", headcount: 25 });
  page = await participantPage("QT-1", a.th, a.token);
  assert.equal(page?.location, "Hall A");
  assert.equal(page?.tentative, true);
  const k = await newJoinKey(RIYA, "1");
  assert.ok("joinKey" in k);
  assert.equal(await joinInfo("QT-1", t.joinKey), null);
  assert.equal(((await join("QT-1", t.joinKey, { name: "Late", phone: "9876543219" })) as { status: number }).status, 404);
});

test("routes: the coordinator's actions need their session; join and the participant page need no login", async () => {
  await seed();
  const post = (body: object, cookie = "") => training(new Request("http://x/api/portal/training", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) }));
  assert.equal((await post({ action: "people", id: "1" })).status, 401);
  const pw = await issueLogin(RIYA, "Riya Mehta");
  const s = await signIn(RIYA, pw);
  const cookie = `th_portal=${s.ok ? s.token : ""}`;
  assert.equal((await post({ action: "add", id: "1", people: [{ name: "Aman", phone: "9876543210" }] }, cookie)).status, 200);
  const list = (await (await post({ action: "people", id: "1" }, cookie)).json()) as { list: { th: string }[] };
  assert.deepEqual(list.list.map((p) => p.th), ["TH001"]);
  const [t] = await trainingsFor(RIYA);
  const info = await joinGet(new Request(`http://x/api/portal/join?n=QT-1&k=${t.joinKey}`));
  assert.equal(info.status, 200);
  const joined = (await (await joinPost(new Request("http://x/api/portal/join", { method: "POST", body: JSON.stringify({ n: "QT-1", k: t.joinKey, name: "Neha", phone: "9876543211" }) }))).json()) as { th: string; token: string };
  assert.equal(joined.th, "TH002");
  const page = (await (await joinGet(new Request(`http://x/api/portal/join?n=QT-1&th=${joined.th}&p=${joined.token}`))).json()) as { page: { name: string }; content: { social: unknown[] } };
  assert.equal(page.page.name, "Neha");
  assert.ok(page.content.social.length > 0);
  assert.equal((await joinGet(new Request(`http://x/api/portal/join?n=QT-1&th=TH001&p=guess`))).status, 404);
});

test("Trainings page: portal state and the list for staff; Send login only from the live site", async () => {
  await seed();
  const ashish = { "x-test-member": JSON.stringify({ id: "ashish", name: "Ashish" }), "content-type": "application/json" };
  await addPeople(RIYA, "1", [{ name: "Aman", phone: "9876543210" }], "typed");
  const j = (await (await tmGet(new Request("http://x/api/training-management", { headers: ashish }))).json()) as { quotes: { id: string; portal: { status: string; registered: number } }[] };
  assert.deepEqual([j.quotes[0].portal.status, j.quotes[0].portal.registered], ["Login not sent", 1]);
  const people = (await (await tmGet(new Request("http://x/api/training-management?people=1", { headers: ashish }))).json()) as { list: { name: string }[] };
  assert.deepEqual(people.list.map((p) => p.name), ["Aman"]);
  const send = await tmPost(new Request("http://x/api/training-management", { method: "POST", headers: ashish, body: JSON.stringify({ action: "sendlogin", id: "1" }) }));
  assert.equal(send.status, 409);
  const outsider = await tmPost(new Request("http://x/api/training-management", { method: "POST", headers: { ...ashish, "x-test-member": JSON.stringify({ id: "z", name: "Zed" }) }, body: JSON.stringify({ action: "sendlogin", id: "1" }) }));
  assert.equal(outsider.status, 403);
});
