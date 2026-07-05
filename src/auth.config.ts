import type { NextAuthConfig } from "next-auth";
import { canAccessAdminArea, canManageUsers } from "@/lib/authorization";

/**
 * Edge-sicherer Teil der Auth.js-Konfiguration: kein `pg`/Drizzle-Adapter
 * hier, da die Middleware im Edge Runtime läuft und Node-native Module
 * (der Postgres-Treiber) dort nicht verfügbar sind. Die vollständige
 * Konfiguration mit Providern/Adapter lebt in `src/auth.ts`.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    // Der Credentials-Provider erzwingt JWT-Sessions (Auth.js unterstützt
    // keine "database"-Session-Strategie in Kombination mit Credentials).
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    // Muss auch hier (nicht nur in auth.ts) definiert sein: die Middleware
    // nutzt ihre eigene, leichte NextAuth-Instanz aus genau dieser Config.
    // Ohne diesen Callback würde die Middleware zwar ein gültiges JWT sehen,
    // aber `auth.user.role` wäre undefined, weil next-auth custom Claims
    // nicht automatisch auf die Session projiziert.
    async session({ session, token }) {
      if (token.id) session.user.id = token.id;
      if (token.role) session.user.role = token.role;
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const role = auth?.user?.role;

      if (pathname.startsWith("/admin/users")) {
        if (!auth?.user) return false;
        return canManageUsers(role) ? true : Response.redirect(new URL("/dashboard?error=forbidden", request.url));
      }

      if (pathname.startsWith("/admin")) {
        if (!auth?.user) return false;
        return canAccessAdminArea(role) ? true : Response.redirect(new URL("/dashboard?error=forbidden", request.url));
      }

      if (pathname.startsWith("/dashboard")) {
        return !!auth?.user;
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
