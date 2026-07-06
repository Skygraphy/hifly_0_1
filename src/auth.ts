import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { authConfig } from "@/auth.config";
import { PayPalProvider } from "@/lib/auth-providers/paypal";
import { isOAuthSignInAllowed } from "@/lib/authorization";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Erlaubt, dass ein Google-Login automatisch mit einem bestehenden
      // User gleicher E-Mail verknüpft wird (z.B. einem per Credentials
      // angelegten Account). Vertretbar, weil Google die E-Mail verifiziert
      // ausliefert — anders als bei Providern ohne Verified-E-Mail-Garantie.
      allowDangerousEmailAccountLinking: true,
    }),
    Apple({
      clientId: process.env.AUTH_APPLE_ID,
      clientSecret: process.env.AUTH_APPLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    PayPalProvider({
      clientId: process.env.AUTH_PAYPAL_ID,
      clientSecret: process.env.AUTH_PAYPAL_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        // Kein User, oder ein reiner OAuth-Account ohne Passwort: ablehnen,
        // statt gegen einen leeren Hash zu vergleichen.
        if (!user || !user.passwordHash) {
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    // authorized + session kommen aus authConfig (auch von der Middleware
    // genutzt); jwt braucht den Drizzle-Adapter-Kontext und lebt nur hier.
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (account?.provider !== "credentials" && user.email) {
        const [existing] = await db
          .select({ role: users.role })
          .from(users)
          .where(eq(users.email, user.email))
          .limit(1);

        if (!isOAuthSignInAllowed(existing?.role)) {
          return "/login?error=SuperAdminOAuthDisabled";
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
  },
});
