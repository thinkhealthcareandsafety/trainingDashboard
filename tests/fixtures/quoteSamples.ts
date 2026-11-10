// Sample quotes for the template tests: every topic, one and many items, with and without expiry / contact / training.
import type { QuoteEmailInput } from "@/lib/quoteEmails";

const base = { company: "Acme Hotels Pvt Ltd", contact: "Mr. Rahul Mehta", number: "Quotation-24-002753", total: 185320.5, expiry: "2026-12-10", salesperson: "Ashish", signer: null };
export const SAMPLES: QuoteEmailInput[] = [
  { ...base, lines: [{ name: "Zoll AED Plus", qty: 1, group: "All AEDs", rate: 120000, gst: 5 }, { name: "Zoll CPR-D Padz", qty: 2, group: "AED Pads", rate: 9000, gst: 12 }, { name: "CPR & AED Training", qty: 20, group: "Training Services", rate: 1200, gst: 18 }] },
  { ...base, contact: null, expiry: null, signer: "Sumit A Shah", lines: [{ name: "Philips HeartStart FRx AED", qty: 2, group: "All AEDs", rate: 150000, gst: 5 }, { name: "Defibtech Lifeline AED", qty: 1, group: "All AEDs", rate: 110000, gst: 5 }, { name: "AED Wall Cabinet", qty: 3, group: "AED Accessories", rate: 8000, gst: 18 }] },
  { ...base, number: "QT-0042", lines: [{ name: "Philips FRx Pads", qty: 4, group: "AED Pads", rate: 6000, gst: 12 }, { name: "Philips FRx Battery", qty: 1, group: "AED Batteries", rate: 15000, gst: 12 }] },
  { ...base, lines: [{ name: "Something unusual", qty: 1, group: null, rate: 500, gst: null }] },
  { ...base, lines: [{ name: "ABC Fire Extinguisher 6kg", qty: 5, group: "Fire Safety", rate: 2500, gst: 18 }, { name: "Something unusual", qty: 1, group: null, rate: 500, gst: null }, { name: "Spine board stretcher", qty: 1, group: "Evacuation", rate: 9000, gst: 12 }] },
  { ...base, lines: [] },
];
