import type { PipelineDoc, Training, ZohoStatus } from "./types";
import { addDays, fiscalYearStart, parseYmd, startOfDay, ymd } from "./dates";

// Sample data shaped exactly like the Zoho sync output, so the UI works before the API is connected.
// Trainer names, lead sources and training types match the Zoho Books custom field options.

const CLIENTS = [
  "Acme Industries", "Sunrise Hotels", "City Public School", "Marriott Pune", "Apex Logistics",
  "Greenfield Pharma", "Metro Mall", "Blue Lagoon Resort", "Orion IT Park", "Shree Hospitals",
  "Vertex Manufacturing", "Lotus Residency",
];
const TYPES = [
  { name: "BLS / CPR Training", rate: 1800 },
  { name: "First Aid Training", rate: 1500 },
  { name: "Fire Safety Training", rate: 1400 },
  { name: "AED Awareness Training", rate: 1200 },
  { name: "Pool Safety & Lifeguard", rate: 2500 },
  { name: "Road Safety Workshop", rate: 1000 },
];
const TRAINERS = ["Sumit Shah", "Ashish Dalal", "Baiju Stephen"];
const SOURCES = ["Direct", "Reference", "Indiamart", "Events", "Social Media"];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// Completed trainings per fiscal month before the current one (Apr, May, Jun, ...).
const PAST_MONTH_COUNTS = [9, 11, 8, 12, 10, 7, 13, 9, 10, 11, 8];

export function generateMockTrainings(today = new Date()): Training[] {
  const rand = rng(20260922);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const fyStart = fiscalYearStart(today);
  const out: Training[] = [];
  let inv = 180;

  const push = (date: Date, status: ZohoStatus) => {
    const t = pick(TYPES);
    const participants = 10 + Math.floor(rand() * 30);
    const amount = participants * t.rate;
    const trainingDate = ymd(date);
    inv++;
    const expiry = new Date(date);
    expiry.setFullYear(expiry.getFullYear() + 2);
    out.push({
      id: `invoice:${inv}01`,
      zohoDocType: "invoice",
      zohoDocId: `98241700002${inv}`,
      docNumber: `INV-000${inv}`,
      customerId: `c${CLIENTS.indexOf(pick(CLIENTS))}`,
      customerName: "",
      trainingType: t.name,
      trainingDate,
      trainer: pick(TRAINERS),
      participants,
      amount,
      status,
      dueDate: ymd(addDays(date, 15)),
      certExpiry: ymd(expiry),
      leadSource: pick(SOURCES),
    });
    const last = out[out.length - 1];
    last.customerName = CLIENTS[Number(last.customerId.slice(1))];
  };

  // Past fiscal months: spread completed trainings over working days.
  for (let m = 0; ; m++) {
    const monthStart = new Date(fyStart.getFullYear(), fyStart.getMonth() + m, 1);
    if (monthStart.getFullYear() === today.getFullYear() && monthStart.getMonth() === today.getMonth()) break;
    const count = PAST_MONTH_COUNTS[m % PAST_MONTH_COUNTS.length];
    const days = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    for (let i = 0; i < count; i++) {
      let d = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1 + Math.floor(((i + rand()) / count) * days));
      if (d.getDay() === 0) d = addDays(d, 1);
      const age = (today.getTime() - d.getTime()) / 86_400_000;
      push(d, age > 45 || rand() > 0.35 ? "paid" : age > 15 ? "overdue" : "sent");
    }
  }

  // Current month: 7 delivered so far (spread up to yesterday), 3 scheduled ahead.
  const dom = today.getDate();
  for (let i = 0; i < 7; i++) {
    const day = Math.max(1, Math.round(((i + 0.5) / 7) * Math.max(1, dom - 1)));
    let d = new Date(today.getFullYear(), today.getMonth(), day);
    if (d.getDay() === 0) d = addDays(d, day > 1 ? -1 : 1);
    if (d >= startOfDay(today)) d = addDays(startOfDay(today), -1);
    push(d, i < 3 ? "paid" : i < 5 ? "sent" : "overdue");
  }
  push(today, "sent");
  push(addDays(today, 1), "sent");
  push(addDays(today, 5), "draft");
  push(addDays(today, 9), "draft");
  push(addDays(today, 16), "draft");

  // A few old trainings whose 2-year certificates expire soon (drive renewal follow-ups).
  for (const offset of [-705, -690, -670]) {
    push(addDays(today, offset), "paid");
  }

  // Force some invoices to be clearly overdue for the ticker.
  out
    .filter((t) => t.status === "overdue")
    .forEach((t) => {
      if (parseYmd(t.dueDate!) > today) t.dueDate = ymd(addDays(today, -3));
    });

  // Demonstrate the Zoho Priority field (cf_priority) on one upcoming training.
  const flagged = out.find((t) => t.trainingDate === ymd(addDays(today, 5)));
  if (flagged) flagged.zohoPriority = "high";

  return out;
}

export function generateMockPipeline(today = new Date()): PipelineDoc[] {
  const d = (n: number) => ymd(addDays(today, n));
  const q = (i: number, days: number, customer: string, type: string, pax: number, rate: number, status = "sent"): PipelineDoc => ({
    id: `estimate:mock${i}`, kind: "estimate", docId: `mock${i}`, docNumber: `Quotation-24-00${2500 + i}`, customerName: customer,
    date: d(-days), expiryDate: d(30 - days), status, trainingType: type, participants: pax, amount: pax * rate,
  });
  return [
    q(1, 2, "Orion IT Park", "BLS / CPR Training", 40, 1800),
    q(2, 5, "Greenfield Pharma", "Fire Safety Training", 60, 1400),
    q(3, 12, "Blue Lagoon Resort", "Pool Safety & Lifeguard", 18, 2500),
    q(4, 45, "Metro Mall", "First Aid Training", 30, 1500),
    q(5, 1, "Lotus Residency", "AED Awareness Training", 25, 1200, "draft"),
    q(6, 9, "Vertex Manufacturing", "First Aid Training", 50, 1500, "accepted"),
    {
      id: "salesorder:mock7", kind: "salesorder", docId: "mock7", docNumber: "Performa-25-1040", customerName: "Shree Hospitals",
      date: d(-4), trainingDate: d(6), status: "open", trainingType: "BLS / CPR Training", participants: 35, amount: 35 * 1800,
    },
    {
      id: "salesorder:mock8", kind: "salesorder", docId: "mock8", docNumber: "Performa-25-1041", customerName: "Apex Logistics",
      date: d(-2), status: "open", trainingType: "First Aid Training", participants: 22, amount: 22 * 1500,
    },
  ];
}
