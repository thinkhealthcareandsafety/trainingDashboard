// Editable templates (owner, 10 Nov): the little language, and the built-in wording gives exactly the emails it gave before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderTemplate, templateProblems } from "@/lib/templateText";
import { TEMPLATES, TEMPLATE_VARS, TOPICS, TOPIC_EXTRAS, TOPIC_VARS, buildQuoteEmail, type TopicId } from "@/lib/quoteEmails";
import { TS_TEMPLATES, buildTsEmail } from "@/lib/totalSupply";
import { SAMPLES } from "./fixtures/quoteSamples";

test("[…] drops with an empty value inside; {one|many}; unknown names stay as typed; plain brackets are text", () => {
  assert.equal(renderTemplate("Total {total}[, valid until {valid}].", { total: "₹5", valid: "" }), "Total ₹5.");
  assert.equal(renderTemplate("Total {total}[, valid until {valid}].", { total: "₹5", valid: "1 Dec" }), "Total ₹5, valid until 1 Dec.");
  assert.equal(renderTemplate("{It is|They are} [ready]", {}, false), "It is [ready]");
  assert.equal(renderTemplate("{It is|They are} ok", {}, true), "They are ok");
  assert.equal(renderTemplate("Hi {who}", {}), "Hi {who}");
});

test("saving refuses unknown placeholders, choices outside item paragraphs, and empty text", () => {
  assert.deepEqual(templateProblems("{hi} {total}", TEMPLATE_VARS), []);
  assert.match(templateProblems("{hi} {totl}", TEMPLATE_VARS).join(), /Unknown: \{totl\}/);
  assert.match(templateProblems("{is|are}", TEMPLATE_VARS).join(), /only works in item paragraphs/);
  assert.deepEqual(templateProblems("The {items} {is|are} here", TOPIC_VARS, { choices: true }), []);
  assert.match(templateProblems("  ", TEMPLATE_VARS).join(), /empty/);
  assert.deepEqual(templateProblems("", TEMPLATE_VARS, { required: false }), []);
  for (const t of [...TEMPLATES, ...TS_TEMPLATES]) assert.deepEqual([...templateProblems(t.subject, TEMPLATE_VARS), ...templateProblems(t.body, TEMPLATE_VARS)], [], t.id);
  for (const t of [...TOPICS, ...TOPIC_EXTRAS]) assert.deepEqual(templateProblems(t.text, TOPIC_VARS, { choices: true }), [], t.id);
});

test("the built-in wording gives exactly the emails it gave before (main, Total Supply, paragraphs off)", () => {
  const before = JSON.parse(readFileSync("tests/fixtures/quote-emails.json", "utf8")) as Record<string, unknown>;
  SAMPLES.forEach((q, i) => {
    for (const t of TEMPLATES) {
      assert.deepEqual(buildQuoteEmail(t.id, q), before[`main:${i}:${t.id}`], `main:${i}:${t.id}`);
      assert.deepEqual(buildTsEmail(t.id, q), before[`ts:${i}:${t.id}`], `ts:${i}:${t.id}`);
      assert.deepEqual(buildQuoteEmail(t.id, q, ["aed", "training"] as TopicId[]), before[`skip:${i}:${t.id}`], `skip:${i}:${t.id}`);
    }
  });
});

test("each item paragraph reads as before: one or several items, with or without training, alone or not", () => {
  const before = JSON.parse(readFileSync("tests/fixtures/topic-texts.json", "utf8")) as Record<string, string>;
  const text = (id: string) => (TOPICS.find((t) => t.id === id) ?? TOPIC_EXTRAS.find((t) => t.id === id))!.text;
  for (const [key, want] of Object.entries(before)) {
    const [id, many, train, more] = key.split(":");
    const alone = id === "general" && train === "false" && more === "false";
    let got = renderTemplate(text(alone ? "generalOnly" : id), { items: many === "true" ? "Item A and Item B" : "Item A" }, many === "true");
    if (id === "aed" && train === "false") got += `\n\n${text("aedTraining")}`;
    assert.equal(got, want, key);
  }
});

