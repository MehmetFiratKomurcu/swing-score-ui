import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { getEvents } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EventForm } from "@/components/EventForm";
import {
  EmptyState,
  ErrorStateCard,
  PageHeader,
  PageLoadSkeleton,
  PageShell,
} from "@/components/page-frame";

export default function EventListPage() {
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["events"],
    queryFn: getEvents,
  });

  if (isLoading) {
    return <PageLoadSkeleton variant="table" />;
  }

  if (error) {
    return (
      <ErrorStateCard
        message={error instanceof Error ? error.message : "Unknown error"}
        title="Could not load events"
      />
    );
  }

  const events = data?.events ?? [];

  return (
    <PageShell>
      <PageHeader
        title="Events"
        description="Create and manage your tournaments"
        actions={
          !showForm ? <Button onClick={() => setShowForm(true)}>Create event</Button> : undefined
        }
      />

      {showForm ? (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>New event</CardTitle>
            <CardDescription>Create an event to add competitions.</CardDescription>
          </CardHeader>
          <CardContent>
            <EventForm
              onSuccess={() => {
                setShowForm(false);
                refetch();
                toast.success("Event created");
              }}
              onCancel={() => setShowForm(false)}
            />
          </CardContent>
        </Card>
      ) : null}

      {events.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={CalendarDays}
              title="No events yet"
              description="Start by creating your first event. You can add competitions, judges, and run prelims from there."
              action={<Button onClick={() => setShowForm(true)}>Create first event</Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead className="w-24">Year</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="font-medium">
                    <Link
                      to={`/events/${event.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {event.name}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{event.year}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </PageShell>
  );
}
