import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { PageHero, SectionTitle } from "@/components/site/Layout";
import { LeadForm, contactBasics } from "@/components/site/LeadForm";
import { courseCategories } from "@/lib/content";
export const Route = createFileRoute("/corporate")({
  head: () => ({ meta: [{ title: "Corporate & Institutional Training | Minds Digital Legacy" }, { name: "description", content: "Tailored technology training and digital transformation programs for organizations and institutions." }, { property: "og:title", content: "Corporate & Institutional Training | Minds Digital Legacy" }, { property: "og:description", content: "Tailored technology training and digital transformation programs for organizations and institutions." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => (
    <>
      <PageHero eyebrow="Corporate & institutional" title="Upskill your team, transform your organization" text="Customized training programs and technology solutions delivered at your premises, online or at MDL." />
      <section className="container-mdl grid gap-4 py-16 md:grid-cols-3">
        {["Needs assessment before training", "Programs tailored to your sector", "On-site, online or hybrid delivery", "Certificates of completion", "Post-training support", "Progress reports for management"].map((t) => <div key={t} className="flex gap-3 rounded-lg border border-border p-5"><Check className="h-5 w-5 shrink-0 text-accent" /><span className="font-medium">{t}</span></div>)}
      </section>
      <section className="bg-muted py-16"><div className="container-mdl max-w-3xl">
        <SectionTitle eyebrow="Request" title="Request a corporate program" />
        <LeadForm title="Program request" submitLabel="Send request" fields={[...contactBasics, { name: "organization", label: "Organization", required: true }, { name: "sector", label: "Organization type", type: "select", options: ["Business", "School / University", "Government", "NGO", "Healthcare", "Other"], required: true }, { name: "topic", label: "Training area", type: "select", options: courseCategories.map((c) => c.title), required: true }, { name: "participants", label: "Number of participants" }, { name: "details", label: "Goals and details", type: "textarea" }]} />
      </div></section>
    </>
  ),
});
