import { auth } from "@/auth";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { AuthErrorBanner } from "@/components/auth-error-banner";
import { getAuthErrorMessage } from "@/lib/auth-error-messages";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  const { error } = await searchParams;
  const errorMessage = getAuthErrorMessage(error);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#121212]">
      <AccountMenuSlot>
        <AccountMenu user={session?.user ?? null} />
      </AccountMenuSlot>
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff0a 1px, transparent 1px), linear-gradient(to bottom, #ffffff0a 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 60% 60% at 50% 50%, black 40%, transparent 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute h-[420px] w-[420px] rounded-full bg-[#FF7F50] opacity-[0.15] blur-[140px]"
        aria-hidden
      />
      <div className="relative flex flex-col items-center gap-4">
        <h1 className="text-7xl font-semibold tracking-tight text-[#edededfa] sm:text-8xl md:text-9xl">
          HiFly
        </h1>
        {errorMessage && (
          <div className="absolute top-full mt-6">
            <AuthErrorBanner message={errorMessage} />
          </div>
        )}
      </div>
    </main>
  );
}
