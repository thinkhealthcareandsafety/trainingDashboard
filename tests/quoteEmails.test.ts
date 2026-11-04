// Quotation email templates (src/lib/quoteEmails.ts): items → topics, names filled in, templates, HTML.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES, brandsOf, buildQuoteEmail, listNames, mergeCc, signature, suggestTemplate, textToHtml, topicOf, topicsOf, splitZiaReply, ziaBrief, ziaPrompt } from "@/lib/quoteEmails";

const base = { company: "Tata Motors", contact: "Mr. Rajesh Kumar", number: "QT-001234", total: 185000, expiry: "2026-12-03", salesperson: "Pranjal" };

test("items go to the right topic, loose identifiers included", () => {
  assert.equal(topicOf("Zoll AED Plus", "All AEDs"), "aed");
  assert.equal(topicOf("Defibtch Lifeline AED Trainer DCF-E350T", "All AEDs"), "trainingKit");
  assert.equal(topicOf("AED Rental", "All AEDs"), "aedRental");
  assert.equal(topicOf("AED 7000 Compatible pads OBS", "General Safety"), "aedPads");
  assert.equal(topicOf("AED SMARTX 1 Year License", "General Safety"), "aedSoftware");
  assert.equal(topicOf("AED Empty Case FRX", "AED Accessories"), "aedCabinet");
  assert.equal(topicOf("THCAS CPR Training 2026 (I)", "Training Services"), "training");
  assert.equal(topicOf("Corporate Training", "Training Equipment"), "training");
  assert.equal(topicOf("Car Fire Blanket 9X6 M", "Fire Blankets"), "fireBlanket");
  assert.equal(topicOf("Burn Cream SSDEE 15 gm", "Medical Safety"), "trauma");
  assert.equal(topicOf("Bubble Roll", null), "general");
});

test("names and brands", () => {
  assert.equal(listNames(["A"]), "A");
  assert.equal(listNames(["A", "B", "A"]), "A and B");
  assert.equal(listNames(["A", "B", "C"]), "A, B and C");
  assert.equal(listNames(["A", "B", "C", "D", "E"]), "A, B, C and 2 more");
  assert.deepEqual(brandsOf(["Philips HeartStart FRx", "Zoll AED Plus", "Defibtch Lifeline"]), ["Philips", "Zoll", "Defibtech"]);
});

test("an AED + training quote names the models and the training, in order", () => {
  const lines = [
    { name: "THCAS CPR Training 2026 (I)", qty: 1, group: "Training Services" },
    { name: "Zoll AED Plus", qty: 2, group: "All AEDs" },
  ];
  assert.deepEqual(topicsOf(lines).map((t) => t.id), ["aed", "training"]);
  const e = buildQuoteEmail("new", { ...base, lines });
  assert.equal(e.subject, "Quotation QT-001234 for Tata Motors – Zoll AED + training");
  assert.match(e.text, /^Hi Rajesh,/);
  assert.match(e.text, /Zoll AED Plus/);
  assert.match(e.text, /hands-on/);
  assert.doesNotMatch(e.text, /we can also train your team/); // training is already on the quote
  assert.match(e.text, /₹1,85,000 including GST/);
  assert.match(e.text, /3 December 2026/);
  assert.match(e.text, /Warm regards,\nPranjal\nTHINK HEALTH CARE AND SAFETY\n/);
  assert.match(e.text, /CPR AED FIRST AID Training- https:\/\/www\.thinkhealth\.in\/trainings$/);
});

test("switched-off topics leave no gap; formal lists the items; pads only → repeat order", () => {
  const lines = [{ name: "Defibtech Pad DDP100", qty: 4, group: "AED Pads" }];
  assert.equal(suggestTemplate(lines), "repeat");
  const off = buildQuoteEmail("new", { ...base, lines }, ["aedPads"]);
  assert.doesNotMatch(off.text, /\n\n\n/);
  assert.doesNotMatch(off.text, /single-use/);
  const formal = buildQuoteEmail("formal", { ...base, contact: null, lines });
  assert.match(formal.text, /^Dear Sir \/ Madam,/);
  assert.match(formal.text, /• Defibtech Pad DDP100 — 4 nos\./);
  assert.match(formal.text, /Yours sincerely,\nPranjal\n/);
  assert.equal(buildQuoteEmail("short", { ...base, contact: null, lines }).text.split("\n")[0], "Hello,");
});

test("text becomes safe HTML paragraphs", () => {
  assert.equal(textToHtml("Hi <b>,\n\nLine 1\nLine 2"), "<p style=\"margin:0 0 1em\">Hi &lt;b&gt;,</p><p style=\"margin:0 0 1em\">Line 1<br>Line 2</p>");
});

