"use server";

import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { signIn } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

const POSTGRES_UNIQUE_VIOLATION = "23505";
const ALREADY_REGISTERED_ERROR = "Diese E-Mail ist bereits registriert.";

export async function registerWithCredentials(formData: FormData): Promise<string | undefined> {
  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  if (typeof email !== "string" || typeof password !== "string" || typeof confirmPassword !== "string") {
    return "Bitte alle Pflichtfelder ausfüllen.";
  }
  if (password.length < 8) {
    return "Das Passwort muss mindestens 8 Zeichen lang sein.";
  }
  if (password !== confirmPassword) {
    return "Die Passwörter stimmen nicht überein.";
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return ALREADY_REGISTERED_ERROR;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await db.insert(users).values({
      email,
      name: typeof name === "string" && name.trim() ? name.trim() : null,
      passwordHash,
      // Bewusst hart codiert, nie aus dem Formular übernommen — Selbst-
      // registrierung darf ausschließlich "user"-Accounts anlegen. Admin-
      // Rechte vergibt danach nur der super_admin (canChangeRole).
      role: "user",
    });
  } catch (err) {
    // Race Condition zum Existenz-Check oben: zwei gleichzeitige
    // Registrierungen mit derselben E-Mail — der DB-Unique-Constraint
    // fängt das ab, hier nur in dieselbe Fehlermeldung übersetzt.
    if (err && typeof err === "object" && "code" in err && err.code === POSTGRES_UNIQUE_VIOLATION) {
      return ALREADY_REGISTERED_ERROR;
    }
    throw err;
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    // Next.js' redirect()-Mechanismus wirft intern — das darf nicht als
    // Fehler abgefangen werden, sonst bricht der Redirect nach Erfolg.
    if (error instanceof AuthError) {
      return "Konto wurde angelegt, die automatische Anmeldung ist aber fehlgeschlagen. Bitte manuell einloggen.";
    }
    throw error;
  }
}
