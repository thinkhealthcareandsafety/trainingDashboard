import { db } from "./db";
import { workdriveInfo, workdriveMakeFolder, workdriveSubfolders } from "./workdrive";

/*
 * Customer folders (owner, 23 Nov; Zoho Sprints I148 "Customer Folders creation on new customer entry"): every customer
 * added in Zoho Books from now on gets an empty folder, named after them, in the team's WorkDrive SALES folder. Customers
 * already in Books get none ("new ones only"); the sample "CLIENT NAME" folder there is left alone.
 * Rides on the Zoho sync (zohoSync.ts) after the customers are read, so no extra Books calls. Needs WorkDrive connected
 * with the CREATE scope; until then it waits quietly. A folder of the same name already there is kept, not doubled.
 * State: kv `customer_folders` {since} (set on the first run: customers created after it count), collection
 * `customerFolders` {_id: contactId, name, folder, folderId, made|kept, at}.
 * Vendors too (owner, 24 Nov): each vendor added in Books gets one in PURCHASE, next to SALES. Vendors aren't kept here, so
 * the newest are asked for once an hour (one Books call): kv `vendor_folders` {since, checkedAt}, collection `vendorFolders`.
 * On 24 Nov everyone with an invoice (customers) or a bill (vendors), not void or draft, got a folder once: `backfill: true`.
 * Customers with the same name share one folder, with a folder inside for each entry: "City - GSTIN" (owner, 24 Nov:
 * "duplicate customer names get a single folder and then bifurcate inside"). Record: {sub, subId}.
 */

export const PURCHASE_FOLDER = "yn5nx5e97f2cc7c2c4e75a43c055eea01ce70";
export const SALES_FOLDER = "yn5nx6650c0d9b6824a37b5d47b05db8a09fc";
export const SALES_FOLDER_LINK = "https://workdrive.zoho.in/53ff4315ed8ce16a945a0a0dc401e6a12c2c3/teams/53ff4315ed8ce16a945a0a0dc401e6a12c2c3/ws/znge7acf2ee5bec304274b0cecca367bed7e6/folders/yn5nx6650c0d9b6824a37b5d47b05db8a09fc";
const STATE = "customer_folders";
const VENDOR_STATE = "vendor_folders";
const VENDORS_EVERY_MS = 60 * 60_000;
const PER_RUN = 20;

