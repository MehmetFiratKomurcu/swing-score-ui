import { Link, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ClipboardList,
  Download,
  Layers,
  LogOut,
  Mail,
  Music2,
  Printer,
  ShieldCheck,
  Users,
  Vote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

const CONTACT_EMAIL = "mehmetfiratkomurcu@hotmail.com";

const mailtoHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  "Swing Score — competition access"
)}&body=${encodeURIComponent(
  "Hi,\n\nI'm interested in using Swing Score.\n\nEvent name:\nApproximate date:\nNumber of competitions:\n\nThanks!"
)}`;

const whyItems = [
  {
    title: "One workflow end to end",
    body: "Events, divisions, rosters, judges, prelims, finals, and exports — without switching tools mid-tournament.",
  },
  {
    title: "Built for real divisions",
    body: "Mix & Match (random partner), fixed partner, and solo — the formats you use for Lindy Hop, solo jazz, and other swing dance contests.",
  },
  {
    title: "Judge-aware prelims",
    body: "Assign judges to prelim and final. For Mix & Match, scope ballots to lead vs follow so scoring matches the floor.",
  },
  {
    title: "Print-ready and archivable",
    body: "Judge sheets and finalist / results print views, plus CSV and XLSX export for announcements and records.",
  },
];

const featureGroups = [
  {
    title: "Events & divisions",
    icon: CalendarDays,
    bullets: [
      "Multiple events by year, multiple competitions per event",
      "Division types and manual or automatic competitor numbers",
    ],
  },
  {
    title: "Rosters & judges",
    icon: Users,
    bullets: [
      "Competitors with lead, follow, or solo roles — CSV import and templates",
      "Event-level judge pool, assigned per competition and round",
      "Import judges from spreadsheet where you need speed",
    ],
  },
  {
    title: "Preliminary round",
    icon: Vote,
    bullets: [
      "Heat count, yes and alternate counts, optional ranked alternates",
      "Generate or re-randomize heats; manual heat layout when you want control",
      "Digital scoring, results with cut lines, separate lead/follow rankings for Mix & Match",
      "Advance dancers to the final from results",
    ],
  },
  {
    title: "Final round",
    icon: Music2,
    bullets: [
      "Partnership setup for Mix & Match where applicable",
      "Final judge ranks, placements, print views, downloadable export",
    ],
  },
];

export default function LandingPage() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const isSignedIn = Boolean(token);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/80 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <span className="font-display text-lg font-semibold tracking-tight">Swing Score</span>
          <div className="flex items-center gap-2">
            {isSignedIn ? (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <a href={mailtoHref}>Get access</a>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/events">Events</Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => {
                    logout();
                    navigate("/", { replace: true });
                  }}
                >
                  <LogOut className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <a href={mailtoHref}>Get access</a>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/login">Sign in</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-border/60">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -20%, hsl(var(--primary) / 0.25), transparent), radial-gradient(ellipse 60% 40% at 100% 0%, hsl(var(--primary) / 0.12), transparent)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-20 md:py-28">
          <div className="max-w-2xl">
            <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
              Run prelims and finals with clarity.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground md:text-xl">
              Replace scattered spreadsheets and paper with one place for heats, judge scoring, cuts, placements, and
              exports — built for swing organizers running anything from Jack &amp; Jill and strictly divisions to solo
              jazz showcases.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              {isSignedIn ? (
                <Button size="lg" asChild>
                  <Link to="/events">Go to your events</Link>
                </Button>
              ) : (
                <Button size="lg" asChild>
                  <Link to="/login">Sign in</Link>
                </Button>
              )}
              <Button size="lg" variant="outline" asChild>
                <a href={mailtoHref}>
                  <Mail className="mr-2 h-4 w-4" aria-hidden />
                  Get access
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <h2 className="text-center font-display text-2xl font-semibold tracking-tight md:text-3xl">
          Why Swing Score
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
          Less chaos behind the table — so organizers and judges can focus on the dancing.
        </p>
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {whyItems.map((item) => (
            <li
              key={item.title}
              className="rounded-xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <h2 className="text-center font-display text-2xl font-semibold tracking-tight md:text-3xl">
            What you can do
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
            Features tied to how the app actually runs your event today.
          </p>
          <div className="mt-12 grid gap-8 md:grid-cols-2">
            {featureGroups.map((group) => (
              <div
                key={group.title}
                className="flex gap-4 rounded-xl border border-border bg-background p-6 shadow-sm"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <group.icon className="h-6 w-6" aria-hidden />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{group.title}</h3>
                  <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {group.bullets.map((b) => (
                      <li key={b} className="flex gap-2">
                        <Layers className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" aria-hidden />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Printer className="h-4 w-4" aria-hidden /> Print views for judges and finals
            </span>
            <span className="inline-flex items-center gap-2">
              <Download className="h-4 w-4" aria-hidden /> CSV &amp; XLSX export
            </span>
            <span className="inline-flex items-center gap-2">
              <ClipboardList className="h-4 w-4" aria-hidden /> Structured scoring data
            </span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-lg">
          <h2 className="font-display text-2xl font-semibold">Pricing</h2>
          <p className="mt-2 text-4xl font-bold tracking-tight text-primary">$5</p>
          <p className="text-sm font-medium text-muted-foreground">per competition (division)</p>
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
            There is no self-service signup. After payment, we create your account and you sign in with the credentials
            we send you. Use &quot;Get access&quot; below to reach us.
          </p>
          <Button className="mt-6" asChild>
            <a href={mailtoHref}>
              <Mail className="mr-2 h-4 w-4" aria-hidden />
              Email to get access
            </a>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border bg-muted/20">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row">
          <div className="text-center sm:text-left">
            <p className="font-display font-semibold">Swing Score</p>
            <p className="text-sm text-muted-foreground">
              Prelim and final scoring for Lindy Hop, solo jazz, and swing dance events.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
            {isSignedIn ? (
              <Link to="/events" className="text-primary hover:underline">
                Events
              </Link>
            ) : (
              <Link to="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            )}
            <a href={mailtoHref} className="text-primary hover:underline">
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
