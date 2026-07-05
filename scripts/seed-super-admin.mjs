// Legt den einen erlaubten super_admin an (idempotent, sicher erneut ausführbar).
// Liest E-Mail/Passwort/Name aus .env.local, niemals aus Argumenten/Logs.
//
// Usage: node scripts/seed-super-admin.mjs
import { config } from "dotenv";
import pg from "pg";
import bcrypt from "bcryptjs";

config({ path: ".env.local", quiet: true });

const email = process.env.SUPER_ADMIN_EMAIL;
const password = process.env.SUPER_ADMIN_PASSWORD;
const name = process.env.SUPER_ADMIN_NAME ?? null;

if (!email || !password) {
  console.error("SUPER_ADMIN_EMAIL und SUPER_ADMIN_PASSWORD müssen in .env.local gesetzt sein.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();

  const { rows: existingSuperAdmins } = await client.query(
    "SELECT id, email FROM users WHERE role = 'super_admin'"
  );

  if (existingSuperAdmins.length > 0 && existingSuperAdmins[0].email !== email) {
    console.error(
      `Es existiert bereits ein super_admin (${existingSuperAdmins[0].email}). ` +
        "Es darf nur genau einen geben — Skript bricht ab, ohne etwas zu ändern."
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const { rows: existingUser } = await client.query(
    "SELECT id FROM users WHERE email = $1",
    [email]
  );

  if (existingUser.length > 0) {
    await client.query(
      "UPDATE users SET role = 'super_admin', password_hash = $1, name = COALESCE($2, name), updated_at = now() WHERE id = $3",
      [passwordHash, name, existingUser[0].id]
    );
    console.log(`super_admin aktualisiert: ${email}`);
  } else {
    await client.query(
      "INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, 'super_admin', $3)",
      [email, name, passwordHash]
    );
    console.log(`super_admin angelegt: ${email}`);
  }
} catch (err) {
  if (err.code === "23505") {
    console.error(
      "Unique-Constraint verletzt — es existiert bereits ein super_admin (DB-seitiger Backstop hat gegriffen)."
    );
  } else {
    console.error("Seed fehlgeschlagen:", err.message);
  }
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
