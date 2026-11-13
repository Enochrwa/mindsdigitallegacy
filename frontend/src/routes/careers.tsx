import { createFileRoute } from "@tanstack/react-router";
import { PageHero, SectionTitle } from "@/components/site/Layout";
import { LeadForm, contactBasics } from "@/components/site/LeadForm";
import { departments } from "@/lib/content";
export const Route = createFileRoute("/careers")({
  head: () => ({ meta: [{ title: "Careers | Minds Digital Legacy" }, { name: "description", content: "Join the Minds Digital Legacy team as a trainer, developer or technology professional." }, { property: "og:title", content: "Careers | Minds Digital Legacy" }, { property: "og:description", content: "Join the Minds Digital Legacy team as a trainer, developer or technology professional." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => (
    <>
      <PageHero eyebrow="Careers" title="Build a digital legacy with us" text="We look for trainers, developers, designers and support specialists who care about practical impact." />
      <section className="container-mdl max-w-3xl py-16">
        <SectionTitle eyebrow="Open application" title="No listed roles right now — tell us about you" />
        <LeadForm form="careers" title="Career interest" submitLabel="Send" fields={[...contactBasics, { name: "area", label: "Area of interest", type: "select", options: departments, required: true }, { name: "portfolio", label: "LinkedIn / portfolio link" }, { name: "about", label: "Your experience", type: "textarea", required: true }]} />
      </section>
    </>
  ),
});
