import { createFileRoute } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { PageHero } from "@/components/site/Layout";
import { LeadForm, contactBasics } from "@/components/site/LeadForm";
export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Us | Minds Digital Legacy" },
      {
        name: "description",
        content:
          "Get in touch with Minds Digital Legacy for services, training, internships or partnerships.",
      },
      { property: "og:title", content: "Contact Us | Minds Digital Legacy" },
      {
        property: "og:description",
        content:
          "Get in touch with Minds Digital Legacy for services, training, internships or partnerships.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <>
      <PageHero
        eyebrow="Contact"
        title="Let's talk"
        text="Questions about services, courses, internships or partnerships? Send us a message."
      />
      <section className="container-mdl grid gap-10 py-16 lg:grid-cols-3">
        <div>
          <div className="flex gap-3">
            <MapPin className="h-6 w-6 text-accent" />
            <div>
              <p className="font-bold text-primary">Location</p>
              <p className="text-muted-foreground">Kigali, Rwanda</p>
            </div>
          </div>
        </div>
        <div className="lg:col-span-2">
          <LeadForm
            form="contact"
            title="Send a message"
            submitLabel="Send message"
            fields={[
              ...contactBasics,
              {
                name: "subject",
                label: "Subject",
                type: "select",
                options: [
                  "Services",
                  "Academy",
                  "Internships",
                  "Corporate training",
                  "Partnership",
                  "Other",
                ],
                required: true,
              },
              { name: "message", label: "Message", type: "textarea", required: true },
            ]}
          />
        </div>
      </section>
    </>
  ),
});
