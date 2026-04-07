import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getCompetition, getJudges, assignJudge, updateJudge, unassignJudge } from "@/lib/api";
import type { JudgeWithAssigned } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import { PageBackLink, PageHeader, PageLoadSkeleton, PageShell, MissingIdState } from "@/components/page-frame";

type Round = "prelim" | "final";

function roundLabel(round: Round): string {
  return round === "prelim" ? "Prelim" : "Final";
}

export default function JudgesPage() {
  const { competitionId } = useParams<{ competitionId: string }>();
  const [assignPrelimJudgeId, setAssignPrelimJudgeId] = useState("");
  const [selectedFinalJudgeIds, setSelectedFinalJudgeIds] = useState<string[]>([]);
  const [votesForPrelim, setVotesForPrelim] = useState<"lead" | "follow">("lead");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRound, setEditingRound] = useState<Round | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editVotesFor, setEditVotesFor] = useState<"lead" | "follow">("lead");
  const queryClient = useQueryClient();

  const { data: competition, isLoading: compLoading } = useQuery({
    queryKey: ["competitions", competitionId],
    queryFn: () => getCompetition(competitionId!),
    enabled: !!competitionId,
  });

  const { data, error } = useQuery({
    queryKey: ["judges", competitionId],
    queryFn: () => getJudges(competitionId!),
    enabled: !!competitionId,
  });

  const assignMutation = useMutation({
    mutationFn: (body: { judge_id: string; round: Round; votes_for?: "lead" | "follow" }) =>
      assignJudge(competitionId!, body),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["judges", competitionId] });
      if (variables.round === "prelim") setAssignPrelimJudgeId("");
      toast.success(`Judge assigned to ${roundLabel(variables.round)}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const assignFinalBatchMutation = useMutation({
    mutationFn: async (judgeIds: string[]) => {
      await Promise.all(
        judgeIds.map((judge_id) => assignJudge(competitionId!, { judge_id, round: "final" }))
      );
    },
    onSuccess: (_, judgeIds) => {
      queryClient.invalidateQueries({ queryKey: ["judges", competitionId] });
      setSelectedFinalJudgeIds([]);
      toast.success(
        judgeIds.length === 1 ? "Judge assigned to Final" : `${judgeIds.length} judges assigned to Final`
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Assign failed"),
  });

  const unassignMutation = useMutation({
    mutationFn: ({ judgeId, round }: { judgeId: string; round: Round }) =>
      unassignJudge(competitionId!, judgeId, round),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["judges", competitionId] });
      if (editingRound === variables.round) setEditingId(null);
      setEditingRound(null);
      toast.success(`Judge unassigned from ${roundLabel(variables.round)}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      body: { name?: string; email?: string; round?: Round; votes_for?: "lead" | "follow" };
    }) => updateJudge(competitionId!, payload.id, payload.body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["judges", competitionId] });
      setEditingId(null);
      setEditingRound(null);
      toast.success("Judge updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleAssignPrelim = () => {
    if (!assignPrelimJudgeId) return;
    assignMutation.mutate({
      judge_id: assignPrelimJudgeId,
      round: "prelim",
      votes_for: votesForPrelim,
    });
  };

  const toggleFinalJudgeSelection = (id: string) => {
    setSelectedFinalJudgeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  if (!competitionId) {
    return <MissingIdState message="Missing competition ID in the URL." backTo="/events" />;
  }

  if (compLoading || !competition) {
    return <PageLoadSkeleton variant="table" />;
  }

  const judges = data?.judges ?? [];
  const prelimAssigned = judges.filter((j) => j.assigned_rounds?.includes("prelim")) as JudgeWithAssigned[];
  const finalAssigned = judges.filter((j) => j.assigned_rounds?.includes("final")) as JudgeWithAssigned[];
  const prelimUnassigned = judges.filter((j) => !j.assigned_rounds?.includes("prelim"));
  const finalUnassigned = judges.filter((j) => !j.assigned_rounds?.includes("final"));
  const editingJudge = editingId ? judges.find((j) => j.id === editingId) : null;

  const openEdit = (j: JudgeWithAssigned, round: Round) => {
    setEditingId(j.id);
    setEditingRound(round);
    setEditName(j.name);
    setEditEmail(j.email ?? "");
    const vf = round === "prelim" ? j.votes_for_prelim : j.votes_for_final;
    setEditVotesFor(vf === "follow" ? "follow" : "lead");
  };

  const handleUpdateJudge = () => {
    if (!editingId) return;
    const body: { name?: string; email?: string; round?: Round; votes_for?: "lead" | "follow" } = {
      name: editName.trim() || undefined,
      email: editEmail.trim() || undefined,
    };
    if (editingRound) {
      body.round = editingRound;
      if (editingRound === "prelim") body.votes_for = editVotesFor;
    }
    updateMutation.mutate({ id: editingId, body });
  };

  const renderRoundSection = (round: Round) => {
    const assigned = round === "prelim" ? prelimAssigned : finalAssigned;
    const unassigned = round === "prelim" ? prelimUnassigned : finalUnassigned;
    const votesForLabel = (j: JudgeWithAssigned) =>
      round === "prelim" ? (j.votes_for_prelim === "follow" ? "Follow" : "Lead") : j.votes_for_final === "follow" ? "Follow" : "Lead";

    return (
      <Card key={round} className="mb-8">
        <CardHeader>
          <CardTitle>{roundLabel(round)} judges</CardTitle>
          <CardDescription>
            Judges scoring the {round === "prelim" ? "preliminary" : "final"} round. Assign from event judges; unassign to remove from this round.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {round === "prelim" ? (
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-2 flex-1 min-w-[200px]">
                <Label>Assign judge</Label>
                <Select
                  value={assignPrelimJudgeId}
                  onChange={(e) => setAssignPrelimJudgeId(e.target.value)}
                  options={[
                    { value: "", label: "Select a judge…" },
                    ...unassigned.map((j) => ({ value: j.id, label: j.name })),
                  ]}
                />
              </div>
              <div className="space-y-2 flex-1 min-w-[120px]">
                <Label>Votes for</Label>
                <Select
                  value={votesForPrelim}
                  onChange={(e) => setVotesForPrelim(e.target.value as "lead" | "follow")}
                  options={[
                    { value: "lead", label: "Lead" },
                    { value: "follow", label: "Follow" },
                  ]}
                />
              </div>
              <Button
                onClick={handleAssignPrelim}
                disabled={!assignPrelimJudgeId || assignMutation.isPending}
              >
                {assignMutation.isPending ? "Assigning…" : "Assign"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Label>Assign judges</Label>
              {unassigned.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  All event judges are already assigned to Final.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedFinalJudgeIds(unassigned.map((j) => j.id))}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedFinalJudgeIds([])}
                      disabled={selectedFinalJudgeIds.length === 0}
                    >
                      Clear
                    </Button>
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-md border p-3 space-y-2">
                    {unassigned.map((j) => (
                      <label
                        key={j.id}
                        className="flex items-center gap-2 cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          className="size-4 rounded border-input"
                          checked={selectedFinalJudgeIds.includes(j.id)}
                          onChange={() => toggleFinalJudgeSelection(j.id)}
                        />
                        <span>{j.name}</span>
                      </label>
                    ))}
                  </div>
                  <Button
                    type="button"
                    onClick={() => assignFinalBatchMutation.mutate(selectedFinalJudgeIds)}
                    disabled={
                      selectedFinalJudgeIds.length === 0 || assignFinalBatchMutation.isPending
                    }
                  >
                    {assignFinalBatchMutation.isPending
                      ? "Assigning…"
                      : `Assign selected (${selectedFinalJudgeIds.length})`}
                  </Button>
                </>
              )}
            </div>
          )}
          {assigned.length === 0 ? (
            <p className="text-muted-foreground text-sm">No judges assigned to {roundLabel(round)} yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  {round === "prelim" && <TableHead className="w-24">Votes for</TableHead>}
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assigned.map((j) => (
                  <TableRow
                    key={`${round}-${j.id}`}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openEdit(j, round)}
                  >
                    <TableCell className="font-medium">{j.name}</TableCell>
                    <TableCell className="text-muted-foreground">{j.email ?? "—"}</TableCell>
                    {round === "prelim" && <TableCell className="text-muted-foreground">{votesForLabel(j)}</TableCell>}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => unassignMutation.mutate({ judgeId: j.id, round })}
                        disabled={unassignMutation.isPending}
                      >
                        Unassign
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <PageShell>
      <PageBackLink to={`/competitions/${competitionId}`}>Competition</PageBackLink>
      <PageHeader
        title="Competition judges"
        description={
          <>
            <span className="block text-muted-foreground">{competition.name}</span>
            <span className="mt-2 block text-sm text-muted-foreground">
              Judges are managed at event level.{" "}
              <Link
                to={`/events/${competition.event_id}/judges`}
                className="text-primary underline-offset-4 hover:underline"
              >
                Add or edit judges for this event
              </Link>
              . Prelim and Final can have different lineups — assign each round below.
            </span>
          </>
        }
      />

      {error && (
        <p className="text-destructive mb-4">{error instanceof Error ? error.message : "Failed to load judges"}</p>
      )}

      {renderRoundSection("prelim")}
      {renderRoundSection("final")}

      {editingJudge && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Edit judge</CardTitle>
            <CardDescription>
              Update judge name and email.{editingRound === "prelim" ? " You can change votes for (Lead/Follow) for the Prelim assignment." : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-2 flex-1 min-w-[140px]">
                <Label>Name</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Judge name"
                />
              </div>
              <div className="space-y-2 flex-1 min-w-[140px]">
                <Label>Email (optional)</Label>
                <Input
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  type="email"
                  placeholder="email@example.com"
                />
              </div>
              {editingRound === "prelim" && (
                <div className="space-y-2 flex-1 min-w-[120px]">
                  <Label>Votes for (Prelim)</Label>
                  <Select
                    value={editVotesFor}
                    onChange={(e) => setEditVotesFor(e.target.value as "lead" | "follow")}
                    options={[
                      { value: "lead", label: "Lead" },
                      { value: "follow", label: "Follow" },
                    ]}
                  />
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={handleUpdateJudge} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Updating…" : "Update"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setEditingRound(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
            {updateMutation.error && (
              <p className="text-sm text-destructive">
                {updateMutation.error instanceof Error ? updateMutation.error.message : "Failed"}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {judges.length > 0 && (prelimUnassigned.length > 0 || finalUnassigned.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Event judges</CardTitle>
            <CardDescription>
              All judges for this event. Assign to Prelim or Final above. To add new judges, go to the event Judges page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Rounds</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {judges.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="font-medium">{j.name}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {j.assigned_rounds?.length ? j.assigned_rounds.map((r) => roundLabel(r as Round)).join(", ") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
