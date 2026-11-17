import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck, GraduationCap, Briefcase, ShieldCheck, UserCheck } from "lucide-react";
import { PageHero, SectionTitle } from "@/components/site/Layout";
import { LeadForm } from "@/components/site/LeadForm";
import { contactBasics } from "@/components/site/leadFields";
import { PostingCard } from "@/components/internships/PostingCard";
import { departments } from "@/lib/content";
import { usePostings } from "@/lib/internships";

const DESCRIPTION =
  "Apply for supervised academic and professional internships at Minds Digital Legacy.";

export const Route = createFileRoute("/internships/")({
  head: () => ({
    meta: [
      { title: "Internship Portal | Minds Digital Legacy" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Internship Portal | Minds Digital Legacy" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InternshipsPage,
});

const STEPS = [
  {
    title: "Apply",
    text: "Pick an open internship and tell us about yourself. It takes about ten minutes.",
  },
  {
    title: "We review",
    text: "Our team reads every application. You can follow its status in your account.",
  },
  {
    title: "Offer and agreement",
    text: "If we offer you a place, you read and accept the intern agreement.",
  },
  { title: "Placement", text: "We confirm your supervisor and dates, and your internship begins." },
];

function InternshipsPage() {
  const postings = usePostings();
  return (
    <>
      <PageHero
        eyebrow="Internships"
        title="Gain real experience on real projects"
        text="Supervised internships for students and young graduates. Every intern has a named supervisor and a clear learning plan."
      />

      <section className="container-mdl py-16" aria-labelledby="open-heading">
        <SectionTitle eyebrow="Open now" title="Internships you can apply for" />
        <h2 id="open-heading" className="sr-only">
          Open internships
        </h2>
        {postings.isPending && (
          <p role="status" className="text-muted-foreground">
            Loading internships…
          </p>
        )}
        {postings.isError && (
          <p role="alert" className="rounded-md border border-border bg-muted p-4 text-sm">
            We could not load the internships right now. Please try again in a moment.
          </p>
        )}
        {postings.data && postings.data.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <p className="font-semibold text-primary">No internships are open at the moment.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              We only open a place when we have a suitable project and a supervisor. Tell us your
              interest below and we will contact you when something opens.
            </p>
          </div>
        )}
        {postings.data && postings.data.length > 0 && (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {postings.data.map((p) => (
              <PostingCard key={p.id} posting={p} />
            ))}
          </div>
        )}
      </section>

      <section className="bg-muted py-16">
        <div className="container-mdl">
          <SectionTitle eyebrow="How it works" title="From application to placement" />
          <ol className="grid gap-5 md:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-border bg-card p-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <h3 className="mt-3 font-bold text-primary">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="container-mdl grid gap-6 py-16 md:grid-cols-2">
        <div className="rounded-xl border border-border p-8 shadow-card">
          <GraduationCap className="h-8 w-8 text-accent" aria-hidden />
          <h2 className="mt-4 text-2xl font-bold text-primary">Academic internship</h2>
          <p className="mt-3 text-muted-foreground">
            For students completing required internship periods, with supervision and an evaluation
            report for your institution where your school asks for one.
          </p>
        </div>
        <div className="rounded-xl border border-border p-8 shadow-card">
          <Briefcase className="h-8 w-8 text-accent" aria-hidden />
          <h2 className="mt-4 text-2xl font-bold text-primary">Professional internship</h2>
          <p className="mt-3 text-muted-foreground">
            For graduates and career changers building workplace experience, portfolio projects and
            career readiness.
          </p>
        </div>
      </section>

      <section className="container-mdl pb-16">
        <SectionTitle eyebrow="Our promises" title="What you can count on" />
        <ul className="grid gap-5 md:grid-cols-3">
          <li className="rounded-xl border border-border p-6">
            <UserCheck className="h-6 w-6 text-accent" aria-hidden />
            <p className="mt-3 font-semibold text-primary">A named supervisor</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We never place an intern without one, and we limit how many interns each supervisor
              guides.
            </p>
          </li>
          <li className="rounded-xl border border-border p-6">
            <ClipboardCheck className="h-6 w-6 text-accent" aria-hidden />
            <p className="mt-3 font-semibold text-primary">Honest expectations</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Applying does not guarantee a place and an internship is not a promise of a job.
            </p>
          </li>
          <li className="rounded-xl border border-border p-6">
            <ShieldCheck className="h-6 w-6 text-accent" aria-hidden />
            <p className="mt-3 font-semibold text-primary">Safeguards for young people</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Applicants under 18 need a verified parent or guardian before any placement starts.
            </p>
          </li>
        </ul>
      </section>

      <section className="bg-muted py-16">
        <div className="container-mdl max-w-3xl">
          <SectionTitle eyebrow="Stay in touch" title="Nothing open, or not ready yet?" />
          <p className="mb-6 text-muted-foreground">
            Tell us what you are interested in. This is not an application, but it helps us plan
            future internships.
          </p>
          <LeadForm
            form="internships"
            title="Your interest"
            submitLabel="Send my interest"
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
  );
}
