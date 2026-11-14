import { createFileRoute } from "@tanstack/react-router";
import { GraduationCap, Briefcase } from "lucide-react";
import { PageHero, SectionTitle } from "@/components/site/Layout";
import { LeadForm, contactBasics } from "@/components/site/LeadForm";
import { departments } from "@/lib/content";
export const Route = createFileRoute("/internships")({
  head: () => ({
    meta: [
      { title: "Internship Portal | Minds Digital Legacy" },
      {
        name: "description",
        content:
          "Apply for supervised academic and professional internships at Minds Digital Legacy.",
      },
      { property: "og:title", content: "Internship Portal | Minds Digital Legacy" },
      {
        property: "og:description",
        content:
          "Apply for supervised academic and professional internships at Minds Digital Legacy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <>
      <PageHero
        eyebrow="Internships"
        title="Gain real experience on real projects"
        text="Supervised internships for high-school students, university students and young graduates."
      />
      <section className="container-mdl grid gap-6 py-16 md:grid-cols-2">
        <div className="rounded-xl border border-border p-8 shadow-card">
          <GraduationCap className="h-8 w-8 text-accent" />
          <h2 className="mt-4 text-2xl font-bold text-primary">Academic internship</h2>
          <p className="mt-3 text-muted-foreground">
            For secondary, TVET and university students completing required internship periods, with
            supervision and evaluation reports for your institution.
          </p>
        </div>
        <div className="rounded-xl border border-border p-8 shadow-card">
          <Briefcase className="h-8 w-8 text-accent" />
          <h2 className="mt-4 text-2xl font-bold text-primary">Professional internship</h2>
          <p className="mt-3 text-muted-foreground">
            For graduates and young professionals building workplace experience, portfolio projects
            and career readiness.
          </p>
        </div>
      </section>
      <section className="container-mdl pb-16">
        <SectionTitle eyebrow="Departments" title="Where you can intern" />
        <div className="flex flex-wrap gap-2">
          {departments.map((d) => (
            <span
              key={d}
              className="rounded-full border border-border bg-muted px-4 py-2 text-sm font-medium"
            >
              {d}
            </span>
          ))}
        </div>
      </section>
      <section className="bg-muted py-16">
        <div className="container-mdl max-w-3xl">
          <SectionTitle eyebrow="Apply" title="Internship application" />
          <LeadForm
            form="internships"
            title="Your application"
            submitLabel="Submit application"
            fields={[
              ...contactBasics,
              {
                name: "type",
                label: "Internship type",
                type: "select",
                options: ["Academic", "Professional"],
                required: true,
              },
              { name: "institution", label: "School / university", required: true },
              { name: "program", label: "Field of study", required: true },
              {
                name: "department",
                label: "Preferred department",
                type: "select",
                options: departments,
                required: true,
              },
              {
                name: "duration",
                label: "Duration",
                type: "select",
                options: ["1 month", "2 months", "3 months", "6 months"],
              },
              {
                name: "motivation",
                label: "Why do you want to intern at MDL?",
                type: "textarea",
                required: true,
              },
            ]}
          />
        </div>
      </section>
    </>
  ),
});
