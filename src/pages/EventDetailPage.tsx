import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getEvent } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ErrorStateCard,
  PageBackLink,
  PageHeader,
  PageLoadSkeleton,
  PageShell,
  MissingIdState,
} from "@/components/page-frame";

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { data: event, isLoading, error } = useQuery({
    queryKey: ["events", eventId],
    queryFn: () => getEvent(eventId!),
    enabled: !!eventId,
  });

  if (!eventId) {
    return <MissingIdState message="Missing event ID in the URL." />;
  }

  if (isLoading) {
    return <PageLoadSkeleton />;
  }

  if (error || !event) {
    return (
      <ErrorStateCard
        message={error instanceof Error ? error.message : "Event not found"}
        title="Event not found"
      />
    );
  }

  return (
    <PageShell>
      <PageBackLink to="/events">Events</PageBackLink>
      <PageHeader
        title={event.name}
        description={`Year ${event.year} · Manage competitions and judges for this event.`}
      />
      <Card>
        <CardHeader>
          <CardTitle>Next steps</CardTitle>
          <CardDescription>Open competitions to add divisions, or manage the shared judge pool for this festival.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to={`/events/${eventId}/competitions`}>View competitions</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/events/${eventId}/judges`}>Judges</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/events/${eventId}/settings`}>Settings</Link>
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}
