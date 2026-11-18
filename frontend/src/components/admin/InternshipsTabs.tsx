import { Link } from "@tanstack/react-router";

const TABS = [
  { to: "/admin/internships", label: "Postings" },
  { to: "/admin/internships/applications", label: "Applications" },
  { to: "/admin/internships/placements", label: "Placements" },
] as const;

/** Section switcher shared by the three internship screens. */
export function InternshipsTabs() {
  return (
    <nav aria-label="Internships sections" className="mb-6 flex gap-1 border-b border-border">
      {TABS.map((t) => (
        <Link
          key={t.to}
          to={t.to}
          activeOptions={{ exact: true }}
          className="-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          activeProps={{ className: "border-accent text-foreground" }}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
