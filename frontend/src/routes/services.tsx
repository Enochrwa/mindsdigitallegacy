import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { PageHero, SectionTitle } from "@/components/site/Layout";
import { LeadForm, contactBasics } from "@/components/site/LeadForm";
import { services } from "@/lib/content";
export const Route = createFileRoute("/services")({
  head: () => ({ meta: [{ title: "Technology Services | Minds Digital Legacy" }, { name: "description", content: "Software, websites, mobile apps, IT support, data, digital marketing and cybersecurity services by MDL." }, { property: "og:title", content: "Technology Services | Minds Digital Legacy" }, { property: "og:description", content: "Software, websites, mobile apps, IT support, data, digital marketing and cybersecurity services by MDL." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => (
    <>
      <PageHero eyebrow="Technology services" title="Digital solutions for real-world work" text="From custom software to IT support, we design, build and maintain technology that simplifies your daily operations." />
      <section className="container-mdl grid gap-5 py-16 md:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => (
          <div key={s.title} className="rounded-xl border border-border bg-card p-6 shadow-card"><s.icon className="h-8 w-8 text-accent" /><h2 className="mt-4 text-xl font-bold text-primary">{s.title}</h2>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">{s.items.map((i) => <li key={i} className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-accent" />{i}</li>)}</ul></div>
        ))}
      </section>
      <section id="request" className="bg-muted py-16"><div className="container-mdl max-w-3xl">
        <SectionTitle eyebrow="Get started" title="Request a service" />
        <LeadForm title="Service request" submitLabel="Send request" fields={[...contactBasics, { name: "organization", label: "Organization" }, { name: "service", label: "Service needed", type: "select", options: services.map((s) => s.title), required: true }, { name: "budget", label: "Estimated budget (RWF)" }, { name: "details", label: "Project details", type: "textarea", required: true }]} />
      </div></section>
    </>
  ),
});
