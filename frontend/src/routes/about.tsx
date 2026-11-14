import { createFileRoute } from "@tanstack/react-router";
import { Eye, Target, Award, Users, Lightbulb, Shield } from "lucide-react";
import { PageHero, SectionTitle } from "@/components/site/Layout";
import { pillars } from "@/lib/content";
export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About MDL | Minds Digital Legacy" },
      {
        name: "description",
        content:
          "Learn about Minds Digital Legacy, our vision, mission and the four pillars of our work.",
      },
      { property: "og:title", content: "About MDL | Minds Digital Legacy" },
      {
        property: "og:description",
        content:
          "Learn about Minds Digital Legacy, our vision, mission and the four pillars of our work.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <>
      <PageHero
        eyebrow="About MDL"
        title="More than a training center"
        text="Minds Digital Legacy is a multi-sector technology and digital solutions company empowering people and organizations through practical technology."
      />
      <section className="container-mdl grid gap-6 py-16 md:grid-cols-2">
        <div className="rounded-xl border border-border p-8 shadow-card">
          <Eye className="h-8 w-8 text-accent" />
          <h2 className="mt-4 text-2xl font-bold text-primary">Our vision</h2>
          <p className="mt-3 text-muted-foreground">
            To empower individuals, businesses, educational institutions, and organizations through
            technology, practical digital skills, innovation, and professional development
            opportunities.
          </p>
        </div>
        <div className="rounded-xl border border-border p-8 shadow-card">
          <Target className="h-8 w-8 text-accent" />
          <h2 className="mt-4 text-2xl font-bold text-primary">Our mission</h2>
          <p className="mt-3 text-muted-foreground">
            To make technology accessible, useful, and impactful by providing innovative digital
            solutions, flexible technology training, and practical internship opportunities.
          </p>
        </div>
      </section>
      <section className="bg-muted py-16">
        <div className="container-mdl">
          <SectionTitle eyebrow="Our pillars" title="How we create impact" />
          <div className="grid gap-5 md:grid-cols-4">
            {pillars.map((p) => (
              <div key={p.title} className="rounded-xl bg-card p-6 shadow-card">
                <p.icon className="h-7 w-7 text-primary" />
                <h3 className="mt-3 font-bold">{p.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="container-mdl py-16">
        <SectionTitle eyebrow="Values" title="What guides us" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [Lightbulb, "Innovation"],
            [Award, "Excellence"],
            [Users, "Inclusion"],
            [Shield, "Integrity"],
          ].map(([I, t]) => {
            const Icon = I as typeof Award;
            return (
              <div
                key={t as string}
                className="flex items-center gap-3 rounded-lg border border-border p-5"
              >
                <Icon className="h-6 w-6 text-accent" />
                <span className="font-semibold">{t as string}</span>
              </div>
            );
          })}
        </div>
      </section>
    </>
  ),
});
