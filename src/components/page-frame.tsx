import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const maxWidthClass = {
  default: "max-w-4xl",
  wide: "max-w-6xl",
  full: "max-w-[1600px]",
} as const;

export function PageShell({
  children,
  maxWidth = "default",
  className,
}: {
  children: React.ReactNode;
  maxWidth?: keyof typeof maxWidthClass;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full px-4 py-8 sm:px-6", maxWidthClass[maxWidth], className)}>
      {children}
    </div>
  );
}

export function PageBackLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 h-8 gap-1 px-2 text-muted-foreground hover:text-foreground"
        asChild
      >
        <Link to={to}>
          <ChevronLeft className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          {children}
        </Link>
      </Button>
    </div>
  );
}

export type PageCrumb = { label: string; to?: string };

export function PageBreadcrumbs({ items }: { items: PageCrumb[] }) {
  return (
    <nav className="mb-6 flex flex-wrap items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-1">
          {i > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-border" aria-hidden /> : null}
          {item.to ? (
            <Link
              to={item.to}
              className="rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ) : (
            <span className="px-1.5 font-medium text-foreground">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {description != null && description !== false ? (
          <div className="text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function ErrorStateCard({
  title,
  message,
  backTo = "/events",
  backLabel = "Back to events",
}: {
  title?: string;
  message: string;
  backTo?: string;
  backLabel?: string;
}) {
  return (
    <PageShell>
      <Card className="border-destructive/25 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive">{title ?? "Something went wrong"}</CardTitle>
          <CardDescription className="text-destructive/90">{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link to={backTo}>{backLabel}</Link>
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}

export function MissingIdState({
  message = "This page needs a valid ID in the URL.",
  backTo = "/events",
  backLabel = "Go to events",
}: {
  message?: string;
  backTo?: string;
  backLabel?: string;
}) {
  return (
    <PageShell>
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="font-display text-lg">Cannot open this page</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link to={backTo}>{backLabel}</Link>
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}

export function PageLoadSkeleton({ variant = "detail" }: { variant?: "detail" | "table" | "minimal" }) {
  if (variant === "minimal") {
    return (
      <PageShell>
        <div className="space-y-4 py-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </PageShell>
    );
  }
  if (variant === "table") {
    return (
      <PageShell>
        <Skeleton className="mb-6 h-8 w-40" />
        <div className="mb-8 space-y-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </PageShell>
    );
  }
  return (
    <PageShell>
      <Skeleton className="mb-6 h-8 w-44" />
      <div className="mb-8 space-y-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-52 w-full rounded-xl" />
    </PageShell>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-gradient-to-b from-muted/40 to-muted/15 px-6 py-14 text-center",
        className
      )}
    >
      {Icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-6 w-6" aria-hidden />
        </div>
      ) : null}
      <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
