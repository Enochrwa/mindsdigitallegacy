import { createFileRoute } from "@tanstack/react-router";
import { PageHero } from "@/components/site/Layout";
import { PRIVACY_NOTICE_VERSION } from "@/lib/api";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Notice | Minds Digital Legacy" },
      {
        name: "description",
        content: "How Minds Digital Legacy collects, uses, stores and protects your personal data.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: () => (
    <>
      <PageHero
        eyebrow="Privacy"
        title="Privacy notice"
        text={`Version ${PRIVACY_NOTICE_VERSION}. Draft pending legal review.`}
      />
      <section className="container-mdl prose max-w-3xl space-y-6 py-16 text-muted-foreground">
        <p className="rounded-md border border-accent/40 bg-accent/10 p-4 text-sm text-foreground">
          This notice is a working draft written to match Rwanda&apos;s Law No. 058/2021 on the
          protection of personal data and privacy. It has not yet been reviewed by a Rwandan lawyer,
          and MDL has not yet completed its registration with the National Cyber Security Authority.
          Do not rely on it as final.
        </p>
        <div>
          <h2 className="text-xl font-bold text-primary">Who we are</h2>
          <p className="mt-2">
            Minds Digital Legacy (MDL), Kigali, Rwanda, decides why and how your data is used (the
            data controller). A named data protection officer will be published here before launch.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-bold text-primary">What we collect and why</h2>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>Contact forms: your name, email, phone and message, to answer you.</li>
            <li>
              Course and internship interest: the above plus your age group and, if you are under
              16, a parent or guardian contact, so a guardian can give consent.
            </li>
            <li>
              Accounts: email, name, a salted hash of your password (never the password itself), and
              a record of the consents you gave.
            </li>
            <li>
              Security records: a shortened network address and the time of sign-ins and account
              changes, to detect abuse.
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-bold text-primary">Your consent</h2>
          <p className="mt-2">
            We ask for your consent to process your details for the purpose you submitted them.
            Marketing messages need a separate, optional consent, which is off by default. You can
            withdraw consent at any time.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-bold text-primary">Children</h2>
          <p className="mt-2">
            If you are under 16, an account stays inactive until a parent or guardian confirms by
            email.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-bold text-primary">How long we keep it</h2>
          <p className="mt-2">
            Contact and interest records are deleted automatically after 24 months (period to be
            confirmed with counsel). Account data is kept while your account exists and removed
            after you delete it.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-bold text-primary">Where it is stored and who sees it</h2>
          <p className="mt-2">
            The storage location is a pending decision; personal data must be stored in Rwanda
            unless the law allows otherwise. We do not sell your data. Only MDL staff who need it
            can see it.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-bold text-primary">Your rights</h2>
          <p className="mt-2">
            You can ask to see, correct, export or delete your data, and to object to its use.
            Signed-in users can export or delete their account themselves. Others can contact us.
          </p>
        </div>
      </section>
    </>
  ),
});
