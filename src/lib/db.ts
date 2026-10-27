import "server-only";
import { MongoClient, type Db } from "mongodb";

// Shared team storage for calendar entries, follow-ups and announcements.
// Enabled when MONGODB_URI is set (MongoDB Atlas or self-hosted); otherwise the app keeps data in the browser.

export const COLLECTIONS = ["entries", "followUps", "removedTriggers", "announcements", "members", "cardEvents"] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

const globalForMongo = globalThis as unknown as { _thMongo?: Promise<MongoClient> };

export function mongoConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

export async function db(): Promise<Db> {
  if (!globalForMongo._thMongo) {
    // A failed connect is forgotten, so the next request tries again — a kept failure broke a server for good
    // ("Server selection timed out", 27 Oct). The slowed free cluster makes each new connection wait (Atlas adds a
    // pause per connection when over its transfer limit): 20 s to find it, and at most 10 connections per server.
    globalForMongo._thMongo = new MongoClient(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 20_000, maxPoolSize: 10 })
      .connect()
      .catch((e) => {
        globalForMongo._thMongo = undefined;
        throw e;
      });
  }
  const client = await globalForMongo._thMongo;
  return client.db(process.env.MONGODB_DB ?? "thinkhealth_dashboard");
}
