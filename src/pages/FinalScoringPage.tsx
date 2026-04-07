import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getCompetition, getFinal, putFinalScores } from "@/lib/api";
import type { DivisionType, FinalistEntry } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { Award, Gavel } from "lucide-react";
import {
  EmptyState,
  MissingIdState,
  PageBackLink,
  PageLoadSkeleton,
  PageShell,
} from "@/components/page-frame";

type RankEntry = { number: string; displayName: string | null };

/** Canonical storage: index = rank−1, value = competitor/pair #. Finalist-order UI derives from this. */
type FinalScoreInputMode = "by_rank" | "by_finalist_order";

function finalistKey(f: FinalistEntry): string {
  return f.pair_id ?? f.competitor_id ?? "";
}

function primaryBibForFinalist(f: FinalistEntry): number | null {
  if (f.number != null) return f.number;
  if (f.numbers?.length) return Math.min(...f.numbers);
  return null;
}

function rankLayoutToFinalistOrder(
  rankLayout: RankEntry[],
  finalists: FinalistEntry[],
  numberToFinalist: Map<number, { competitor_id?: string; pair_id?: string; display_name: string }>
): RankEntry[] {
  const rankByKey = new Map<string, number>();
  for (let ri = 0; ri < rankLayout.length; ri++) {
    const num = parseInt(rankLayout[ri].number, 10);
    if (isNaN(num) || !numberToFinalist.has(num)) continue;
    const r = numberToFinalist.get(num)!;
    const key = (r.pair_id ?? r.competitor_id) as string;
    if (key) rankByKey.set(key, ri + 1);
  }
  return finalists.map((fin) => {
    const k = finalistKey(fin);
    const rank = rankByKey.get(k);
    if (!rank) return { number: "", displayName: null };
    return { number: String(rank), displayName: fin.display_name ?? null };
  });
}

function finalistOrderToRankLayout(orderLayout: RankEntry[], finalists: FinalistEntry[]): RankEntry[] {
  const n = finalists.length;
  const slots: RankEntry[] = Array.from({ length: n }, () => ({ number: "", displayName: null }));
  for (let fi = 0; fi < n; fi++) {
    const rank = parseInt(orderLayout[fi].number.trim(), 10);
    if (isNaN(rank) || rank < 1 || rank > n) continue;
    const bib = primaryBibForFinalist(finalists[fi]);
    if (bib == null) continue;
    slots[rank - 1] = {
      number: String(bib),
      displayName: finalists[fi].display_name ?? null,
    };
  }
  return slots;
}

function buildNumberToFinalist(finalists: FinalistEntry[]): Map<number, { competitor_id?: string; pair_id?: string; display_name: string }> {
  const m = new Map<number, { competitor_id?: string; pair_id?: string; display_name: string }>();
  for (const f of finalists) {
    const name = f.display_name ?? "";
    if (f.competitor_id != null && f.number != null) {
      m.set(f.number, { competitor_id: f.competitor_id, display_name: name });
    }
    if (f.pair_id != null && f.numbers?.length) {
      for (const num of f.numbers) {
        m.set(num, { pair_id: f.pair_id, display_name: name });
      }
    }
  }
  return m;
}

function displayNumberForFinalScore(
  finalists: FinalistEntry[],
  competitor_id?: string,
  pair_id?: string,
  opts?: { divisionType?: DivisionType; finalPairRows?: { id: string; lead_competitor_id: string; follow_competitor_id: string }[] }
): { num: number; displayName: string } | null {
  if (pair_id) {
    for (const f of finalists) {
      if (f.pair_id === pair_id && f.numbers?.length) {
        return { num: Math.min(...f.numbers), displayName: f.display_name ?? "" };
      }
    }
  }
  if (competitor_id) {
    for (const f of finalists) {
      if (f.competitor_id === competitor_id && f.number != null) {
        return { num: f.number, displayName: f.display_name ?? "" };
      }
    }
    // Legacy: scores saved per competitor before finalists were listed as final couples
    if (opts?.divisionType === "random_partner" && opts.finalPairRows?.length) {
      for (const p of opts.finalPairRows) {
        if (p.lead_competitor_id === competitor_id || p.follow_competitor_id === competitor_id) {
          const f = finalists.find((x) => x.pair_id === p.id);
          if (f?.numbers?.length) {
            return { num: Math.min(...f.numbers), displayName: f.display_name ?? "" };
          }
        }
      }
    }
  }
  return null;
}

