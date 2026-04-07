import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { getCompetition, getFinal, getFinalResults, getPrelim, getPrelimResults, downloadFinalExport } from "@/lib/api";
import {
  buildMixMatchResultsSnapshot,
  readAlternatePickBundle,
  readAnnouncedAlternateCount,
  resolveRoleAlternateIds,
} from "@/lib/prelimAlternates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FinalistPrintView } from "@/components/FinalistPrintView";
import type { AlternateEntry } from "@/components/FinalistPrintView";
import { FinalResultsPrintView } from "@/components/FinalResultsPrintView";
import type { AnnouncePlaceDepth } from "@/components/FinalResultsPrintView";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MissingIdState, PageBackLink, PageHeader, PageLoadSkeleton, PageShell } from "@/components/page-frame";

function finalEntityKey(score: { competitor_id?: string; pair_id?: string }): string | null {
  if (score.pair_id) return `p:${score.pair_id}`;
  if (score.competitor_id) return `c:${score.competitor_id}`;
  return null;
}

export default function FinalPage() {
  const { competitionId } = useParams<{ competitionId: string }>();
  const [showFinalistPrint, setShowFinalistPrint] = useState(false);
  const [showResultsPrint, setShowResultsPrint] = useState(false);
  const [announceDepth, setAnnounceDepth] = useState<AnnouncePlaceDepth>(3);

  const { data: competition } = useQuery({
    queryKey: ["competitions", competitionId],
    queryFn: () => getCompetition(competitionId!),
    enabled: !!competitionId,
  });

  const { data: finalData } = useQuery({
    queryKey: ["final", competitionId],
    queryFn: () => getFinal(competitionId!),
    enabled: !!competitionId,
  });

  const { data: results } = useQuery({
    queryKey: ["final-results", competitionId],
    queryFn: () => getFinalResults(competitionId!),
    enabled: !!competitionId,
  });

  const { data: prelimResults } = useQuery({
    queryKey: ["prelim-results", competitionId],
    queryFn: () => getPrelimResults(competitionId!),
    enabled: !!competitionId,
  });

  const { data: prelim } = useQuery({
    queryKey: ["prelim", competitionId],
    queryFn: () => getPrelim(competitionId!),
    enabled: !!competitionId,
  });

  const alternates = useMemo((): AlternateEntry[] => {
    if (!prelim?.heat_slots) return [];
    const altCount = prelim?.config?.alternate_count ?? 0;
    const slots = prelim.heat_slots;
    const nameForComp = (cid?: string) =>
      (cid && slots.find((s) => s.competitor_id === cid)?.display_name) ?? "—";

    if (
      competition?.division_type === "random_partner" &&
      prelimResults?.lead_ranking?.length &&
      prelimResults?.follow_ranking?.length
    ) {
      const announcedPerRole = readAnnouncedAlternateCount(competitionId ?? "");
      const snap = buildMixMatchResultsSnapshot(prelimResults);
      const bundle = readAlternatePickBundle(competitionId ?? "");
      const leadFinal = new Set((finalData?.finalist_leads ?? []).map((f) => f.competitor_id));
      const followFinal = new Set((finalData?.finalist_follows ?? []).map((f) => f.competitor_id));
      const leadAltIds = resolveRoleAlternateIds(
        prelimResults.lead_ranking,
        leadFinal,
        announcedPerRole,
        bundle.lead,
        bundle.snapshot,
        snap
      );
      const followAltIds = resolveRoleAlternateIds(
        prelimResults.follow_ranking,
        followFinal,
        announcedPerRole,
        bundle.follow,
        bundle.snapshot,
        snap
      );
      const n = Math.max(leadAltIds.length, followAltIds.length);
      const out: AlternateEntry[] = [];
      for (let i = 0; i < n; i++) {
        const l = nameForComp(leadAltIds[i]);
        const f = nameForComp(followAltIds[i]);
        out.push({ display_name: `Lead alt ${i + 1}: ${l} — Follow alt ${i + 1}: ${f}` });
      }
      return out;
    }

    if (!prelimResults?.ranking?.length) return [];
    const cut = prelimResults.cut_line_index ?? -1;
    const slice = prelimResults.ranking.slice(cut + 1, cut + 1 + altCount);
    return slice.map((entry) => ({
      display_name: slots.find((s) => s.id === entry.slot_id)?.display_name ?? "—",
    }));
  }, [
    competitionId,
    prelimResults,
    prelim,
    competition?.division_type,
    finalData?.finalist_leads,
    finalData?.finalist_follows,
  ]);

  const judgeVotesByEntityKey = useMemo(() => {
    const map = new Map<string, { judgeName: string; rank: number }[]>();
    const nameById = new Map<string, string>();
    for (const j of finalData?.judges ?? []) {
      nameById.set(j.id, j.name);
    }
    for (const s of finalData?.final_scores ?? []) {
      const key = finalEntityKey(s);
      if (!key) continue;
      const list = map.get(key) ?? [];
      const judgeName = nameById.get(s.judge_id) ?? `Judge ${s.judge_id.slice(0, 8)}…`;
      list.push({ judgeName, rank: s.rank });
      map.set(key, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.rank - b.rank || a.judgeName.localeCompare(b.judgeName));
    }
    return map;
  }, [finalData?.judges, finalData?.final_scores]);

  const announcementPrintRows = useMemo(() => {
    if (!results?.places?.length) return [];
    return results.places
      .filter((p) => p.place <= announceDepth)
      .map((p) => ({ place: p.place, display_name: p.display_name }));
  }, [results?.places, announceDepth]);

  useEffect(() => {
    if (!showResultsPrint) return;
    const onAfterPrint = () => setShowResultsPrint(false);
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, [showResultsPrint]);

  const handleExport = async () => {
    if (!competitionId) return;
    try {
      const blob = await downloadFinalExport(competitionId, "xlsx");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "final-results.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
  };

  if (!competitionId) {
    return <MissingIdState message="Missing competition ID in the URL." backTo="/events" />;
  }
  if (!competition) {
    return <PageLoadSkeleton variant="table" />;
  }

  return (
    <PageShell>
      <PageBackLink to={`/competitions/${competitionId}`}>Competition</PageBackLink>
      <PageHeader title="Final" description={competition.name} />

      {finalData?.finalists?.length ? (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Finalist list</CardTitle>
            <CardDescription>Print finalists, leaders, followers and alternates to paper.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setShowFinalistPrint(true)}>Print finalists</Button>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Partnerships</CardTitle>
          <CardDescription>For random_partner: assign lead + follow for each final pair. Pairs: {finalData?.pairs?.length ?? 0}.</CardDescription>
        </CardHeader>
        <CardContent>
          {competition?.division_type === "random_partner" && (
            <Button asChild><Link to={`/competitions/${competitionId}/final/partnerships`}>Open partnerships</Link></Button>
          )}
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Final scoring</CardTitle>
          <CardDescription>Enter rank 1..N per judge; number entry shows name to confirm.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild><Link to={`/competitions/${competitionId}/final/scoring`}>Open scoring</Link></Button>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>
            Relative Placement final order. Each card shows how every judge ranked that finalist (1 = best on that ballot).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {results?.places?.length ? (
            <div className="space-y-4">
              {results.places.map((row) => {
                const entityKey = row.key ?? "";
                const votes = entityKey ? judgeVotesByEntityKey.get(entityKey) ?? [] : [];
                const place = row.place;
                return (
                  <div
                    key={row.key ?? row.place}
                    className={cn(
                      "rounded-xl border bg-card p-4 sm:p-5 shadow-sm transition-shadow hover:shadow-md",
                      place === 1 &&
                        "border-amber-200/80 bg-gradient-to-br from-amber-50/90 via-card to-card ring-1 ring-amber-300/40 dark:border-amber-900/50 dark:from-amber-950/25 dark:ring-amber-800/30",
                      place === 2 &&
                        "border-slate-200/90 bg-gradient-to-br from-slate-50/80 via-card to-card dark:border-slate-700 dark:from-slate-900/40",
                      place === 3 &&
                        "border-orange-200/70 bg-gradient-to-br from-orange-50/70 via-card to-card dark:border-orange-900/40 dark:from-orange-950/20"
                    )}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
                      <div
                        className={cn(
                          "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold tabular-nums shadow-inner",
                          place === 1 && "bg-amber-100 text-amber-950 dark:bg-amber-900/50 dark:text-amber-50",
                          place === 2 && "bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-50",
                          place === 3 && "bg-orange-100 text-orange-950 dark:bg-orange-900/45 dark:text-orange-50",
                          place > 3 && "bg-muted text-muted-foreground"
                        )}
                        aria-label={`Place ${place}`}
                      >
                        {place}
                      </div>
                      <div className="min-w-0 flex-1 space-y-3">
                        <div>
                          <h3 className="text-lg font-semibold tracking-tight leading-tight">
                            {row.display_name || "—"}
                          </h3>
                          {row.ranks && row.ranks.length > 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Ballot ranks (sorted, for RP tie-break):{" "}
                              <span className="font-mono tabular-nums">{row.ranks.join(" · ")}</span>
                            </p>
                          )}
                        </div>
                        {votes.length > 0 ? (
                          <div>
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Judge breakdown
                            </p>
                            <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
                              {votes.map((v, i) => (
                                <li
                                  key={`${v.judgeName}-${v.rank}-${i}`}
                                  className="inline-flex items-baseline gap-1.5 rounded-full border border-border/80 bg-background/80 px-3 py-1.5 text-sm shadow-sm"
                                >
                                  <span className="max-w-[10rem] truncate font-medium" title={v.judgeName}>
                                    {v.judgeName}
                                  </span>
                                  <span className="text-muted-foreground">→</span>
                                  <span className="tabular-nums font-semibold text-primary">{v.rank}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : finalData?.final_scores?.length ? (
                          <p className="text-xs text-muted-foreground">
                            No scores matched this result row yet.
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Enter scores on Final scoring to see per-judge ranks here.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No results yet.</p>
          )}

          <div
            className={cn(
              "mt-8 border-t border-border pt-8",
              !results?.places?.length && "opacity-60 pointer-events-none"
            )}
          >
            <h3 className="text-base font-semibold tracking-tight mb-1">Print results</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-prose">
              Choose how many places you will call from stage. The printed sheet only lists those places (for MC notes).
            </p>
            <fieldset className="space-y-3 mb-4">
              <legend className="sr-only">Places to include on the announcement printout</legend>
              <Label className="text-sm font-medium text-foreground">How many places will you announce?</Label>
              <div className="space-y-2">
                {(
                  [
                    { depth: 1 as const, label: "1st place only" },
                    { depth: 2 as const, label: "1st and 2nd place" },
                    { depth: 3 as const, label: "1st, 2nd, and 3rd place" },
                  ] as const
                ).map(({ depth, label }) => (
                  <label
                    key={depth}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                  >
                    <input
                      type="radio"
                      name="final-announce-depth"
                      className="h-4 w-4 accent-primary"
                      checked={announceDepth === depth}
                      onChange={() => setAnnounceDepth(depth)}
                      disabled={!results?.places?.length}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Button type="button" disabled={!results?.places?.length} onClick={() => setShowResultsPrint(true)}>
              Print announcement sheet
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
          <CardDescription>Download results as XLSX or CSV.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExport}>Download XLSX</Button>
        </CardContent>
      </Card>

      {/* Preview modal: visible on screen; no-print hides it when printing */}
      {showFinalistPrint &&
        competition &&
        finalData &&
        createPortal(
          <div className="no-print fixed inset-0 z-50 flex flex-col items-center justify-start p-4 bg-black/50">
            <div className="relative flex flex-col w-full max-w-4xl max-h-[90vh] bg-background rounded-lg shadow-lg mt-8">
              <div className="flex items-center justify-between gap-4 p-4 border-b border-border shrink-0">
                <span className="font-semibold">Print preview</span>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      requestAnimationFrame(() => window.print());
                    }}
                  >
                    Print
                  </Button>
                  <Button variant="outline" onClick={() => setShowFinalistPrint(false)}>
                    Close
                  </Button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-auto p-6">
                <FinalistPrintView
                  competitionName={competition.name}
                  finalists={finalData.finalists ?? []}
                  finalistLeads={finalData.finalist_leads ?? []}
                  finalistFollows={finalData.finalist_follows ?? []}
                  alternates={alternates}
                  divisionType={competition.division_type}
                />
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Off-screen until @media print (same pattern as prelim) */}
      {showFinalistPrint &&
        competition &&
        finalData &&
        createPortal(
          <div className="finalist-print-root" aria-hidden="true">
            <FinalistPrintView
              competitionName={competition.name}
              finalists={finalData.finalists ?? []}
              finalistLeads={finalData.finalist_leads ?? []}
              finalistFollows={finalData.finalist_follows ?? []}
              alternates={alternates}
              divisionType={competition.division_type}
            />
          </div>,
          document.body
        )}

      {showResultsPrint &&
        competition &&
        createPortal(
          <div className="no-print fixed inset-0 z-50 flex flex-col items-center justify-start bg-black/50 p-4">
            <div className="relative mt-8 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-background shadow-lg">
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border p-4">
                <span className="font-semibold">Results — print preview</span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => {
                      requestAnimationFrame(() => window.print());
                    }}
                  >
                    Print
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowResultsPrint(false)}>
                    Close
                  </Button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-6">
                <FinalResultsPrintView
                  competitionName={competition.name}
                  announceDepth={announceDepth}
                  rows={announcementPrintRows}
                />
              </div>
            </div>
          </div>,
          document.body
        )}

      {showResultsPrint &&
        competition &&
        createPortal(
          <div className="final-results-print-root" aria-hidden="true">
            <FinalResultsPrintView
              competitionName={competition.name}
              announceDepth={announceDepth}
              rows={announcementPrintRows}
            />
          </div>,
          document.body
        )}
    </PageShell>
  );
}
