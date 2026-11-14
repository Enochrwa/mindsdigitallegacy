import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { PageHero, SectionTitle } from "@/components/site/Layout";
import { LeadForm, contactBasics } from "@/components/site/LeadForm";
import { courseCategories, allCourses } from "@/lib/content";
export const Route = createFileRoute("/academy")({
  head: () => ({
    meta: [
      { title: "MDL Digital Training Academy | Minds Digital Legacy" },
      {
        name: "description",
        content:
          "Practical, flexible courses in computer skills, programming, design, data and digital business.",
      },
      { property: "og:title", content: "MDL Digital Training Academy | Minds Digital Legacy" },
      {
        property: "og:description",
        content:
          "Practical, flexible courses in computer skills, programming, design, data and digital business.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <>
      <PageHero
        eyebrow="MDL Digital Academy"
        title="Learn practical digital skills"
        text="Flexible classes — in person, online or weekend — from your first computer lesson to advanced technology."
      />
      <section className="container-mdl grid gap-5 py-16 sm:grid-cols-2 lg:grid-cols-4">
        {courseCategories.map((c) => (
          <div key={c.title} className="rounded-xl border border-border bg-card p-6 shadow-card">
            <BookOpen className="h-7 w-7 text-accent" />
            <h2 className="mt-3 font-bold text-primary">{c.title}</h2>
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              {c.courses.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <section className="bg-muted py-16">
        <div className="container-mdl max-w-3xl">
          <SectionTitle eyebrow="Enroll" title="Register for a course" />
          <LeadForm
            form="academy"
            title="Course registration"
            submitLabel="Register"
            fields={[
              ...contactBasics,
              {
                name: "course",
                label: "Course",
                type: "select",
                options: allCourses,
                required: true,
              },
              {
                name: "mode",
                label: "Preferred mode",
                type: "select",
                options: ["In person", "Online", "Weekend"],
                required: true,
              },
              {
                name: "level",
                label: "Current level",
                type: "select",
                options: ["Beginner", "Intermediate", "Advanced"],
              },
              { name: "notes", label: "Anything we should know?", type: "textarea" },
            ]}
          />
        </div>
      </section>
    </>
  ),
});
