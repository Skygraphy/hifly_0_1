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

export async function getRegionIdByName(name: string): Promise<string> {
  return withClient(async (client) => {
    const result = await client.query<{ id: string }>("SELECT id FROM regions WHERE name = $1 LIMIT 1", [name]);
    if (result.rows.length === 0) {
      throw new Error(`Keine regions-Zeile mit name = "${name}" gefunden.`);
    }
    return result.rows[0].id;
  });
}
