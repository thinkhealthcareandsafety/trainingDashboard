import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteStory } from "../src/lib/quoteStory";

// Zoho's history, newest first, as on Quotation-24-002776 (owner's screenshot, 11 Nov).
const zoho = (text: string, by: string, when: string) => ({ text, by, when });
const history = [
  zoho("Quote updated. Amount changed from Rs.121,170.00 to Rs.84,370.00", "Ashish D", "23 hours ago 10:56 AM"),
  zoho("The custom function quote_set_product_types has been executed by the workflow Set_Product_Type_Rule.", "Zoho Books", "yesterday 11:44 AM"),
  zoho("Quote updated.", "Sumit A Shah", "yesterday 11:44 AM"),
  zoho("Quote updated.", "Sumit A Shah", "yesterday 11:44 AM"),
  zoho("Quote converted to Sales Order Performa-25-1185.", "Ashish D", "yesterday 11:44 AM"),
  zoho("The Workflow Set_Product_Type_Rule was not executed as it was triggered by custom function(s) [quote_set_product_types]", "Zoho Books", "yesterday 11:44 AM"),
  zoho("Quote emailed to office@himalayanaccess.com", "Ashish D", "9 Nov 10:15 AM"),
  zoho("Quote created for Rs.121,170.00", "Ashish D", "9 Nov 10:02 AM"),
];

test("the story: oldest first, Zoho's automation left out, updates in a row counted once", () => {
  const s = quoteStory(history);
  assert.deepEqual(s.map((x) => [x.kind, x.count]), [["created", 1], ["emailed", 1], ["salesorder", 1], ["updated", 3]]);
  assert.equal(s[0].detail, "₹121,170");
  assert.equal(s[1].detail, "office@himalayanaccess.com");
  assert.equal(s[2].detail, "Performa-25-1185");
  assert.equal(s[3].detail, "₹121,170 → ₹84,370"); // the latest amount change
  assert.equal(s[3].by, "Ashish D");
});

test("nothing but automation → no steps", () => {
  assert.deepEqual(quoteStory([history[1], history[5]]), []);
});
