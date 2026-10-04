import { it } from "@/messages/it";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-gold text-4xl font-semibold tracking-tight">{it.site.name}</h1>
      <p className="text-foreground/80 text-lg">{it.site.tagline}</p>
      <p className="text-foreground/60 mt-6 text-sm">
        {it.placeholder.title} — {it.placeholder.description}
      </p>
    </main>
  );
}
