import { MongoClient, type Db } from "mongodb";

const globalMongo = globalThis as typeof globalThis & {
  miloMongoClient?: Promise<MongoClient>;
  miloMongoReady?: Promise<void>;
};

function mongoUri(): string {
  if (process.env.MONGO_URL) return process.env.MONGO_URL;

  const host = process.env.MONGO_HOST ?? "127.0.0.1";
  const port = process.env.MONGO_PORT ?? "27017";
  const database = process.env.MONGO_DATABASE ?? "milo";
  const username = process.env.MONGO_USERNAME;
  const password = process.env.MONGO_PASSWORD;
  if (!username || !password) {
    throw new Error("MongoDB credentials are missing");
  }

  return `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${database}?authSource=${encodeURIComponent(database)}`;
}

export function databaseName(): string {
  return process.env.MONGO_DATABASE ?? "milo";
}

async function client(): Promise<MongoClient> {
  if (!globalMongo.miloMongoClient) {
    const instance = new MongoClient(mongoUri(), {
      appName: "milo",
      connectTimeoutMS: 10_000,
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 20,
      minPoolSize: 1,
      retryReads: true,
      retryWrites: true,
    });
    globalMongo.miloMongoClient = instance.connect().catch((error) => {
      globalMongo.miloMongoClient = undefined;
      throw error;
    });
  }
  return globalMongo.miloMongoClient;
}

export async function getDatabase(): Promise<Db> {
  return (await client()).db(databaseName());
}

export async function ensureDatabase(): Promise<Db> {
  const database = await getDatabase();
  if (!globalMongo.miloMongoReady) {
    globalMongo.miloMongoReady = (async () => {
      await Promise.all([
        database.collection("users").createIndex({ username: 1 }, { unique: true, name: "users_username_unique" }),
        database.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true, name: "sessions_token_unique" }),
        database.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "sessions_expiry_ttl" }),
        database.collection("records").createIndex({ username: 1, name: 1 }, { unique: true, name: "records_owner_name_unique" }),
        database.collection("records").createIndex({ updatedAt: -1 }, { name: "records_updated_at" }),
      ]);
    })().catch((error) => {
      globalMongo.miloMongoReady = undefined;
      throw error;
    });
  }
  await globalMongo.miloMongoReady;
  return database;
}
