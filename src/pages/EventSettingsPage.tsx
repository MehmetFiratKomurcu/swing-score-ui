import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getEvent, updateEvent } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ErrorStateCard,
  PageBackLink,
  PageHeader,
  PageLoadSkeleton,
  PageShell,
  MissingIdState,
} from "@/components/page-frame";

export default function EventSettingsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [year, setYear] = useState("");

  const { data: event, isLoading, error } = useQuery({
    queryKey: ["events", eventId],
    queryFn: () => getEvent(eventId!),
    enabled: !!eventId,
  });

  useEffect(() => {
    if (event) {
      setName(event.name);
      setYear(String(event.year));
    }
  }, [event]);

  const updateMutation = useMutation({
    mutationFn: (body: { name: string; year: number }) => updateEvent(eventId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events", eventId] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Event updated");
      navigate(`/events/${eventId}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update event"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const yearNum = parseInt(year, 10);
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (Number.isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
      toast.error("Year must be between 1900 and 2100");
      return;
    }
    updateMutation.mutate({ name: name.trim(), year: yearNum });
  };

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
        title="Could not load event"
      />
    );
  }

  return (
    <PageShell>
      <PageBackLink to={`/events/${eventId}`}>Back to event</PageBackLink>
      <PageHeader title="Event settings" description={event.name} />

      <Card>
        <CardHeader>
          <CardTitle>Event details</CardTitle>
          <CardDescription>Update the event name and year.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
            <div className="space-y-2">
              <Label htmlFor="event-name">Event name</Label>
              <Input
                id="event-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Event name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-year">Year</Label>
              <Input
                id="event-year"
                type="number"
                min={1900}
                max={2100}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="e.g. 2025"
              />
            </div>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </PageShell>
  );
}
