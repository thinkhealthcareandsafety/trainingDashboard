// Visiting cards for External Leads (owner, 27 Nov): the words read from the photo, put into the form's labels.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCard, phonesIn } from "@/lib/cardScan";

test("a typical card: company, person, role, phones, email, website, GSTIN, address with city and PIN", () => {
  const g = parseCard(`INFINITY INDUSTRIES PVT LTD
Mr. Rahul Patil
Purchase Manager
Plot No. 12, MIDC Bhosari
Pune - 411026, Maharashtra
Mob: +91 98231 01908 | Tel: 020-27120000
rahul.patil@infinityind.com
www.infinityind.com
GSTIN: 27AAIFI5186R1ZG`);
  assert.equal(g.company, "Infinity Industries Pvt Ltd");
  assert.deepEqual([g.salutation, g.firstName, g.lastName, g.designation], ["Mr.", "Rahul", "Patil", "Purchase Manager"]);
  assert.equal(g.phone, "+91 9823101908");
  assert.ok(g.phones.includes("02027120000"));
  assert.deepEqual([g.email, g.website, g.gstin, g.state], ["rahul.patil@infinityind.com", "www.infinityind.com", "27AAIFI5186R1ZG", "MH"]);
  assert.deepEqual([g.city, g.zip], ["Pune", "411026"]);
  assert.match(g.street ?? "", /Plot No\. 12, MIDC Bhosari/);
});

test("no company line: the company comes from the email's domain, never from a free mailbox", () => {
  assert.equal(parseCard("Anita Desai\nSales Head\nanita@greenleafhotels.in\n9876543210").company, "Greenleafhotels");
  assert.equal(parseCard("Anita Desai\nanita.desai@gmail.com").company, undefined);
});

test("phones: mobiles with or without +91 / 0, not PIN codes or dates", () => {
  assert.deepEqual(phonesIn("098765 43210 / +91-91234-56789 · 411017 · 20261127"), ["+91 9876543210", "+91 9123456789"]);
});

test("Armor Fire (a real card, read sideways, 27 Nov): icons read as letters, company only in the logo, state by name", () => {
  const g = parseCard(`SHIV KOLI
BUSINESS DEVELOPMENT MANAGER ( PAN INDIA )
BN +9199135 67672
pnsalesi@armorfire.co.in
ARMOR
FIRE
SHIELD OF QUALITY
El www.armorfire.in Ces
Plot no. 43-45, Lothada, Rajkot,
Gujarat - 360022`);
  assert.deepEqual([g.company, g.firstName, g.lastName, g.designation], ["Armor Fire", "Shiv", "Koli", "Business Development Manager (PAN India)"]);
  assert.equal(g.email, "pnsales1@armorfire.co.in");
  assert.deepEqual([g.phone, g.website, g.city, g.state, g.zip, g.street], ["+91 9913567672", "www.armorfire.in", "Rajkot", "GJ", "360022", "Plot no. 43-45, Lothada"]);
});

test("logo words apart and an email read with ® for @ still make the company and the email", () => {
  const g = parseCard("SHIV KOLI\na FIRE\nEl www.armorfire.in Ces\nEJ pnsales1®armorfire.co.in i ARMOR");
  assert.deepEqual([g.company, g.email], ["Armor Fire", "pnsales1@armorfire.co.in"]);
});
