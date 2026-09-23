import "server-only";
import { MongoClient, type Db } from "mongodb";

// Shared team storage for calendar entries, follow-ups and announcements.
// Enabled when MONGODB_URI is set (MongoDB Atlas or self-hosted); otherwise the app keeps data in the browser.

export const COLLECTIONS = ["entries", "followUps", "removedTriggers", "announcements", "leads"] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

const globalForMongo = globalThis as unknown as { _thMongo?: Promise<MongoClient> };

export function mongoConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

export async function db(): Promise<Db> {
  if (!globalForMongo._thMongo) {
    globalForMongo._thMongo = new MongoClient(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 8000 }).connect();
  }
  const client = await globalForMongo._thMongo;
  return client.db(process.env.MONGODB_DB ?? "thinkhealth_dashboard");
}
