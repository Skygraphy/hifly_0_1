"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export async function signInWithCredentials(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    // Next.js' redirect()-Mechanismus wirft intern — das darf nicht als
    // Login-Fehler abgefangen werden, sonst bricht der Redirect nach
    // erfolgreichem Login.
    if (error instanceof AuthError) {
      return "Ungültige E-Mail oder Passwort.";
    }
    throw error;
  }
}

export async function signInWithProvider(provider: "google" | "apple" | "paypal") {
  await signIn(provider, { redirectTo: "/dashboard" });
}
