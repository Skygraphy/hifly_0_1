import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const { Client } = pg;

async function withClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function deleteAppSetting(key: string) {
  await withClient((client) => client.query("DELETE FROM app_settings WHERE key = $1", [key]));
}
