import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { signInWithProvider } from "./actions";
import { CredentialsForm } from "./CredentialsForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#121212] p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Anmelden</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <CredentialsForm />

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            oder
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col gap-2">
            <form action={signInWithProvider.bind(null, "google")}>
              <Button type="submit" variant="outline" className="w-full">
                Mit Google anmelden
              </Button>
            </form>
            <form action={signInWithProvider.bind(null, "apple")}>
              <Button type="submit" variant="outline" className="w-full">
                Mit Apple anmelden
              </Button>
            </form>
            <form action={signInWithProvider.bind(null, "paypal")}>
              <Button type="submit" variant="outline" className="w-full">
                Mit PayPal anmelden
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