function buildEntriesFromFinalScores(
  finalists: FinalistEntry[],
  scores: { judge_id: string; rank: number; competitor_id?: string; pair_id?: string }[],
  judgeIds: string[],
  rankCount: number,
  resolveOpts?: { divisionType?: DivisionType; finalPairRows?: { id: string; lead_competitor_id: string; follow_competitor_id: string }[] }
): Record<string, RankEntry[]> {
  const emptyRank = (): RankEntry => ({ number: "", displayName: null });
  const next: Record<string, RankEntry[]> = {};
  for (const jid of judgeIds) {
    next[jid] = Array.from({ length: rankCount }, emptyRank);
  }
  const byJudge = new Map<string, { judge_id: string; rank: number; competitor_id?: string; pair_id?: string }[]>();
  for (const s of scores) {
    const list = byJudge.get(s.judge_id) ?? [];
    list.push(s);
    byJudge.set(s.judge_id, list);
  }
  for (const jid of judgeIds) {
    const list = [...(byJudge.get(jid) ?? [])].sort((a, b) => a.rank - b.rank);
    for (const s of list) {
      if (s.rank < 1 || s.rank > rankCount) continue;
      const info = displayNumberForFinalScore(finalists, s.competitor_id, s.pair_id, resolveOpts);
      if (info) {
        next[jid][s.rank - 1] = { number: String(info.num), displayName: info.displayName };
      }
    }
  }
  return next;
}

const finalScoringModeStorageKey = (id: string) => `swing-score:final-scoring-mode:${id}`;