test("saved wording wins: the template's own key, item paragraphs on both companies, the rest built-in", () => {
  const q = SAMPLES[0];
  const o = { "quote:new": { subject: "For {company}", body: "{hi}\n\nShort.[ Until {valid}.]\n\n{topics}\n\n{sign}" }, "topic:aedPads": { body: "Pads: {items}." } };
  const e = buildQuoteEmail("new", q, [], undefined, o);
  assert.equal(e.subject, "For Acme Hotels Pvt Ltd");
  assert.match(e.text, /^Hi Rahul,\n\nShort\. Until 10 December 2026\.\n\n/);
  assert.match(e.text, /Pads: Zoll CPR-D Padz\./);
  assert.equal(buildQuoteEmail("call", q, [], undefined, o).subject, buildQuoteEmail("call", q).subject);
  const ts = buildTsEmail("new", q, [], o);
  assert.match(ts.text, /Pads: Zoll CPR-D Padz\./);
  assert.equal(ts.subject, buildTsEmail("new", q).subject); // "quote:new" isn't Total Supply's
  assert.equal(buildTsEmail("new", q, [], { "ts:new": { subject: "TS {number}", body: "x" } }).subject, "TS Quotation-24-002753");
});

// The route, on the in-memory database.
const call = async (method: "GET" | "PUT", who: { id: string; name: string } | null, body?: unknown, q = "") => {
  const { GET, PUT } = await import("@/app/api/templates/route");
  const headers: Record<string, string> = { "content-type": "application/json", ...(who ? { "x-test-member": JSON.stringify(who) } : {}) };
  const r = await (method === "GET" ? GET : PUT)(new Request(`http://x/api/templates${q}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }));
  return { status: r.status, json: (await r.json()) as Record<string, unknown> };
};
const admin = { id: "admin", name: "Admin" }, ashish = { id: "ashish", name: "Ashish" }, priyanka = { id: "priyanka", name: "Priyanka" };
type Entry = { key: string; subject: string | null; body: string; edited: boolean; editedBy?: string; canEdit: boolean };

test("route: who may read and change what", async () => {
  const { resetFakeDb } = await import("./fakes/db");
  resetFakeDb();
  assert.equal((await call("GET", null)).status, 401);
  assert.equal((await call("GET", priyanka)).status, 403);
  const list = (await call("GET", ashish)).json.templates as Entry[];
  assert.equal(list.length, 7 + 19 + 7 + 7 + 3 + 1 + 2 + 1 + 1); // + the Training Manager login's two, the Performa email, the certificate email
  assert.equal(list.find((t) => t.key === "quote:new")!.canEdit, true);
  assert.equal(list.find((t) => t.key === "aed_onboarding:0")!.canEdit, false);
  assert.equal((await call("PUT", ashish, { key: "aed_onboarding:1", body: "x {invoice}" })).status, 403);
  assert.equal((await call("PUT", ashish, { key: "nope", body: "x" })).status, 404);
  assert.match(String((await call("PUT", ashish, { key: "quote:new", subject: "{ref}", body: "{totl}" })).json.error), /Unknown: \{totl\}/);
});

test("route: save, read back in the email step's overrides, logged; reset deletes it; the built-in text is a reset", async () => {
  const { resetFakeDb } = await import("./fakes/db");
  const { db } = await import("@/lib/db");
  resetFakeDb();
  assert.equal((await call("PUT", ashish, { key: "quote:new", subject: "New: {ref}", body: "{hi}\r\n\r\nHello there.\n\n{sign}" })).status, 200);
  assert.equal((await call("PUT", ashish, { key: "topic:aedPads", body: "Pads: {items}." })).status, 200);
  const o = (await call("GET", ashish, undefined, "?overrides=1")).json.overrides as Record<string, { subject?: string; body: string }>;
  assert.deepEqual(o, { "quote:new": { subject: "New: {ref}", body: "{hi}\n\nHello there.\n\n{sign}" }, "topic:aedPads": { body: "Pads: {items}." } });
  const row = ((await call("GET", ashish)).json.templates as Entry[]).find((t) => t.key === "quote:new")!;
  assert.deepEqual([row.edited, row.editedBy, row.subject], [true, "Ashish", "New: {ref}"]);
  assert.equal((await call("PUT", ashish, { key: "quote:new", reset: true })).status, 200);
  assert.equal((await call("PUT", ashish, { key: "topic:aedPads", body: TOPICS.find((t) => t.id === "aedPads")!.text })).status, 200);
  assert.deepEqual((await call("GET", ashish, undefined, "?overrides=1")).json.overrides, {});
  const log = await (await db()).collection("mailTemplateEdits").find({}).toArray();
  assert.deepEqual(log.map((e) => [e.key, e.by, e.after === null]), [["quote:new", "Ashish", false], ["topic:aedPads", "Ashish", false], ["quote:new", "Ashish", true], ["topic:aedPads", "Ashish", true]]);
});

test("route: Admin edits a flow step in its own document; the thank-you subject must keep its filter words", async () => {
  const { resetFakeDb } = await import("./fakes/db");
  const { getTemplate } = await import("@/lib/mailTemplates");
  resetFakeDb();
  assert.equal((await call("PUT", admin, { key: "aed_onboarding:1", body: "Reminder for {invoice}." })).status, 200);
  const t = await getTemplate("aed_onboarding");
  assert.equal(t.steps[1].body, "Reminder for {invoice}.");
  assert.equal(t.steps.length, 3);
  assert.match(t.steps[0].body, /Invoice # \{invoice\}/); // the others untouched
  assert.match(String((await call("PUT", admin, { key: "fulfil_gratitude:0", subject: "Thanks - {ref}", body: "Dear {person}" })).json.error), /keep "Thank you for hosting"/);
  assert.equal((await call("PUT", admin, { key: "fulfil_gratitude:0", subject: "Thank you for hosting us - {ref}", body: "Dear {person}" })).status, 200);
  assert.equal((await getTemplate("fulfil_gratitude")).subject, "Thank you for hosting us - {ref}");
  assert.equal((await call("PUT", admin, { key: "fulfil_gratitude:0", reset: true })).status, 200);
  assert.match((await getTemplate("fulfil_gratitude")).subject, /^Thank you for hosting our training/);
});

test("signatures: built-in is what it was; each person's own; the shared details; someone not on the list", async () => {
  const { signature } = await import("@/lib/quoteEmails");
  assert.match(signature("Ashish"), /^Ashish\nTHINK HEALTH CARE AND SAFETY\n/);
  assert.match(signature("Sumit A Shah"), /^Sumit A Shah\nProprietor\nTHINK HEALTH/);
  assert.match(signature(""), /^THINK HEALTH/);
  const o = { "sign:ashish": { body: "{name}\nSales Manager\n+91 90000 00000\n\n{details}" }, "sign:details": { body: "THINK HEALTH\nPune" } };
  assert.equal(signature("Ashish", o), "Ashish\nSales Manager\n+91 90000 00000\n\nTHINK HEALTH\nPune");
  assert.equal(signature("Shikha", o), "Shikha\nTHINK HEALTH\nPune");
  assert.equal(signature("Prashant Sawale", o), "Prashant Sawale\nTHINK HEALTH\nPune");
  const q = { ...SAMPLES[0], signer: null, salesperson: "Ashish" };
  assert.match(buildQuoteEmail("new", q, [], undefined, o).text, /Warm regards,\nAshish\nSales Manager\n/);
  assert.match(buildQuoteEmail("formal", q, [], undefined, o).text, /Yours sincerely,\nAshish\nSales Manager\n/);
  assert.match(buildTsEmail("new", q, [], o).text, /Parteek Nathani/); // Total Supply keeps its own
  const { ziaEmailHtml } = await import("@/lib/quoteEmails");
  assert.match(ziaEmailHtml("Hi.\n\nWarm regards,", q, o), /Sales Manager/);
});

test("route: a signature is its owner's and Admin's; the company details Admin's", async () => {
  const { resetFakeDb } = await import("./fakes/db");
  resetFakeDb();
  assert.equal((await call("PUT", ashish, { key: "sign:ashish", body: "{name}\nSales\n{details}" })).status, 200);
  assert.equal((await call("PUT", ashish, { key: "sign:sumit", body: "{name}" })).status, 403);
  assert.equal((await call("PUT", ashish, { key: "sign:details", body: "X" })).status, 403);
  assert.match(String((await call("PUT", ashish, { key: "sign:ashish", body: "{name} {phone}" })).json.error), /Unknown: \{phone\}/);
  assert.equal((await call("PUT", admin, { key: "sign:sumit", body: "{name}\nOwner\n{details}" })).status, 200);
  assert.equal((await call("PUT", admin, { key: "sign:details", body: "THINK HEALTH" })).status, 200);
  const list = (await call("GET", ashish)).json.templates as Entry[];
  assert.deepEqual(list.filter((t) => t.key.startsWith("sign:")).map((t) => [t.key, t.canEdit, t.edited]),
    [["sign:ashish", true, true], ["sign:shikha", false, false], ["sign:sumit", false, true], ["sign:nikita", false, false], ["sign:pranjal", false, false], ["sign:anuj", false, false], ["sign:details", false, true]]);
  const o = (await call("GET", ashish, undefined, "?overrides=1")).json.overrides as Record<string, unknown>;
  assert.deepEqual(Object.keys(o).sort(), ["sign:ashish", "sign:details", "sign:sumit"]);
});
