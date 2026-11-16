import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/site/Layout";
import { pillars, services, sectors } from "@/lib/content";
import { Pattern } from "@/components/brand/Pattern";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Minds Digital Legacy (MDL) | Technology, Training & Internships" },
      {
        name: "description",
        content:
          "MDL empowers individuals, businesses and institutions in Rwanda with technology solutions, digital skills training and internships.",
      },
      { property: "og:title", content: "Minds Digital Legacy (MDL)" },
      {
        property: "og:description",
        content: "Empowering Digital Skills, Simplifying Your Daily Work.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const NEEDED = 3;

/** A hands-on preview of the free-training loop: each friend you "add" lights more of the pattern. */
function UnlockDemo() {
  const [friends, setFriends] = useState(0);
  const done = friends >= NEEDED;
  return (
    <div className="relative min-h-[26rem] overflow-hidden rounded-3xl border border-primary-foreground/15 lg:min-h-[32rem]">
      <Pattern interactive cell={52} progress={friends / NEEDED} className="absolute inset-0" />
      <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-primary/95 p-5 text-primary-foreground shadow-2xl backdrop-blur sm:inset-x-6 sm:bottom-6">
        <p className="font-display text-lg font-semibold">
          {done ? "Courses unlocked." : "Try the unlock."}
        </p>
        <p className="mt-1 text-sm text-primary-foreground/75">
          {done
            ? "That is all it takes: three friends who verify their email."
            : `Invite ${NEEDED} friends and the free courses open for you. Add one and watch.`}
        </p>
        <div className="mt-4 flex items-center gap-4">
          <ol className="flex gap-2" aria-label="Friends added">
            {Array.from({ length: NEEDED }, (_, i) => (
              <li
                key={i}
                className={`grid h-9 w-9 rotate-45 place-items-center rounded-md border-2 transition-colors duration-300 ${i < friends ? "border-accent bg-accent text-accent-foreground" : "border-primary-foreground/30"}`}
              >
                {i < friends && <Check className="-rotate-45" size={16} strokeWidth={3} />}
              </li>
            ))}
          </ol>
          <p aria-live="polite" className="text-sm text-primary-foreground/80">
            {friends} of {NEEDED} friends joined
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {done ? (
            <>
              <Button asChild variant="gold">
                <Link to="/register">
                  Create your account <ArrowRight />
                </Link>
              </Button>
              <Button variant="onDark" onClick={() => setFriends(0)}>
                <RotateCcw /> Replay
              </Button>
            </>
          ) : (
            <Button variant="gold" onClick={() => setFriends((n) => n + 1)}>
              Add a friend
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

const tones = [
  "bg-primary text-primary-foreground md:col-span-4",
  "bg-accent/15 md:col-span-2",
  "bg-muted md:col-span-2",
  "border border-border bg-card md:col-span-4",
] as const;

function Home() {
  return (
    <>
      <section className="bg-primary text-primary-foreground">
        <div className="container-mdl grid items-center gap-12 py-14 md:py-20 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="animate-rise">
            <p className="eyebrow">Technology, training and internships</p>
            <h1 className="mt-5 text-4xl sm:text-5xl lg:text-[3.4rem]">
              Empowering Digital Skills, Simplifying Your Daily Work.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-primary-foreground/80">
              Minds Digital Legacy is a multi-sector technology company delivering digital
              solutions, practical training and professional development across Rwanda and beyond.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="gold" size="lg">
                <Link to="/academy">
                  Start learning free <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="onDark" size="lg">
                <Link to="/services">Request a service</Link>
              </Button>
            </div>
          </div>
          <UnlockDemo />
        </div>
      </section>

      <section className="container-mdl py-20">
        <SectionTitle eyebrow="What we do" title="Four pillars, one digital partner" />
        <div className="grid gap-4 md:grid-cols-6">
          {pillars.map((p, i) => (
            <Link
              key={p.title}
              to={p.to}
              className={`group relative flex min-h-48 flex-col justify-between rounded-3xl p-7 transition-transform duration-300 hover:-translate-y-1 ${tones[i % tones.length]}`}
            >
              <p.icon className="h-8 w-8 text-accent" />
              <div>
                <h3 className="mt-8 text-xl">{p.title}</h3>
                <p className="mt-2 max-w-md text-sm opacity-75">{p.text}</p>
              </div>
              <ArrowRight className="absolute right-6 top-6 h-5 w-5 opacity-0 transition-opacity group-hover:opacity-70" />
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-muted py-20">
        <div className="container-mdl grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <SectionTitle
              eyebrow="Services"
              title="Technology solutions that work"
              text="Built around how your team already works, then handed over with training so you are never locked in."
            />
            <Button asChild>
              <Link to="/services">See all services</Link>
            </Button>
          </div>
          <ul className="divide-y divide-border border-y border-border">
            {services.slice(0, 5).map((s) => (
              <li key={s.title} className="grid gap-1 py-5 sm:grid-cols-[auto_1fr] sm:gap-x-5">
                <s.icon className="h-6 w-6 text-primary sm:mt-1" />
                <div>
                  <h3 className="text-lg">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {s.items.slice(0, 3).join(", ")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="container-mdl py-20">
        <SectionTitle
          eyebrow="Sectors"
          title="Built for every sector"
          text="From classrooms to cooperatives, we adapt technology to how you actually work."
        />
        <ul className="flex flex-wrap gap-3">
          {sectors.map((s) => (
            <li
              key={s.title}
              className="flex items-center gap-2.5 rounded-full border border-border bg-card py-2.5 pl-4 pr-5 text-sm font-semibold transition-colors hover:border-accent hover:bg-accent/10"
            >
              <s.icon className="h-5 w-5 text-accent" />
              {s.title}
            </li>
          ))}
        </ul>
        <Button asChild variant="outline" className="mt-8">
          <Link to="/sectors">See how we work with each</Link>
        </Button>
      </section>

      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        <div className="absolute inset-0 opacity-40" aria-hidden="true">
          <Pattern cell={56} progress={0.4} />
        </div>
        <div className="container-mdl relative grid items-center gap-8 py-20 md:grid-cols-2">
          <div className="rounded-3xl bg-primary/90 p-8 backdrop-blur">
            <h2 className="text-3xl">Start your digital journey with MDL</h2>
            <p className="mt-4 text-primary-foreground/80">
              Flexible, practical courses. Supervised internships. Corporate programmes tailored to
              your team.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <Button asChild variant="gold" size="lg">
              <Link to="/internships">Apply for an internship</Link>
            </Button>
            <Button asChild variant="onDark" size="lg">
              <Link to="/contact">Talk to us</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
