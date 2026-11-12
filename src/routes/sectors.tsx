import { createFileRoute } from "@tanstack/react-router";
import { PageHero } from "@/components/site/Layout";
import { sectors } from "@/lib/content";
export const Route = createFileRoute("/sectors")({
  head: () => ({ meta: [{ title: "Industries & Sectors | Minds Digital Legacy" }, { name: "description", content: "MDL technology solutions for schools, SMEs, government, healthcare, agriculture and NGOs." }, { property: "og:title", content: "Industries & Sectors | Minds Digital Legacy" }, { property: "og:description", content: "MDL technology solutions for schools, SMEs, government, healthcare, agriculture and NGOs." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => (
    <>
      <PageHero eyebrow="Industries" title="Multi-sector solutions" text="Every sector works differently. We tailor systems, training and support to each one." />
      <section className="container-mdl grid gap-5 py-16 md:grid-cols-2 lg:grid-cols-3">
        {sectors.map((s) => <div key={s.title} className="rounded-xl border border-border bg-card p-7 shadow-card"><s.icon className="h-9 w-9 text-accent" /><h2 className="mt-4 text-xl font-bold text-primary">{s.title}</h2><p className="mt-2 text-muted-foreground">{s.text}</p></div>)}
      </section>
    </>
  ),
});
