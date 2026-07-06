export function AuthErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" data-testid="oauth-error" className="text-sm text-destructive">
      {message}
    </p>
  );
}
