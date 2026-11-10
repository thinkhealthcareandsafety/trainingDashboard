// Zoho's long ids sent as bare numbers (10 Nov: every brochure answered 404 — 982417000023697041 had become …697000).
import { test } from "node:test";
import assert from "node:assert/strict";
import { brochureIdOf, parseZoho } from "@/lib/zoho";

test("a brochure id sent as a bare number stays whole; everything else parses as before", () => {
  const raw = '{"code":0,"items":[{"item_id":"982417000000073193","rate":105000,"cf_product_brochure_unformatted":982417000023697041,"custom_fields":[{"api_name":"cf_product_brochure","value":982417000023697041},{"api_name":"cf_offer_price","value":88000}],"description":"says \\"value\\": 1234567890123456789 in words"}]}';
  const j = parseZoho(raw);
  const item = j.items[0];
  assert.equal(item.cf_product_brochure_unformatted, "982417000023697041");
  assert.equal(item.custom_fields[0].value, "982417000023697041");
  assert.equal(item.custom_fields[1].value, 88000);
  assert.equal(item.rate, 105000);
  assert.equal(item.description, 'says "value": 1234567890123456789 in words');
  assert.equal(brochureIdOf(item), "982417000023697041");
  assert.equal(brochureIdOf({ cf_product_brochure_unformatted: "982417000023697041" }), "982417000023697041");
});
