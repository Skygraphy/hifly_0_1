export default function Home() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#121212]">
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
        className="pointer-events-none absolute h-[420px] w-[420px] rounded-full bg-[#3ecf8e] opacity-[0.15] blur-[140px]"
        aria-hidden
      />
      <h1 className="relative text-7xl font-semibold tracking-tight text-[#edededfa] sm:text-8xl md:text-9xl">
        HiFly
      </h1>
    </main>
  );
}
