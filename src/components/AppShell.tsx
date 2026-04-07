import { Link, Outlet, useParams, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getCompetition } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Award,
  CalendarDays,
  Gavel,
  Home,
  ListOrdered,
  LogOut,
  Settings,
  Users,
} from "lucide-react";

export function AppShell() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { competitionId } = useParams<{ competitionId: string }>();
  const location = useLocation();
  const { data: competition } = useQuery({
    queryKey: ["competitions", competitionId],
    queryFn: () => getCompetition(competitionId!),
    enabled: !!competitionId,
  });

  const compTabs = competitionId
    ? [
        {
          to: `/competitions/${competitionId}/competitors`,
          label: "Competitors",
          icon: Users,
        },
        {
          to: `/competitions/${competitionId}/judges`,
          label: "Judges",
          icon: Gavel,
        },
        {
          to: `/competitions/${competitionId}/prelim`,
          label: "Prelim",
          icon: ListOrdered,
        },
        {
          to: `/competitions/${competitionId}/final`,
          label: "Final",
          icon: Award,
        },
        {
          to: `/competitions/${competitionId}/settings`,
          label: "Settings",
          icon: Settings,
        },
      ]
    : [];

  const isEventsActive = location.pathname === "/events" || location.pathname.startsWith("/events/");

  return (
    <div className="no-print flex min-h-screen bg-background">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-muted/25">
        <div className="flex items-start justify-between gap-2 border-b border-border p-4">
          <Link
            to="/"
            className="font-display text-lg font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
            title="Home"
          >
            Swing Score
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 h-8 w-8"
            title="Sign out"
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        <nav className="flex flex-col gap-0.5 p-2">
          <Link
            to="/"
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              location.pathname === "/"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            )}
          >
            <Home className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Home
          </Link>
          <Link
            to="/events"
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isEventsActive && !competitionId
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            )}
          >
            <CalendarDays className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Events
          </Link>
          {competition && compTabs.length > 0 && (
            <>
              <div
                className="mx-1 mt-3 rounded-md border border-border/60 bg-background/80 px-2.5 py-2 text-xs font-medium text-muted-foreground shadow-sm"
                title={competition.name}
              >
                <span className="line-clamp-2 leading-snug">{competition.name}</span>
              </div>
              {compTabs.map((tab) => {
                const isActive =
                  location.pathname === tab.to ||
                  (tab.to !== `/competitions/${competitionId}` && location.pathname.startsWith(tab.to + "/"));
                const Icon = tab.icon;
                return (
                  <Link
                    key={tab.to}
                    to={tab.to}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                    {tab.label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto bg-gradient-to-b from-background to-muted/20">
        <Outlet />
      </main>
    </div>
  );
}
