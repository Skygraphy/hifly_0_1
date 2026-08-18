// Postgres-Fehlercode aus einem geworfenen DB-Fehler extrahieren —
// unabhängig davon, ob er direkt vom pg-Treiber kommt (err.code) oder von
// Drizzle in einen DrizzleQueryError verpackt wurde. Bei der hier genutzten
// node-postgres-Anbindung ist LETZTERES der tatsächliche Fall (per
// Verifikation bestätigt: err.code ist undefined, der echte Postgres-Code
// steckt in err.cause.code) — ein direkter `err.code === "23505"`-Vergleich
// (wie zuvor an mehreren Stellen im Code) griff dadurch NIE, echte
// Unique-/Check-Violations liefen als ungefangener 500er statt der
// vorgesehenen Fehlermeldung durch.
export function getPostgresErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  if ("code" in err && typeof err.code === "string") return err.code;
  if (
    "cause" in err &&
    err.cause &&
    typeof err.cause === "object" &&
    "code" in err.cause &&
    typeof err.cause.code === "string"
  ) {
    return err.cause.code;
  }
  return undefined;
}
