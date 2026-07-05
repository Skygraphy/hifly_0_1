import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers";

interface PayPalProfile {
  user_id: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

/**
 * PayPal ist kein in Auth.js eingebauter Provider. "Log in with PayPal"
 * spricht OpenID Connect, daher wird hier ein custom OIDC-Provider gegen
 * PayPals Endpunkte konfiguriert (Sandbox/Live je nach AUTH_PAYPAL_ENV).
 *
 * Achtung: die Endpunkt-URLs/Scopes sind Best-Effort nach PayPals
 * dokumentiertem OIDC-Schema und sollten gegen das Discovery-Dokument
 * (`{base}/.well-known/openid-configuration`) verifiziert werden, sobald
 * echte Sandbox-/Live-Credentials vorliegen.
 */
export function PayPalProvider(
  config: OAuthUserConfig<PayPalProfile>
): OAuthConfig<PayPalProfile> {
  const isLive = process.env.AUTH_PAYPAL_ENV === "live";
  const baseUrl = isLive
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

  return {
    id: "paypal",
    name: "PayPal",
    type: "oidc",
    issuer: baseUrl,
    authorization: {
      url: `${baseUrl}/signin/authorize`,
      params: { scope: "openid email profile" },
    },
    token: `${baseUrl}/v1/oauth2/token`,
    userinfo: `${baseUrl}/v1/identity/openidconnect/userinfo`,
    profile(profile) {
      return {
        id: profile.user_id,
        name: profile.name ?? profile.email,
        email: profile.email,
        image: profile.picture ?? null,
      };
    },
    style: { text: "#fff", bg: "#003087" },
    ...config,
  };
}
