import mongoose from "mongoose";

/**
 * MongoDB connection. The URI comes from configuration only (ADR-0003: where personal data may be
 * stored is a legal decision, so the code stays hosting-agnostic).
 *
 * - `sanitizeFilter` makes Mongoose wrap any `$`-operator found in a filter value in `$eq`, a second
 *   defence against NoSQL operator injection behind the strict request schemas.
 * - `autoIndex` stays on while collections are small so TTL and unique indexes are created. Move to
 *   explicit index migrations before collections grow large.
 */
export async function connectDb(uri: string): Promise<void> {
  mongoose.set("strictQuery", true);
  mongoose.set("sanitizeFilter", true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 10,
    autoIndex: true,
    retryWrites: true,
  });
}

export function isDbReady(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

export async function closeDb(): Promise<void> {
  await mongoose.disconnect();
}