/** A customer's name as a folder name: no characters WorkDrive or Windows refuse, no trailing dots or spaces. */
export function folderName(name: string): string {
  return name.replace(/[\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 150).trim();
}

export type Customer = { _id: string; name?: string; createdAt?: string };
/** The customers who still need a folder: created after `since`, not done yet, with a usable name. Oldest first. */
export function needFolders(customers: Customer[], since: string, done: Set<string>): { id: string; folder: string }[] {
  return customers
    .filter((c) => (c.createdAt ?? "") > since && !done.has(c._id) && folderName(c.name ?? ""))
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
    .map((c) => ({ id: c._id, folder: folderName(c.name ?? "") }));
}

/** What tells two customers of the same name apart. */
export type Entry = { city?: string; zip?: string; gst?: string };
/** The folder for one entry inside a shared folder: "City - GSTIN"; the pincode, then a number, only when that name is taken. */
export function entryFolder(e: Entry, taken: string[]): string {
  const used = new Set(taken.map((t) => t.toLowerCase()));
  const name = (place: string) => folderName([place, e.gst ?? ""].filter(Boolean).join(" - ")) || "Entry";
  const plain = name(e.city ?? ""), withPin = name([e.city, e.zip].filter(Boolean).join(" "));
  for (const n of [plain, withPin]) if (!used.has(n.toLowerCase())) return n;
  let i = 2;
  while (used.has(`${withPin} (${i})`.toLowerCase())) i++;
  return `${withPin} (${i})`;
}

type Done = { sub?: string; subId?: string; _id: string; name: string; folder: string; folderId: string; how: "made" | "kept"; at: Date; backfill?: boolean };

/** The folders still owed to these people, in `parent`. The names made (or found already there). */
async function makeOwed(people: Customer[], since: string, parent: string, collection: "customerFolders" | "vendorFolders", entry?: (id: string) => Promise<Entry>): Promise<string[]> {
  if (!people.length) return [];
  const doneCol = (await db()).collection<Done>(collection);
  const done = new Set((await doneCol.find({ _id: { $in: people.map((c) => c._id) } }, { projection: { _id: 1 } }).toArray()).map((x) => x._id));
  const todo = needFolders(people, since, done).slice(0, PER_RUN);
  if (!todo.length) return [];
  const there = new Map((await workdriveSubfolders(parent)).map((e) => [e.name.toLowerCase(), e.id]));
  const out: string[] = [];
  for (const t of todo) {
    const name = people.find((c) => c._id === t.id)?.name ?? t.folder;
    const kept = there.get(t.folder.toLowerCase());
    const folderId = kept ?? (await workdriveMakeFolder(parent, t.folder));
    there.set(t.folder.toLowerCase(), folderId);
    // Someone else's folder already: one inside it for each of them. Before this one is recorded, so a failure is tried again.
    const others = kept && entry ? await doneCol.find({ folderId }).toArray() : [];
    const taken = others.flatMap((o) => (o.sub ? [o.sub] : []));
    const inside = others.length ? new Map((await workdriveSubfolders(folderId)).map((e) => [e.name.toLowerCase(), e.id])) : null;
    const split = async (id: string) => {
      const sub = entryFolder(await entry!(id), taken);
      const subId = inside!.get(sub.toLowerCase()) ?? (await workdriveMakeFolder(folderId, sub));
      taken.push(sub);
      return { sub, subId };
    };
    for (const o of others) if (!o.subId) await doneCol.updateOne({ _id: o._id }, { $set: await split(o._id) });
    const own = inside ? await split(t.id) : {};
    await doneCol.replaceOne({ _id: t.id }, { name, folder: t.folder, folderId, how: kept ? "kept" : "made", at: new Date(), ...own }, { upsert: true });
    out.push(t.folder);
  }
  return out;
}

/** Make the customer folders still owed. Throws on a WorkDrive problem (the sync logs it). */
export async function makeCustomerFolders(now = new Date(), entry?: (id: string) => Promise<Entry>): Promise<string[]> {
  const d = await db();
  const kv = d.collection<{ _id: string; since?: string }>("kv");
  const state = await kv.findOne({ _id: STATE });
  if (!state?.since) {
    await kv.updateOne({ _id: STATE }, { $set: { since: now.toISOString() } }, { upsert: true });
    return [];
  }
  if (!(await workdriveInfo())?.canCreate) return [];
  const customers = await d.collection<Customer>("zohoCustomers").find({ createdAt: { $gt: state.since } }, { projection: { name: 1, createdAt: 1 } }).toArray();
  return makeOwed(customers, state.since, SALES_FOLDER, "customerFolders", entry);
}

/** The same for vendors, at most once an hour. `newest` asks Zoho Books for the newest vendors. */
export async function makeVendorFolders(newest: () => Promise<Customer[]>, now = new Date()): Promise<string[]> {
  const kv = (await db()).collection<{ _id: string; since?: string; checkedAt?: number }>("kv");
  const state = await kv.findOne({ _id: VENDOR_STATE });
  if (!state?.since) {
    await kv.updateOne({ _id: VENDOR_STATE }, { $set: { since: now.toISOString() } }, { upsert: true });
    return [];
  }
  if (now.getTime() - (state.checkedAt ?? 0) < VENDORS_EVERY_MS || !(await workdriveInfo())?.canCreate) return [];
  const out = await makeOwed(await newest(), state.since, PURCHASE_FOLDER, "vendorFolders");
  // Only after it worked, so a failure is tried again at the next sync; a full batch carries straight on too.
  if (out.length < PER_RUN) await kv.updateOne({ _id: VENDOR_STATE }, { $set: { checkedAt: now.getTime() } });
  return out;
}
