import { createFileRoute } from "@tanstack/react-router";
import { PageHero } from "@/components/site/Layout";
import { projects } from "@/lib/content";
export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio & Projects | Minds Digital Legacy" },
      {
        name: "description",
        content: "Examples of the systems, websites and training programs MDL delivers.",
      },
      { property: "og:title", content: "Portfolio & Projects | Minds Digital Legacy" },
      {
        property: "og:description",
        content: "Examples of the systems, websites and training programs MDL delivers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <>
      <PageHero
        eyebrow="Portfolio"
        title="Selected work"
        text="Examples of the kind of solutions and programs we deliver across sectors."
      />
      <section className="container-mdl grid gap-5 py-16 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <article
            key={p.title}
            className="rounded-xl border border-border bg-card p-6 shadow-card"
          >
            <span className="eyebrow">{p.sector}</span>
            <h2 className="mt-2 text-xl font-bold text-primary">{p.title}</h2>
            <p className="mt-2 text-muted-foreground">{p.text}</p>
          </article>
        ))}
      </section>
    </>
  ),
});