test("a number that already says Quotation isn't doubled, in any template", () => {
  const lines = [{ name: "3D AED Signage", qty: 1, group: "AED Accessories" }];
  for (const t of TEMPLATES) {
    const { subject, text } = buildQuoteEmail(t.id, { ...base, number: "Quotation-24-002753", lines });
    assert.doesNotMatch(`${subject}\n${text}`, /quotation quotation/i, t.id);
    assert.match(subject, /Quotation-24-002753 for Tata Motors/, t.id);
    assert.match(text, /Quotation-24-002753/, t.id);
  }
});

test("every template carries the whole signature, and its web addresses are links", () => {
  const lines = [{ name: "Zoll AED Plus", qty: 1, group: "All AEDs" }];
  for (const t of TEMPLATES) {
    const { text } = buildQuoteEmail(t.id, { ...base, signer: "Ashish Dalal", lines });
    if (t.id === "formal") assert.ok(text.endsWith(signature("Ashish Dalal")), t.id); // "Yours sincerely," instead of "Warm regards,"
    else assert.ok(text.endsWith(`Warm regards,\n${signature("Ashish Dalal")}`), t.id);
  }
  const html = textToHtml(signature("Sumit A Shah"));
  assert.match(html, /<a href="https:\/\/www\.thinkhealth\.in\/Profile">www\.thinkhealth\.in\/Profile<\/a>/);
  assert.match(html, /<a href="https:\/\/www\.thinkhealth\.in\/trainings">https:\/\/www\.thinkhealth\.in\/trainings<\/a>/);
});

test("the signature is the sender's: first line their name, Proprietor only for Sumit, the rest unchanged", () => {
  for (const n of ["Ashish Dalal", "Pranjal Nikalje", "Shikha Dixit", "Nikita Shah"]) {
    const s = signature(n).split("\n");
    assert.equal(s[0], n);
    assert.equal(s[1], "THINK HEALTH CARE AND SAFETY");
    assert.ok(!signature(n).includes("Proprietor"));
  }
  assert.deepEqual(signature("Sumit A Shah").split("\n").slice(0, 3), ["Sumit A Shah", "Proprietor", "THINK HEALTH CARE AND SAFETY"]);
  assert.match(signature("Ashish Dalal"), /9823101908 \/ 9356080806 \/ 8007000884/);
  assert.match(signature("Ashish Dalal"), /9823101908\/ 8007700006\/ 9356080806/);
  assert.equal(signature(null).split("\n")[0], "THINK HEALTH CARE AND SAFETY"); // nobody to name
  // Admin sends no signer: the quote's Sales person signs.
  const lines = [{ name: "Zoll AED Plus", qty: 1, group: "All AEDs" }];
  assert.match(buildQuoteEmail("new", { ...base, salesperson: "Pranjal Nikalje", lines }).text, /Warm regards,\nPranjal Nikalje\nTHINK HEALTH/);
  assert.match(buildQuoteEmail("new", { ...base, salesperson: "Pranjal Nikalje", signer: "Ashish Dalal", lines }).text, /Warm regards,\nAshish Dalal\nTHINK HEALTH/);
});

test("Cc: always sales@ and sshah@, each address once, none already in To", () => {
  assert.deepEqual(mergeCc(["a@x.in"], []), ["sales@thinkhealth.in", "sshah@thinkhealth.in"]);
  assert.deepEqual(mergeCc(["a@x.in"], ["b@x.in", "SALES@thinkhealth.in", "b@x.in"]), ["sales@thinkhealth.in", "sshah@thinkhealth.in", "b@x.in"]);
  assert.deepEqual(mergeCc(["sshah@thinkhealth.in"], []), ["sales@thinkhealth.in"]);
});

test("the Zia brief carries the request, items, total and the quote number in its subject", () => {
  const b = ziaBrief("AED email, mention <warranty>", { ...base, lines: [{ name: "Zoll AED Plus", qty: 2, group: "All AEDs" }] });
  assert.equal(b.subject, "Zia · QT-001234 · Tata Motors");
  assert.match(b.html, /What to write: AED email, mention &lt;warranty&gt;/);
  assert.match(b.html, /• Zoll AED Plus × 2<br>/);
  assert.match(b.html, /₹1,85,000 including GST/);
});

test("the Flow prompt asks for the email only; Zia's reply splits into subject and text", () => {
  const p = ziaPrompt("short and friendly", { ...base, lines: [{ name: "AED Wall Cabinet", qty: 1, group: "AED Cabinet" }] });
  assert.match(p, /^Write a quotation email/);
  assert.match(p, /What to write: short and friendly/);
  assert.deepEqual(splitZiaReply("Subject: Your AED cabinet quote\n\nHi Rajesh,\n\nThanks."), { subject: "Your AED cabinet quote", text: "Hi Rajesh,\n\nThanks." });
  assert.deepEqual(splitZiaReply("**Subject:** Quote\nHi"), { subject: "Quote", text: "Hi" });
  assert.deepEqual(splitZiaReply("Hi Rajesh,\r\nThanks."), { subject: null, text: "Hi Rajesh,\nThanks." });
});
