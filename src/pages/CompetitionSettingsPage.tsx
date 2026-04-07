import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getCompetition, deleteCompetition } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ErrorStateCard,
  PageBackLink,
  PageHeader,
  PageLoadSkeleton,
  PageShell,
  MissingIdState,
} from "@/components/page-frame";

export default function CompetitionSettingsPage() {
  const { competitionId } = useParams<{ competitionId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const { data: competition, isLoading, error } = useQuery({
    queryKey: ["competitions", competitionId],
    queryFn: () => getCompetition(competitionId!),
    enabled: !!competitionId,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCompetition(competitionId!),
    onSuccess: () => {
      const eventId = competition?.event_id;
      queryClient.invalidateQueries({ queryKey: ["competitions"] });
      toast.success("Competition deleted");
      if (eventId) navigate(`/events/${eventId}/competitions`);
      else navigate("/events");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete competition"),
  });

  const handleConfirmDelete = () => {
    deleteMutation.mutate();
    setShowConfirmDelete(false);
  };

  if (!competitionId) {
    return <MissingIdState message="Missing competition ID in the URL." backTo="/events" />;
  }

  if (isLoading) {
    return <PageLoadSkeleton />;
  }

  if (error || !competition) {
    return (
      <ErrorStateCard
        message={error instanceof Error ? error.message : "Competition not found"}
        title="Competition not found"
      />
    );
  }

  return (
    <PageShell>
      <PageBackLink to={`/competitions/${competitionId}`}>Back to competition</PageBackLink>
      <PageHeader title="Competition settings" description={competition.name} />

      {showConfirmDelete ? (
        <Card className="mb-8 border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>Delete competition?</CardTitle>
            <CardDescription>
              Are you sure you want to delete &quot;{competition.name}&quot;? This cannot be undone. All
              competitors, judges, and results will be removed.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Permanently delete this competition and all data (competitors, judges, prelim and final). This cannot be
            undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setShowConfirmDelete(true)}
            disabled={deleteMutation.isPending}
          >
            Delete competition
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}
