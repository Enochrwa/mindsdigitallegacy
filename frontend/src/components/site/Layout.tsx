import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import logo from "@/assets/mdl-logo.jpeg.asset.json";
import { Button } from "@/components/ui/button";
import { nav } from "@/lib/content";
import { useSession } from "@/lib/session";

export function Logo() {
  return (
    <Link to="/" className="flex items-center" aria-label="Minds Digital Legacy home">
      <span className="block h-12 w-28 overflow-hidden rounded-md bg-background">
        <img src={logo.url} alt="MDL logo" className="h-full w-full scale-[1.7] object-cover object-[50%_42%]" />
      </span>
    </Link>
  );
}

function AccountLink({ onClick }: { onClick?: () => void }) {
  const session = useSession();
  // While loading (and on the server) show the sign-in link, so markup never depends on the cookie.
  const signedIn = session.status === "authenticated";
  return (
    <Link to={signedIn ? "/account" : "/login"} onClick={onClick} className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 hover:text-primary">
      {signedIn ? "My account" : "Sign in"}
    </Link>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="container-mdl flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 hover:text-primary" activeProps={{ className: "text-primary font-semibold" }}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <AccountLink />
          <Button asChild variant="gold"><Link to="/contact">Contact us</Link></Button>
        </div>
        <button className="lg:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu">{open ? <X /> : <Menu />}</button>
      </div>
      {open && (
        <nav className="container-mdl flex flex-col gap-1 pb-4 lg:hidden">
          {[...nav, { to: "/contact", label: "Contact" } as const].map((n) => (
            <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="rounded-md px-3 py-2 font-medium hover:bg-muted">{n.label}</Link>
          ))}
          <AccountLink onClick={() => setOpen(false)} />
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="container-mdl grid gap-10 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="font-display text-2xl font-bold">Minds Digital <span className="text-accent">Legacy</span></p>
          <p className="mt-3 max-w-sm text-primary-foreground/70">Empowering Digital Skills, Simplifying Your Daily Work.</p>
        </div>
        <div>
          <p className="eyebrow mb-3">Explore</p>
          <ul className="space-y-2 text-sm text-primary-foreground/80">
            {nav.slice(0, 4).map((n) => <li key={n.to}><Link to={n.to} className="hover:text-accent">{n.label}</Link></li>)}
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-3">Get involved</p>
          <ul className="space-y-2 text-sm text-primary-foreground/80">
            {nav.slice(4).map((n) => <li key={n.to}><Link to={n.to} className="hover:text-accent">{n.label}</Link></li>)}
            <li><Link to="/contact" className="hover:text-accent">Contact</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-primary-foreground/10 py-5 text-center text-xs text-primary-foreground/60">© {new Date().getFullYear()} Minds Digital Legacy (MDL). Kigali, Rwanda. · <Link to="/privacy" className="underline hover:text-accent">Privacy notice</Link></div>
    </footer>
  );
}

export function PageHero({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <section className="bg-primary text-primary-foreground">
      <div className="container-mdl py-16 md:py-20">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-bold md:text-5xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-lg text-primary-foreground/75">{text}</p>
      </div>
    </section>
  );
}

export function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="mb-10 max-w-2xl">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-bold text-primary md:text-4xl">{title}</h2>
      {text && <p className="mt-3 text-muted-foreground">{text}</p>}
    </div>
  );
}
