import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getCompetition } from "@/lib/api";
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

const divisionLabel: Record<string, string> = {
  random_partner: "Random partner (Mix & Match)",
  fixed_partner: "Fixed partner (Strictly)",
  solo: "Solo Jazz",
};

export default function CompetitionDetailPage() {
  const { competitionId } = useParams<{ competitionId: string }>();
  const { data: competition, isLoading, error } = useQuery({
    queryKey: ["competitions", competitionId],
    queryFn: () => getCompetition(competitionId!),
    enabled: !!competitionId,
  });

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
      <PageBackLink to={`/events/${competition.event_id}/competitions`}>Competitions</PageBackLink>
      <PageHeader
        title={competition.name}
        description={`${divisionLabel[competition.division_type] ?? competition.division_type} · Numbers: ${competition.number_assignment_mode}`}
      />
      <Card>
        <CardHeader>
          <CardTitle>Run this division</CardTitle>
          <CardDescription>Add competitors and judges, then run prelim and final from here.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to={`/competitions/${competition.id}/competitors`}>Competitors</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/competitions/${competition.id}/judges`}>Judges</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/competitions/${competition.id}/prelim`}>Prelim</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/competitions/${competition.id}/final`}>Final</Link>
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}
