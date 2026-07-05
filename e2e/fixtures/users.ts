import { config } from "dotenv";
import pg from "pg";
import bcrypt from "bcryptjs";

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

export async function createFixtureUser(options: {
  email: string;
  password: string;
  role: "user" | "admin";
  name?: string;
}) {
  const passwordHash = await bcrypt.hash(options.password, 10);
  await withClient((client) =>
    client.query(
      `INSERT INTO users (email, name, role, password_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET role = $3, password_hash = $4`,
      [options.email, options.name ?? null, options.role, passwordHash]
    )
  );
}

// Nur für gezielt per E-Mail angelegte Fixture-User — nie für den echten
// super_admin verwenden.
export async function deleteFixtureUser(email: string) {
  await withClient((client) =>
    client.query("DELETE FROM users WHERE email = $1 AND role <> 'super_admin'", [email])
  );
}

export function getSuperAdminCredentials() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("SUPER_ADMIN_EMAIL/SUPER_ADMIN_PASSWORD müssen in .env.local gesetzt sein.");
  }
  return { email, password };
}
