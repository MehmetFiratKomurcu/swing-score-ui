import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getCompetition,
  getPrelim,
  putPrelimScores,
  type HeatSlot,
  type PrelimJudge,
  type PrelimResponse,
  type PrelimScoreRow,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, ListOrdered } from "lucide-react";
import {
  EmptyState,
  MissingIdState,
  PageBackLink,
  PageLoadSkeleton,
  PageShell,
} from "@/components/page-frame";
import { useEffect, useMemo, useState } from "react";

type SlotRef = {
  slotId: string;
  displayName: string;
  competitorId?: string;
  scoringRole?: HeatSlot["scoring_role"];
};

type ScoreEntry = { number: string; displayName: string | null; roleMismatch: string | null };

function isScoreCellComplete(cell: ScoreEntry, judgeMap: Map<number, SlotRef> | undefined): boolean {
  if (!cell.number.trim()) return false;
  if (cell.roleMismatch) return false;
  const num = parseInt(cell.number, 10);
  if (isNaN(num) || !judgeMap?.has(num)) return false;
  return true;
}

function buildNumberSlotMap(
  slots: HeatSlot[] | undefined,
  divisionType: string | undefined,
  votesForPrelim: PrelimJudge["votes_for_prelim"]
): Map<number, SlotRef> {
  const m = new Map<number, SlotRef>();
  if (!slots) return m;
  for (const slot of slots) {
    if (
      divisionType === "random_partner" &&
      votesForPrelim &&
      slot.scoring_role &&
      slot.scoring_role !== votesForPrelim
    ) {
      continue;
    }
    const name = slot.display_name ?? "";
    if (slot.numbers?.length) {
      for (const num of slot.numbers) {
        m.set(num, {
          slotId: slot.id,
          displayName: name,
          competitorId: slot.competitor_id,
          scoringRole: slot.scoring_role,
        });
      }
    }
  }
  return m;
}

function numberAndNameForScore(
  heatSlotId: string,
  competitorId: string | undefined,
  heatSlots: HeatSlot[]
): { num: number; displayName: string } | null {
  const rows = heatSlots.filter((s) => s.id === heatSlotId);
  if (competitorId) {
    const row = rows.find((s) => s.competitor_id === competitorId);
    if (!row) return null;
    const n = row.numbers?.[0];
    if (n == null) return null;
    return { num: n, displayName: row.display_name ?? "" };
  }
  const withNums = rows.filter((r) => r.numbers && r.numbers.length > 0);
  const row = withNums[0];
  if (!row?.numbers?.length) return null;
  const nums = [...row.numbers].sort((a, b) => a - b);
  return { num: nums[0], displayName: row.display_name ?? "" };
}

function buildEntriesFromSavedScores(prelim: PrelimResponse) {
  const yesCount = prelim.config?.yes_count ?? 0;
  const altCount = prelim.config?.alternate_count ?? 0;
  const alternatesRanked = prelim.config?.alternates_ranked ?? false;
  const judges = prelim.judges ?? [];
  const scores = prelim.scores ?? [];
  const heatSlots = prelim.heat_slots ?? [];

  const emptyEntry = (): ScoreEntry => ({ number: "", displayName: null, roleMismatch: null });

  const next: Record<string, { yes: ScoreEntry[]; alt: ScoreEntry[] }> = {};
  for (const j of judges) {
    next[j.id] = {
      yes: Array.from({ length: yesCount }, emptyEntry),
      alt: Array.from({ length: altCount }, emptyEntry),
    };
  }

  const byJudge = new Map<string, PrelimScoreRow[]>();
  for (const sc of scores) {
    const list = byJudge.get(sc.judge_id) ?? [];
    list.push(sc);
    byJudge.set(sc.judge_id, list);
  }

  for (const j of judges) {
    const list = byJudge.get(j.id) ?? [];
    const yesRows = list.filter((s) => s.is_yes);
    const altRows = list.filter((s) => !s.is_yes);

    const yesResolved = yesRows
      .map((s) => numberAndNameForScore(s.heat_slot_id, s.competitor_id, heatSlots))
      .filter((x): x is { num: number; displayName: string } => x != null);
    yesResolved.sort((a, b) => a.num - b.num);
    for (let i = 0; i < yesCount && i < yesResolved.length; i++) {
      const r = yesResolved[i];
      next[j.id].yes[i] = { number: String(r.num), displayName: r.displayName, roleMismatch: null };
    }

    let orderedAlts = [...altRows];
    if (alternatesRanked) {
      orderedAlts.sort((a, b) => (a.alt_rank ?? 0) - (b.alt_rank ?? 0));
    } else {
      orderedAlts.sort((a, b) => {
        const na = numberAndNameForScore(a.heat_slot_id, a.competitor_id, heatSlots)?.num ?? 0;
        const nb = numberAndNameForScore(b.heat_slot_id, b.competitor_id, heatSlots)?.num ?? 0;
        return na - nb;
      });
    }
    for (let i = 0; i < altCount && i < orderedAlts.length; i++) {
      const info = numberAndNameForScore(orderedAlts[i].heat_slot_id, orderedAlts[i].competitor_id, heatSlots);
      if (info) {
        next[j.id].alt[i] = { number: String(info.num), displayName: info.displayName, roleMismatch: null };
      }
    }
  }

  return next;
}