export default function FinalScoringPage() {
  const { competitionId } = useParams<{ competitionId: string }>();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [inputMode, setInputMode] = useState<FinalScoreInputMode>("by_rank");

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

  const finalists = finalData?.finalists ?? [];
  const judges = finalData?.judges ?? [];
  const numberToFinalist = useMemo(() => buildNumberToFinalist(finalists), [finalists]);
  const rankCount = finalists.length;

  const judgeIdsKey = useMemo(() => judges.map((j) => j.id).join(","), [judges]);
  const finalistsKey = useMemo(
    () =>
      finalists
        .map((f) => [f.competitor_id ?? "", f.pair_id ?? "", String(f.number ?? ""), (f.numbers ?? []).join(",")].join(":"))
        .join("|"),
    [finalists]
  );
  const finalScoresKey = useMemo(() => JSON.stringify(finalData?.final_scores ?? []), [finalData?.final_scores]);
  const finalPairsKey = useMemo(() => JSON.stringify(finalData?.pairs ?? []), [finalData?.pairs]);

  const [entries, setEntries] = useState<Record<string, RankEntry[]>>({});

  useEffect(() => {
    if (!competitionId) return;
    const v = localStorage.getItem(finalScoringModeStorageKey(competitionId));
    setInputMode(v === "by_finalist_order" ? "by_finalist_order" : "by_rank");
  }, [competitionId]);

  const setInputModePersist = (mode: FinalScoreInputMode) => {
    setInputMode(mode);
    if (competitionId) {
      localStorage.setItem(finalScoringModeStorageKey(competitionId), mode);
    }
  };

  useEffect(() => {
    if (!finalists.length || !judges.length) {
      setEntries({});
      return;
    }
    setEntries(
      buildEntriesFromFinalScores(
        finalists,
        finalData?.final_scores ?? [],
        judges.map((j) => j.id),
        rankCount,
        { divisionType: competition?.division_type, finalPairRows: finalData?.pairs }
      )
    );
  }, [
    competitionId,
    finalistsKey,
    judgeIdsKey,
    finalScoresKey,
    rankCount,
    competition?.division_type,
    finalPairsKey,
  ]);

  const padList = (list: RankEntry[]) => {
    const next = list.slice();
    while (next.length < rankCount) next.push({ number: "", displayName: null });
    return next.slice(0, rankCount);
  };

  const handleNumberChange = (judgeId: string, rankIndex: number, value: string) => {
    const num = value.trim() ? parseInt(value.trim(), 10) : NaN;
    const resolved = !isNaN(num) && numberToFinalist.has(num) ? numberToFinalist.get(num)! : null;
    const displayName = resolved?.display_name ?? null;
    setEntries((prev) => {
      const list = padList(prev[judgeId] ?? []);
      const next = [...list];
      next[rankIndex] = { number: value.trim(), displayName };
      return { ...prev, [judgeId]: next };
    });
  };

  const handleFinalistOrderChange = (judgeId: string, finalistIndex: number, value: string) => {
    const trimmed = value.trim();
    setEntries((prev) => {
      const rankLayout = padList(prev[judgeId] ?? []);
      const orderCells = rankLayoutToFinalistOrder(rankLayout, finalists, numberToFinalist);
      const nextOrder = [...orderCells];
      nextOrder[finalistIndex] = { number: trimmed, displayName: null };
      const newRankLayout = finalistOrderToRankLayout(nextOrder, finalists);
      return { ...prev, [judgeId]: newRankLayout };
    });
  };

  const putMutation = useMutation({
    mutationFn: (scores: { judge_id: string; competitor_id?: string; pair_id?: string; rank: number }[]) =>
      putFinalScores(competitionId!, scores),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["final", competitionId] });
      queryClient.invalidateQueries({ queryKey: ["final-results", competitionId] });
      toast.success("Scores saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    const scores: { judge_id: string; competitor_id?: string; pair_id?: string; rank: number }[] = [];
    for (const judge of judges) {
      const list = entries[judge.id] ?? [];
      for (let i = 0; i < list.length; i++) {
        const num = parseInt(list[i].number, 10);
        if (!isNaN(num) && numberToFinalist.has(num)) {
          const r = numberToFinalist.get(num)!;
          scores.push({
            judge_id: judge.id,
            competitor_id: r.competitor_id,
            pair_id: r.pair_id,
            rank: i + 1,
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
  if (!finalists.length) {
    return (
      <PageShell>
        <PageBackLink to={`/competitions/${competitionId}/final`}>Final</PageBackLink>
        <EmptyState
          icon={Award}
          title="No finalists yet"
          description="Advance competitors or pairs from the Prelim before entering final ranks."
          action={
            <Button variant="outline" asChild>
              <Link to={`/competitions/${competitionId}/final`}>Back to Final</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }
  if (!judges.length) {
    return (
      <PageShell>
        <PageBackLink to={`/competitions/${competitionId}/final`}>Final</PageBackLink>
        <EmptyState
          icon={Gavel}
          title="No judges assigned"
          description="Assign at least one judge to the Final round for this competition, then return here."
          action={
            <Button variant="outline" asChild>
              <Link to={`/competitions/${competitionId}/judges`}>Open Judges</Link>
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
              <Link to={`/competitions/${competitionId}/final`}>
                <span className="text-lg leading-none opacity-70" aria-hidden>
                  ←
                </span>
                <span>Final</span>
              </Link>
            </Button>
            <h1 className="font-display truncate text-xl font-bold tracking-tight">Final scoring</h1>
          </div>
          <Button onClick={handleSave} disabled={putMutation.isPending || judges.length === 0} className="min-h-11 px-6">
            {putMutation.isPending ? "Saving…" : "Save scores"}
          </Button>
        </div>
        <p className="text-muted-foreground text-sm mt-1">{competition.name}</p>
        {saved && <p className="text-green-600 dark:text-green-400 text-sm mt-1">Scores saved.</p>}
        {putMutation.error && <p className="text-destructive text-sm mt-1">{putMutation.error instanceof Error ? putMutation.error.message : "Save failed"}</p>}
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">How do you want to enter scores?</CardTitle>
          <CardDescription>
            Finalists are listed below in order (usually left-to-right on stage). Judges may think in competitor numbers (e.g. 3-4-6-1) or by rank columns; choose the method here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset>
            <legend className="sr-only">Score entry mode</legend>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  inputMode === "by_rank" ? "border-primary bg-accent/40" : "border-border hover:bg-muted/40"
                )}
              >
                <input
                  type="radio"
                  name="final-score-input-mode"
                  className="mt-1"
                  checked={inputMode === "by_rank"}
                  onChange={() => setInputModePersist("by_rank")}
                />
                <span>
                  <span className="font-medium">Competitor number per rank</span>
                  <span className="text-muted-foreground mt-0.5 block text-sm">
                    In the 1st, 2nd, 3rd rank columns, enter the couple’s or competitor’s number for that place (e.g. 3 for 1st, 4 for 2nd…).
                  </span>
                </span>
              </label>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  inputMode === "by_finalist_order" ? "border-primary bg-accent/40" : "border-border hover:bg-muted/40"
                )}
              >
                <input
                  type="radio"
                  name="final-score-input-mode"
                  className="mt-1"
                  checked={inputMode === "by_finalist_order"}
                  onChange={() => setInputModePersist("by_finalist_order")}
                />
                <span>
                  <span className="font-medium">Rank number by finalist order</span>
                  <span className="text-muted-foreground mt-0.5 block text-sm">
                    Following the list above, for each finalist enter the rank the judge assigned (e.g. if the leftmost couple is 3rd, enter 3 on that row).
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Finalists</CardTitle>
          <CardDescription>
            {inputMode === "by_finalist_order"
              ? competition.division_type === "random_partner" && (finalData?.pairs?.length ?? 0) > 0
                ? "Couples are listed in saved partnership order. On each judge card, in the same order, enter the rank (1–N) for each couple."
                : "List order usually matches stage left-to-right. On each judge card, enter that competitor/couple’s rank on each finalist row."
              : competition.division_type === "random_partner" && (finalData?.pairs?.length ?? 0) > 0
                ? "Couples are listed in partnership order. For each rank, enter either the lead’s or the follow’s competition number."
                : "Enter these numbers in rank order below. Name confirms when you type a number."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {competition.division_type === "random_partner" && !(finalData?.pairs?.length ?? 0) && finalists.some((f) => f.competitor_id) ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Finalists are listed by role until you save couples on{" "}
              <Link className="underline font-medium" to={`/competitions/${competitionId}/final/partnerships`}>
                Final partnerships
              </Link>
              . After saving, this list and ranks use one row per couple (same order as saved pairs).
            </p>
          ) : null}
          <ul className="space-y-1.5 text-sm">
            {finalists.map((f, idx) => {
              const numLabel = f.number != null ? `#${f.number}` : f.numbers?.length ? f.numbers.map((n) => `#${n}`).join(" & ") : "—";
              return (
                <li key={f.pair_id ?? f.competitor_id ?? `f-${idx}`} className="flex gap-2">
                  <span className="font-medium text-muted-foreground min-w-[6rem] tabular-nums">{numLabel}</span>
                  <span>{f.display_name ?? "—"}</span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <div className="space-y-8">
        {judges.map((judge) => {
          const list = padList(entries[judge.id] ?? []);
          return (
            <Card key={judge.id}>
              <CardHeader className="sticky top-[7rem] z-[9] bg-card border-b border-border -mx-6 px-6">
                <CardTitle>{judge.name}</CardTitle>
                <CardDescription>
                  {inputMode === "by_finalist_order"
                    ? `Same order as the finalist list: enter the rank the judge gave on each row (1–${rankCount}). If the same rank is entered twice, the last entry wins.`
                    : competition.division_type === "random_partner" && (finalData?.pairs?.length ?? 0) > 0
                      ? `Rank 1–${rankCount} per couple: enter the lead’s or follow’s competition number. Name confirms.`
                      : `Rank 1–${rankCount} by competitor/pair number. Name confirms.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {inputMode === "by_rank" ? (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {Array.from({ length: rankCount }, (_, i) => (
                      <div key={i} className="space-y-1">
                        <Label className="text-muted-foreground text-xs">Rank {i + 1}</Label>
                        <Input
                          type="number"
                          min={0}
                          placeholder="#"
                          className={inputClass}
                          value={list[i]?.number ?? ""}
                          onChange={(ev) => handleNumberChange(judge.id, i, ev.target.value)}
                        />
                        {list[i]?.displayName && (
                          <p className="text-sm font-medium text-green-600 dark:text-green-400">{list[i].displayName}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {finalists.map((f, fi) => {
                      const numLabel =
                        f.number != null ? `#${f.number}` : f.numbers?.length ? f.numbers.map((n) => `#${n}`).join(" & ") : "—";
                      const orderList = rankLayoutToFinalistOrder(list, finalists, numberToFinalist);
                      const cell = orderList[fi];
                      const r = parseInt(cell?.number ?? "", 10);
                      const invalid = Boolean(cell?.number?.trim()) && (isNaN(r) || r < 1 || r > rankCount);
                      return (
                        <div key={f.pair_id ?? f.competitor_id ?? `fo-${fi}`} className="space-y-1">
                          <Label className="text-muted-foreground text-xs leading-snug">
                            <span className="font-medium text-foreground">{numLabel}</span>
                            <span className="text-muted-foreground"> · </span>
                            {f.display_name ?? "—"}
                          </Label>
                          <Input
                            type="number"
                            min={1}
                            max={rankCount}
                            placeholder="Rank"
                            className={inputClass}
                            value={cell?.number ?? ""}
                            onChange={(ev) => handleFinalistOrderChange(judge.id, fi, ev.target.value)}
                          />
                          {invalid && (
                            <p className="text-destructive text-xs">
                              Enter a rank between 1 and {rankCount}.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PageShell>
  );
}
