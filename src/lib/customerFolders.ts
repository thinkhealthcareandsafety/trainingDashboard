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
 */

export const SALES_FOLDER = "yn5nx6650c0d9b6824a37b5d47b05db8a09fc";
export const SALES_FOLDER_LINK = "https://workdrive.zoho.in/53ff4315ed8ce16a945a0a0dc401e6a12c2c3/teams/53ff4315ed8ce16a945a0a0dc401e6a12c2c3/ws/znge7acf2ee5bec304274b0cecca367bed7e6/folders/yn5nx6650c0d9b6824a37b5d47b05db8a09fc";
const STATE = "customer_folders";
const PER_RUN = 20;

/** A customer's name as a folder name: no characters WorkDrive or Windows refuse, no trailing dots or spaces. */
export function folderName(name: string): string {
  return name.replace(/[\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 150).trim();
}

type Customer = { _id: string; name?: string; createdAt?: string };
/** The customers who still need a folder: created after `since`, not done yet, with a usable name. Oldest first. */
export function needFolders(customers: Customer[], since: string, done: Set<string>): { id: string; folder: string }[] {
  return customers
    .filter((c) => (c.createdAt ?? "") > since && !done.has(c._id) && folderName(c.name ?? ""))
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
    .map((c) => ({ id: c._id, folder: folderName(c.name ?? "") }));
}

/** Make the folders still owed. The names made (or found already there). Throws on a WorkDrive problem (the sync logs it). */
export async function makeCustomerFolders(now = new Date()): Promise<string[]> {
  const d = await db();
  const kv = d.collection<{ _id: string; since?: string }>("kv");
  const state = await kv.findOne({ _id: STATE });
  if (!state?.since) {
    await kv.updateOne({ _id: STATE }, { $set: { since: now.toISOString() } }, { upsert: true });
    return [];
  }
  const info = await workdriveInfo();
  if (!info?.canCreate) return [];
  const doneCol = d.collection<{ _id: string; name: string; folder: string; folderId: string; how: "made" | "kept"; at: Date }>("customerFolders");
  const customers = await d.collection<Customer>("zohoCustomers").find({ createdAt: { $gt: state.since } }, { projection: { name: 1, createdAt: 1 } }).toArray();
  if (!customers.length) return [];
  const done = new Set((await doneCol.find({ _id: { $in: customers.map((c) => c._id) } }, { projection: { _id: 1 } }).toArray()).map((x) => x._id));
  const todo = needFolders(customers, state.since, done).slice(0, PER_RUN);
  if (!todo.length) return [];
  const there = new Map((await workdriveSubfolders(SALES_FOLDER)).map((e) => [e.name.toLowerCase(), e.id]));
  const out: string[] = [];
  for (const t of todo) {
    const name = customers.find((c) => c._id === t.id)?.name ?? t.folder;
    const kept = there.get(t.folder.toLowerCase());
    const folderId = kept ?? (await workdriveMakeFolder(SALES_FOLDER, t.folder));
    there.set(t.folder.toLowerCase(), folderId);
    await doneCol.replaceOne({ _id: t.id }, { name, folder: t.folder, folderId, how: kept ? "kept" : "made", at: new Date() }, { upsert: true });
    out.push(t.folder);
  }
  return out;
}
