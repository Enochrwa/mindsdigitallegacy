import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/site/Layout";
import { pillars, services, sectors } from "@/lib/content";
import hero from "@/assets/hero-mdl.jpg";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Minds Digital Legacy (MDL) | Technology, Training & Internships" }, { name: "description", content: "MDL empowers individuals, businesses and institutions in Rwanda with technology solutions, digital skills training and internships." }, { property: "og:title", content: "Minds Digital Legacy (MDL)" }, { property: "og:description", content: "Empowering Digital Skills, Simplifying Your Daily Work." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Home,
});

function Home() {
  return (
    <>
      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        <img src={hero} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
        <div className="container-mdl relative grid gap-10 py-20 md:py-28 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <p className="eyebrow">Technology · Training · Internships</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight md:text-6xl">Empowering Digital Skills, <span className="text-accent">Simplifying Your Daily Work.</span></h1>
            <p className="mt-6 max-w-xl text-lg text-primary-foreground/80">Minds Digital Legacy is a multi-sector technology company delivering digital solutions, practical training and professional development across Rwanda and beyond.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="gold" size="lg"><Link to="/services">Request a service <ArrowRight /></Link></Button>
              <Button asChild variant="onDark" size="lg"><Link to="/academy">Explore courses</Link></Button>
            </div>
          </div>
        </div>
      </section>

      <section className="container-mdl py-20">
        <SectionTitle eyebrow="What we do" title="Four pillars, one digital partner" />
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p) => (
            <Link key={p.title} to={p.to} className="group rounded-xl border border-border bg-card p-6 shadow-card transition hover:-translate-y-1">
              <p.icon className="h-9 w-9 text-accent" />
              <h3 className="mt-4 text-lg font-bold text-primary">{p.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{p.text}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary group-hover:text-accent">Learn more <ArrowRight className="h-4 w-4" /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-muted py-20">
        <div className="container-mdl">
          <SectionTitle eyebrow="Services" title="Technology solutions that work" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {services.slice(0, 4).map((s) => (
              <div key={s.title} className="rounded-xl bg-card p-6 shadow-card"><s.icon className="h-7 w-7 text-primary" /><h3 className="mt-3 font-bold">{s.title}</h3><p className="mt-2 text-sm text-muted-foreground">{s.items.slice(0, 2).join(" · ")}</p></div>
            ))}
          </div>
          <Button asChild variant="default" className="mt-8"><Link to="/services">All services</Link></Button>
        </div>
      </section>

      <section className="container-mdl grid gap-12 py-20 lg:grid-cols-2">
        <div>
          <SectionTitle eyebrow="Sectors" title="Built for every sector" text="From classrooms to cooperatives, we adapt technology to how you actually work." />
          <Button asChild variant="outline"><Link to="/sectors">See sectors</Link></Button>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {sectors.map((s) => <li key={s.title} className="flex items-center gap-3 rounded-lg border border-border p-4"><s.icon className="h-6 w-6 text-accent" /><span className="font-semibold">{s.title}</span></li>)}
        </ul>
      </section>

      <section className="bg-primary text-primary-foreground">
        <div className="container-mdl grid items-center gap-8 py-16 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold">Start your digital journey with MDL</h2>
            <ul className="mt-5 space-y-2 text-primary-foreground/80">
              {["Flexible, practical courses", "Supervised internships", "Tailored corporate programs"].map((t) => <li key={t} className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-accent" />{t}</li>)}
            </ul>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <Button asChild variant="gold" size="lg"><Link to="/internships">Apply for internship</Link></Button>
            <Button asChild variant="onDark" size="lg"><Link to="/contact">Talk to us</Link></Button>
          </div>
        </div>
      </section>
    </>
  );
}
