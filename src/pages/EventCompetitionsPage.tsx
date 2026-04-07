import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getEvent, getCompetitions, deleteCompetition } from "@/lib/api";
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
import { Trash2, Trophy } from "lucide-react";
import { CompetitionForm } from "@/components/CompetitionForm";
import {
  EmptyState,
  ErrorStateCard,
  PageBreadcrumbs,
  PageHeader,
  PageLoadSkeleton,
  PageShell,
  MissingIdState,
} from "@/components/page-frame";

const divisionLabel: Record<string, string> = {
  random_partner: "Random partner",
  fixed_partner: "Fixed partner",
  solo: "Solo Jazz",
};

export default function EventCompetitionsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const queryClient = useQueryClient();

  const { data: event, isLoading: eventLoading, error: eventError } = useQuery({
    queryKey: ["events", eventId],
    queryFn: () => getEvent(eventId!),
    enabled: !!eventId,
  });

  const { data, isLoading: compLoading, error: compError, refetch } = useQuery({
    queryKey: ["competitions", eventId],
    queryFn: () => getCompetitions(eventId!),
    enabled: !!eventId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCompetition(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitions", eventId] });
      toast.success("Competition deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete competition"),
  });

  const handleDeleteClick = (e: React.MouseEvent, comp: { id: string; name: string }) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDelete(comp);
  };

  const handleConfirmDelete = () => {
    if (!confirmDelete) return;
    deleteMutation.mutate(confirmDelete.id);
    setConfirmDelete(null);
  };

  const isLoading = eventLoading || compLoading;
  const error = eventError ?? compError;

  if (!eventId) {
    return <MissingIdState message="Missing event ID in the URL." />;
  }

  if (isLoading) {
    return <PageLoadSkeleton variant="table" />;
  }

  if (error || !event) {
    return (
      <ErrorStateCard
        message={error instanceof Error ? error.message : "Event not found"}
        title="Could not load event"
      />
    );
  }

  const competitions = data?.competitions ?? [];

  return (
    <PageShell>
      <PageBreadcrumbs
        items={[
          { label: "Events", to: "/events" },
          { label: `${event.name} (${event.year})`, to: `/events/${eventId}` },
          { label: "Competitions" },
        ]}
      />
      <PageHeader
        title="Competitions"
        description={`Divisions under ${event.name}. Each competition has its own roster, judges, and rounds.`}
        actions={
          !showForm ? (
            <Button onClick={() => setShowForm(true)}>Create competition</Button>
          ) : undefined
        }
      />

      {confirmDelete ? (
        <Card className="mb-8 border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>Delete competition?</CardTitle>
            <CardDescription>
              Are you sure you want to delete &quot;{confirmDelete.name}&quot;? This cannot be undone. All
              competitors, judges, and results will be removed.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {showForm ? (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>New competition</CardTitle>
            <CardDescription>Add a competition to this event.</CardDescription>
          </CardHeader>
          <CardContent>
            <CompetitionForm
              eventId={eventId}
              onSuccess={() => {
                setShowForm(false);
                refetch();
                toast.success("Competition created");
              }}
              onCancel={() => setShowForm(false)}
            />
          </CardContent>
        </Card>
      ) : null}

      {competitions.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Trophy}
              title="No competitions yet"
              description="Create a division (e.g. Mix & Match, Strictly, Solo) to add competitors and run prelims."
              action={<Button onClick={() => setShowForm(true)}>Create first competition</Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Division</TableHead>
                <TableHead className="w-28">Numbers</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {competitions.map((comp) => (
                <TableRow key={comp.id}>
                  <TableCell className="font-medium">
                    <Link
                      to={`/competitions/${comp.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {comp.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {divisionLabel[comp.division_type] ?? comp.division_type}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{comp.number_assignment_mode}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDeleteClick(e, comp)}
                      disabled={deleteMutation.isPending}
                      aria-label={`Delete ${comp.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </PageShell>
  );
}