export default function PrelimScoringPage() {
  const { competitionId } = useParams<{ competitionId: string }>();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const { data: competition } = useQuery({
    queryKey: ["competitions", competitionId],
    queryFn: () => getCompetition(competitionId!),
    enabled: !!competitionId,
  });

  const { data: prelim } = useQuery({
    queryKey: ["prelim", competitionId],
    queryFn: () => getPrelim(competitionId!),
    enabled: !!competitionId,
    refetchOnWindowFocus: false,
  });

  const judges = prelim?.judges ?? [];

  const allNumbersToSlot = useMemo(
    () => buildNumberSlotMap(prelim?.heat_slots, undefined, undefined),
    [prelim?.heat_slots]
  );

  const judgeNumberMaps = useMemo(() => {
    const out = new Map<string, Map<number, SlotRef>>();
    if (!prelim?.heat_slots) return out;
    const div = competition?.division_type;
    for (const judge of judges) {
      out.set(judge.id, buildNumberSlotMap(prelim.heat_slots, div, judge.votes_for_prelim));
    }
    return out;
  }, [prelim?.heat_slots, competition?.division_type, prelim?.judges]);

  const yesCount = prelim?.config?.yes_count ?? 0;
  const altCount = prelim?.config?.alternate_count ?? 0;
  const alternatesRanked = prelim?.config?.alternates_ranked ?? false;
  const [entries, setEntries] = useState<Record<string, { yes: ScoreEntry[]; alt: ScoreEntry[] }>>({});

  const judgeIdsKey = useMemo(() => (prelim?.judges ?? []).map((j) => j.id).join(","), [prelim?.judges]);

  useEffect(() => {
    if (!prelim?.heat_slots?.length) return;
    if (!judges.length) {
      setEntries({});
      return;
    }
    setEntries(buildEntriesFromSavedScores(prelim));
  }, [competitionId, prelim, judgeIdsKey, yesCount, altCount, alternatesRanked, judges.length]);

  const allBallotsComplete = useMemo(() => {
    if (judges.length === 0) return false;
    for (const judge of judges) {
      const e = entries[judge.id];
      const judgeMap = judgeNumberMaps.get(judge.id);
      if (!e || e.yes.length !== yesCount || e.alt.length !== altCount) return false;
      for (const cell of [...e.yes, ...e.alt]) {
        if (!isScoreCellComplete(cell, judgeMap)) return false;
      }
    }
    return true;
  }, [judges, entries, judgeNumberMaps, yesCount, altCount]);

  const handleNumberChange = (judgeId: string, type: "yes" | "alt", index: number, value: string) => {
    const trimmed = value.trim();
    const num = trimmed ? parseInt(trimmed, 10) : NaN;
    const judgeMap = judgeNumberMaps.get(judgeId);
    let displayName: string | null = null;
    let roleMismatch: string | null = null;
    if (!isNaN(num) && judgeMap?.has(num)) {
      displayName = judgeMap.get(num)!.displayName;
    } else if (
      !isNaN(num) &&
      competition?.division_type === "random_partner" &&
      judges.find((j) => j.id === judgeId)?.votes_for_prelim &&
      allNumbersToSlot.has(num) &&
      judgeMap &&
      !judgeMap.has(num)
    ) {
      const judge = judges.find((j) => j.id === judgeId)!;
      const vf = judge.votes_for_prelim!;
      const row = allNumbersToSlot.get(num)!;
      const other = row.scoringRole === "follow" ? "Follow" : row.scoringRole === "lead" ? "Lead" : "this role";
      const yours = vf === "follow" ? "follows" : "leads";
      roleMismatch = `This number is a ${other}; you vote for ${yours} only.`;
    }
    setEntries((prev) => {
      const e = prev[judgeId] ?? { yes: [], alt: [] };
      const next = { ...e };
      if (type === "yes") {
        next.yes = [...e.yes];
        next.yes[index] = { number: trimmed, displayName, roleMismatch };
        // A competitor cannot be both YES and ALT for the same judge.
        if (trimmed) {
          next.alt = (e.alt ?? []).map((cell) =>
            cell?.number?.trim() === trimmed
              ? { number: "", displayName: null, roleMismatch: null }
              : cell
          );
        }
      } else {
        next.alt = [...e.alt];
        next.alt[index] = { number: trimmed, displayName, roleMismatch };
        // A competitor cannot be both YES and ALT for the same judge.
        if (trimmed) {
          next.yes = (e.yes ?? []).map((cell) =>
            cell?.number?.trim() === trimmed
              ? { number: "", displayName: null, roleMismatch: null }
              : cell
          );
        }
      }
      return { ...prev, [judgeId]: next };
    });
  };

  const putMutation = useMutation({
    mutationFn: (scores: { heat_slot_id: string; judge_id: string; competitor_id?: string; is_yes: boolean; alt_rank?: number }[]) =>
      putPrelimScores(competitionId!, scores),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["prelim", competitionId] });
      queryClient.invalidateQueries({ queryKey: ["prelim-results", competitionId] });
      toast.success("Scores saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    for (const judge of judges) {
      const e = entries[judge.id];
      if (!e) continue;
      const judgeMap = judgeNumberMaps.get(judge.id);
      const cells = [...e.yes, ...e.alt];
      for (const cell of cells) {
        if (!cell.number.trim()) continue;
        if (cell.roleMismatch) {
          toast.error(cell.roleMismatch);
          return;
        }
        const num = parseInt(cell.number, 10);
        if (isNaN(num) || !judgeMap?.has(num)) {
          toast.error("Enter a valid competitor or pair number for each filled slot.");
          return;
        }
      }

      // Guardrail: prevent the same competitor being both YES and ALT.
      const yesSet = new Set(e.yes.map((c) => c.number.trim()).filter(Boolean));
      const overlap = e.alt.map((c) => c.number.trim()).filter(Boolean).find((n) => yesSet.has(n));
      if (overlap) {
        toast.error(`Competitor #${overlap} cannot be both YES and ALT.`);
        return;
      }
    }

    const scores: { heat_slot_id: string; judge_id: string; competitor_id?: string; is_yes: boolean; alt_rank?: number }[] = [];
    for (const judge of judges) {
      const e = entries[judge.id];
      if (!e) continue;
      const judgeMap = judgeNumberMaps.get(judge.id)!;
      for (let i = 0; i < e.yes.length; i++) {
        const num = parseInt(e.yes[i].number, 10);
        if (!isNaN(num) && judgeMap.has(num)) {
          const entry = judgeMap.get(num)!;
          scores.push({
            judge_id: judge.id,
            heat_slot_id: entry.slotId,
            ...(entry.competitorId && { competitor_id: entry.competitorId }),
            is_yes: true,
          });
        }
      }
      for (let i = 0; i < e.alt.length; i++) {
        const num = parseInt(e.alt[i].number, 10);
        if (!isNaN(num) && judgeMap.has(num)) {
          const entry = judgeMap.get(num)!;
          scores.push({
            judge_id: judge.id,
            heat_slot_id: entry.slotId,
            ...(entry.competitorId && { competitor_id: entry.competitorId }),
            is_yes: false,
            ...(alternatesRanked ? { alt_rank: i + 1 } : {}),
          });
        }
      }
    }
    putMutation.mutate(scores);
  };

  if (!competitionId) {
    return <MissingIdState message="Missing competition ID in the URL." backTo="/events" />;
  }
  if (!competition) {
    return <PageLoadSkeleton variant="minimal" />;
  }
  if (!prelim?.heat_slots?.length) {
    return (
      <PageShell>
        <PageBackLink to={`/competitions/${competitionId}/prelim`}>Prelim</PageBackLink>
        <EmptyState
          icon={ListOrdered}
          title="Heats are not ready yet"
          description="Generate heats on the Prelim page, then return here to enter judge scores."
          action={
            <Button variant="outline" asChild>
              <Link to={`/competitions/${competitionId}/prelim`}>Go to Prelim</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  const inputClass = "h-12 text-base min-w-[4rem]";

  return (
    <PageShell className="!pt-4 sm:!pt-6">
      <div className="sticky top-0 z-10 -mx-4 mb-6 border-b border-border bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-1">
            <Button variant="ghost" size="sm" className="shrink-0 gap-1 px-2 text-muted-foreground" asChild>
              <Link to={`/competitions/${competitionId}/prelim`}>
                <span className="text-lg leading-none opacity-70" aria-hidden>
                  ←
                </span>
                <span>Prelim</span>
              </Link>
            </Button>
            <h1 className="font-display truncate text-xl font-bold tracking-tight">Prelim scoring</h1>
          </div>
          <Button onClick={handleSave} disabled={putMutation.isPending || judges.length === 0} className="min-h-11 px-6">
            {putMutation.isPending ? "Saving…" : "Save scores"}
          </Button>
        </div>
        <p className="text-muted-foreground text-sm mt-1">{competition.name}</p>
        {allBallotsComplete && (
          <div
            role="status"
            aria-live="polite"
            className="mt-3 flex items-start gap-2 rounded-md border border-green-600/40 bg-green-600/10 px-3 py-2 text-sm text-green-800 dark:border-green-500/50 dark:bg-green-500/15 dark:text-green-300"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              All YES and alternate slots are filled for every judge. You can save when ready.
            </span>
          </div>
        )}
        {saved && <p className="text-green-600 dark:text-green-400 text-sm mt-1">Scores saved.</p>}
        {putMutation.error && <p className="text-destructive text-sm mt-1">{putMutation.error instanceof Error ? putMutation.error.message : "Save failed"}</p>}
      </div>

      <div className="space-y-8">
        {judges.map((judge) => {
          const e = entries[judge.id] ?? { yes: [], alt: [] };
          return (
            <Card key={judge.id}>
              <CardHeader className="sticky top-[6.25rem] z-[9] -mx-4 border-b border-border bg-card px-4 sm:-mx-6 sm:px-6">
                <CardTitle>{judge.name}</CardTitle>
                <CardDescription>
                  YES and maybe (ALT) by competitor/pair number. Name confirms.
                  {competition.division_type === "random_partner" && judge.votes_for_prelim && (
                    <> You vote for {judge.votes_for_prelim === "follow" ? "Follows" : "Leads"} only.</>
                  )}{" "}
                  {alternatesRanked
                    ? "Alternates are ranked: ALT 1 is strongest maybe, then 2, 3…"
                    : "Alternates are unranked: order of slots does not imply preference."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <div>
                  <Label className="mb-2 block">YES (1–{yesCount})</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {Array.from({ length: yesCount }, (_, i) => (
                      <div key={i} className="space-y-1">
                        <Label className="text-muted-foreground text-xs">YES {i + 1}</Label>
                        <Input
                          type="number"
                          min={0}
                          placeholder="#"
                          className={inputClass}
                          value={e.yes[i]?.number ?? ""}
                          onChange={(ev) => handleNumberChange(judge.id, "yes", i, ev.target.value)}
                        />
                        {e.yes[i]?.displayName && <p className="text-sm font-medium text-green-600 dark:text-green-400">{e.yes[i].displayName}</p>}
                        {e.yes[i]?.roleMismatch && <p className="text-sm text-destructive">{e.yes[i].roleMismatch}</p>}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block">
                    {alternatesRanked ? `ALT (ranked 1–${altCount})` : `Maybe / ALT (${altCount} slots)`}
                  </Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {Array.from({ length: altCount }, (_, i) => (
                      <div key={i} className="space-y-1">
                        <Label className="text-muted-foreground text-xs">
                          {alternatesRanked ? `ALT ${i + 1}` : `Slot ${i + 1}`}
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          placeholder="#"
                          className={inputClass}
                          value={e.alt[i]?.number ?? ""}
                          onChange={(ev) => handleNumberChange(judge.id, "alt", i, ev.target.value)}
                        />
                        {e.alt[i]?.displayName && <p className="text-sm font-medium text-green-600 dark:text-green-400">{e.alt[i].displayName}</p>}
                        {e.alt[i]?.roleMismatch && <p className="text-sm text-destructive">{e.alt[i].roleMismatch}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PageShell>
  );
}
