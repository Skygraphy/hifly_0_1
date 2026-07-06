const AUTH_ERROR_MESSAGES: Record<string, string> = {
  SuperAdminOAuthDisabled:
    "Der super_admin-Account kann sich aus Sicherheitsgründen nur per Passwort anmelden.",
  OAuthAccountNotLinked:
    "Dieser Account ist noch nicht verknüpft. Bitte melde dich zuerst per Passwort an.",
  forbidden: "Du hast keine Berechtigung für diesen Bereich.",
  AccountBlocked: "Dieser Account wurde gesperrt. Bitte wende dich an einen Administrator.",
};

const FALLBACK_AUTH_ERROR_MESSAGE = "Anmeldung fehlgeschlagen. Bitte versuche es erneut.";

export function getAuthErrorMessage(error: string | undefined): string | null {
  if (!error) return null;
  return AUTH_ERROR_MESSAGES[error] ?? FALLBACK_AUTH_ERROR_MESSAGE;
}
