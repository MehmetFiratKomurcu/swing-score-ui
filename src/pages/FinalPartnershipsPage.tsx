import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getCompetition, getFinal, postFinalPartnerships } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useMemo, useState, useEffect, useCallback } from "react";
import { ListOrdered } from "lucide-react";
import {
  EmptyState,
  MissingIdState,
  PageBackLink,
  PageHeader,
  PageLoadSkeleton,
  PageShell,
} from "@/components/page-frame";

function competitorIdsUsedInOtherPairs(
  pairs: { leadId: string; followId: string }[],
  pairCount: number,
  exceptIndex: number
): Set<string> {
  const used = new Set<string>();
  for (let j = 0; j < pairCount; j++) {
    if (j === exceptIndex) continue;
    const p = pairs[j];
    if (!p) continue;
    if (p.leadId) used.add(p.leadId);
    if (p.followId) used.add(p.followId);
  }
  return used;
}

function assignCompetitorUnique(
  prev: { leadId: string; followId: string }[],
  rowIndex: number,
  field: "leadId" | "followId",
  competitorId: string
): { leadId: string; followId: string }[] {
  const next = prev.map((p) => ({ ...p }));
  if (competitorId) {
    for (let j = 0; j < next.length; j++) {
      if (j === rowIndex) continue;
      if (next[j].leadId === competitorId) next[j].leadId = "";
      if (next[j].followId === competitorId) next[j].followId = "";
    }
  }
  next[rowIndex] = { ...next[rowIndex], [field]: competitorId };
  return next;
}

export default function FinalPartnershipsPage() {
  const { competitionId } = useParams<{ competitionId: string }>();
  const queryClient = useQueryClient();

  const { data: competition } = useQuery({
    queryKey: ["competitions", competitionId],
    queryFn: () => getCompetition(competitionId!),
    enabled: !!competitionId,
  });

  const { data: finalData } = useQuery({
    queryKey: ["final", competitionId],
    queryFn: () => getFinal(competitionId!),
    enabled: !!competitionId,
    refetchOnWindowFocus: false,
  });

  const leads = finalData?.finalist_leads ?? [];
  const follows = finalData?.finalist_follows ?? [];
  const pairCount = Math.min(leads.length, follows.length);

  const savedPairsKey = useMemo(
    () =>
      JSON.stringify(
        (finalData?.pairs ?? []).map((p) => [p.lead_competitor_id, p.follow_competitor_id])
      ),
    [finalData?.pairs]
  );

  const [pairs, setPairs] = useState<{ leadId: string; followId: string }[]>([]);
  useEffect(() => {
    const fp = finalData?.pairs ?? [];
    const n = Math.max(pairCount, 1);
    if (fp.length > 0) {
      setPairs(
        Array.from({ length: pairCount }, (_, i) => ({
          leadId: fp[i]?.lead_competitor_id ?? "",
          followId: fp[i]?.follow_competitor_id ?? "",
        }))
      );
      return;
    }
    setPairs(Array.from({ length: n }, () => ({ leadId: "", followId: "" })));
  }, [pairCount, savedPairsKey]);

  const leadOptions = useMemo(() => leads.map((c) => ({ value: c.competitor_id, label: `${c.number != null ? "#" + c.number : ""} ${c.display_name}`.trim() })), [leads]);
  const followOptions = useMemo(() => follows.map((c) => ({ value: c.competitor_id, label: `${c.number != null ? "#" + c.number : ""} ${c.display_name}`.trim() })), [follows]);

  const leadSelectOptionsForRow = useCallback(
    (rowIndex: number) => {
      const takenElsewhere = competitorIdsUsedInOtherPairs(pairs, pairCount, rowIndex);
      const current = pairs[rowIndex]?.leadId ?? "";
      const filtered = leadOptions.filter((o) => o.value === current || !takenElsewhere.has(o.value));
      return [{ value: "", label: "— Lead —" }, ...filtered];
    },
    [pairs, pairCount, leadOptions]
  );

  const followSelectOptionsForRow = useCallback(
    (rowIndex: number) => {
      const takenElsewhere = competitorIdsUsedInOtherPairs(pairs, pairCount, rowIndex);
      const current = pairs[rowIndex]?.followId ?? "";
      const filtered = followOptions.filter((o) => o.value === current || !takenElsewhere.has(o.value));
      return [{ value: "", label: "— Follow —" }, ...filtered];
    },
    [pairs, pairCount, followOptions]
  );

  const postMutation = useMutation({
    mutationFn: (body: { lead_competitor_id: string; follow_competitor_id: string }[]) => postFinalPartnerships(competitionId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["final", competitionId] });
      toast.success("Partnerships saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    const valid = pairs.slice(0, pairCount).filter((p) => p.leadId && p.followId);
    if (valid.length === 0) return;
    postMutation.mutate(valid.map((p) => ({ lead_competitor_id: p.leadId, follow_competitor_id: p.followId })));
  };

  if (!competitionId) {
    return <MissingIdState message="Missing competition ID in the URL." backTo="/events" />;
  }
  if (!competition) {
    return <PageLoadSkeleton />;
  }
  if (competition.division_type !== "random_partner") {
    return (
      <PageShell>
        <PageBackLink to={`/competitions/${competitionId}/final`}>Final</PageBackLink>
        <Card>
          <CardContent className="p-0">
            <EmptyState
              title="Not a Mix & Match division"
              description="Final partnerships apply only to random partner (Mix & Match) competitions."
              action={
                <Button variant="outline" asChild>
                  <Link to={`/competitions/${competitionId}/final`}>Back to Final</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageBackLink to={`/competitions/${competitionId}/final`}>Final</PageBackLink>
      <PageHeader
        title="Final partnerships"
        description={`${competition.name} — Pair each lead with a follow for the final.`}
      />

      {leadOptions.length === 0 || followOptions.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={ListOrdered}
              title="No finalists to pair yet"
              description="Advance leads and follows from the Prelim results before assigning partnerships."
              action={
                <Button variant="outline" asChild>
                  <Link to={`/competitions/${competitionId}/prelim`}>Go to Prelim</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Pairs</CardTitle>
              <CardDescription>Select lead and follow for each pair.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: pairCount }, (_, i) => (
                <div key={i} className="flex flex-wrap items-center gap-4">
                  <Label>Pair {i + 1}</Label>
                  <Select
                    options={leadSelectOptionsForRow(i)}
                    value={pairs[i]?.leadId ?? ""}
                    onChange={(e) =>
                      setPairs((prev) => assignCompetitorUnique(prev, i, "leadId", e.target.value))
                    }
                  />
                  <Select
                    options={followSelectOptionsForRow(i)}
                    value={pairs[i]?.followId ?? ""}
                    onChange={(e) =>
                      setPairs((prev) => assignCompetitorUnique(prev, i, "followId", e.target.value))
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>
          {postMutation.error && <p className="text-destructive mb-4">{postMutation.error instanceof Error ? postMutation.error.message : "Failed"}</p>}
          <Button onClick={handleSave} disabled={postMutation.isPending}>Save partnerships</Button>
        </>
      )}
    </PageShell>
  );
}
