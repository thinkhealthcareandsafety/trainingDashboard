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
