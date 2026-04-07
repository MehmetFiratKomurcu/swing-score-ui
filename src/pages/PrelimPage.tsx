import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getCompetition,
  getCompetitors,
  getFinal,
  getPrelim,
  putPrelimConfig,
  generatePrelimHeats,
  reRandomizePrelimHeats,
  getPrelimResults,
  advanceToFinal,
  type HeatSlot,
  type PrelimResponse,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PrelimPrintView, type PrelimPrintMode } from "@/components/PrelimPrintView";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type AlternatePickBundle,
  type AlternatePickMode,
  buildMixMatchResultsSnapshot,
  clampAnnouncedAlternateCount,
  computeRandomTiesAlternateIds,
  defaultAlternatePickBundle,
  readAlternatePickBundle,
  readAnnouncedAlternateCount,
  resolveRoleAlternateIds,
  writeAlternatePickBundle,
  writeAnnouncedAlternateCount,
} from "@/lib/prelimAlternates";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { MissingIdState, PageBackLink, PageHeader, PageLoadSkeleton, PageShell } from "@/components/page-frame";

const RESULTS_RANKINGS_PREVIEW = 10;

function displayNameForPrelimRankingSlot(slotId: string, slots: HeatSlot[]): string {
  const rows = slots.filter((s) => s.id === slotId);
  if (rows.length === 0) return "—";
  const names = [...new Set(rows.map((r) => r.display_name).filter(Boolean))];
  return names.join(" & ") || "—";
}

function displayNameForCompetitor(competitorId: string, slots: HeatSlot[]): string {
  const row = slots.find((s) => s.competitor_id === competitorId);
  return row?.display_name ?? "—";
}

export default function PrelimPage() {
  const { competitionId } = useParams<{ competitionId: string }>();
  const [heatCount, setHeatCount] = useState(3);
  const [yesCount, setYesCount] = useState(6);
  const [altCount, setAltCount] = useState(3);
  const [heatOrder, setHeatOrder] = useState<"asc" | "desc">("asc");
  const [printMode, setPrintMode] = useState<PrelimPrintMode | null>(null);
  const [judgeCopies, setJudgeCopies] = useState(1);
  const [mockJudgeCount, setMockJudgeCount] = useState(0);
  const [mockVotesForPrelim, setMockVotesForPrelim] = useState<"lead" | "follow">("lead");
  const [alternatesRanked, setAlternatesRanked] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(() => new Set());
  const [selectedFollowIds, setSelectedFollowIds] = useState<Set<string>>(() => new Set());
  const [advanceTopNInput, setAdvanceTopNInput] = useState(1);
  const [showZeroVoteResults, setShowZeroVoteResults] = useState(false);
  const [expandMixMatchLeadTable, setExpandMixMatchLeadTable] = useState(false);
  const [expandMixMatchFollowTable, setExpandMixMatchFollowTable] = useState(false);
  const [announcedAlternateCount, setAnnouncedAlternateCount] = useState(1);
  const [altPickBundle, setAltPickBundle] = useState<AlternatePickBundle>(defaultAlternatePickBundle);
  const queryClient = useQueryClient();
  const hasSyncedJudgeCopies = useRef(false);
  const prevFinalistForAltRef = useRef<string | null>(null);

  useEffect(() => {
    hasSyncedJudgeCopies.current = false;
  }, [competitionId]);

  useEffect(() => {
    setShowZeroVoteResults(false);
    setExpandMixMatchLeadTable(false);
    setExpandMixMatchFollowTable(false);
  }, [competitionId]);

  useEffect(() => {
    if (!competitionId) return;
    setAnnouncedAlternateCount(readAnnouncedAlternateCount(competitionId));
  }, [competitionId]);

  useEffect(() => {
    if (!competitionId) {
      setAltPickBundle(defaultAlternatePickBundle());
      prevFinalistForAltRef.current = null;
      return;
    }
    prevFinalistForAltRef.current = null;
    setAltPickBundle(readAlternatePickBundle(competitionId));
  }, [competitionId]);

  const { data: competition } = useQuery({
    queryKey: ["competitions", competitionId],
    queryFn: () => getCompetition(competitionId!),
    enabled: !!competitionId,
  });

  const isRandomPartner = competition?.division_type === "random_partner";

  const { data: finalData, isSuccess: finalQuerySuccess } = useQuery({
    queryKey: ["final", competitionId],
    queryFn: () => getFinal(competitionId!),
    enabled: !!competitionId && !!isRandomPartner,
  });

  const { data: competitorsRes, isSuccess: competitorsQuerySuccess } = useQuery({
    queryKey: ["competitors", competitionId],
    queryFn: () => getCompetitors(competitionId!),
    enabled: !!competitionId && !!isRandomPartner,
  });

  const { data: prelim } = useQuery({
    queryKey: ["prelim", competitionId],
    queryFn: () => getPrelim(competitionId!),
    enabled: !!competitionId,
  });

  useEffect(() => {
    if (!prelim?.has_config) return;
    const c = prelim.config;
    setHeatCount(c.heat_count);
    setYesCount(c.yes_count);
    setAltCount(c.alternate_count);
    setAlternatesRanked(c.alternates_ranked ?? false);
    if (typeof c.yes_count === "number" && c.yes_count > 0) {
      setAdvanceTopNInput(c.yes_count);
    }
  }, [
    competitionId,
    prelim?.has_config,
    prelim?.config.heat_count,
    prelim?.config.yes_count,
    prelim?.config.alternate_count,
    prelim?.config.alternates_ranked,
  ]);

  useEffect(() => {
    if (hasSyncedJudgeCopies.current || !prelim?.judges?.length) return;
    hasSyncedJudgeCopies.current = true;
    setJudgeCopies((c) => (c === 1 ? Math.max(1, prelim.judges!.length) : c));
  }, [prelim?.judges?.length]);

  // Close preview when print dialog is closed (after print or cancel)
  useEffect(() => {
    if (!printMode) return;
    const onAfterPrint = () => setPrintMode(null);
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, [printMode]);

  const {
    data: results,
    isPending: resultsPending,
    isError: resultsQueryError,
    error: resultsFetchError,
  } = useQuery({
    queryKey: ["prelim-results", competitionId],
    queryFn: () => getPrelimResults(competitionId!),
    enabled: !!competitionId,
    refetchOnMount: "always",
  });

  const advanceMutation = useMutation({
    mutationFn: (body: { competitor_ids?: string[]; pair_ids?: string[] }) => advanceToFinal(competitionId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prelim-results", competitionId] });
      queryClient.invalidateQueries({ queryKey: ["final", competitionId] });
      toast.success("Advanced to final");
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    setSelectedLeadIds(new Set());
    setSelectedFollowIds(new Set());
  }, [competitionId]);

  const serverAdvanceKey = useMemo(() => {
    const ids =
      finalData?.advanced_to_final
        ?.filter((a) => a.competitor_id)
        .map((a) => a.competitor_id as string) ?? [];
    return [...ids].sort().join(",");
  }, [finalData?.advanced_to_final]);

  const competitorRolesKey = useMemo(
    () =>
      (competitorsRes?.competitors ?? [])
        .map((c) => `${c.id}:${c.role}`)
        .sort()
        .join("|"),
    [competitorsRes?.competitors]
  );

  useEffect(() => {
    if (!competitionId || !isRandomPartner) return;
    if (!finalQuerySuccess || !competitorsQuerySuccess) return;

    const roleById = new Map<string, "lead" | "follow" | "solo">();
    for (const c of competitorsRes?.competitors ?? []) {
      roleById.set(c.id, c.role);
    }

    const leads = new Set<string>();
    const follows = new Set<string>();
    for (const row of finalData?.advanced_to_final ?? []) {
      if (!row.competitor_id) continue;
      const role = roleById.get(row.competitor_id);
      if (role === "lead") leads.add(row.competitor_id);
      else if (role === "follow") follows.add(row.competitor_id);
    }

    setSelectedLeadIds(leads);
    setSelectedFollowIds(follows);
  }, [
    competitionId,
    isRandomPartner,
    finalQuerySuccess,
    competitorsQuerySuccess,
    serverAdvanceKey,
    competitorRolesKey,
  ]);

  const putConfigMutation = useMutation({
    mutationFn: (body: {
      heat_count: number;
      yes_count: number;
      alternate_count: number;
      alternates_ranked: boolean;
    }) => putPrelimConfig(competitionId!, body),
    onSuccess: (saved) => {
      queryClient.setQueryData<PrelimResponse>(["prelim", competitionId], (old) => {
        if (!old) {
          return {
            config: saved,
            has_config: true,
            heats: [],
            heat_slots: [],
            judges: [],
          };
        }
        return {
          ...old,
          has_config: true,
          config: { ...old.config, ...saved },
        };
      });
      queryClient.invalidateQueries({ queryKey: ["prelim", competitionId] });
      toast.success("Config saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const generateMutation = useMutation({
    mutationFn: () => generatePrelimHeats(competitionId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prelim", competitionId] });
      queryClient.invalidateQueries({ queryKey: ["prelim-results", competitionId] });
      toast.success("Heats generated");
    },
    onError: (e) => toast.error(e.message),
  });

  const reRandomizeMutation = useMutation({
    mutationFn: () => reRandomizePrelimHeats(competitionId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prelim", competitionId] });
      queryClient.invalidateQueries({ queryKey: ["prelim-results", competitionId] });
      toast.success("Heats re-randomized");
    },
    onError: (e) => toast.error(e.message),
  });

  const heats = prelim?.heats ?? [];
  const slots = prelim?.heat_slots ?? [];
  const savedPrelimScoreCount = prelim?.scores?.length ?? 0;
  const sortedHeats = useMemo(
    () =>
      [...heats].sort((a, b) =>
        heatOrder === "asc" ? a.heat_number - b.heat_number : b.heat_number - a.heat_number
      ),
    [heats, heatOrder]
  );
  const slotCountByHeatId = useMemo(() => {
    const byHeat = new Map<string, Set<string>>();
    for (const slot of slots) {
      const set = byHeat.get(slot.heat_id) ?? new Set();
      set.add(slot.id);
      byHeat.set(slot.heat_id, set);
    }
    const out = new Map<string, number>();
    byHeat.forEach((set, heatId) => out.set(heatId, set.size));
    return out;
  }, [slots]);

  const prelimRankingRows = useMemo(() => {
    if (!results?.ranking?.length) return [];
    const cut = results.cut_line_index ?? -1;
    return results.ranking.map((entry, index) => ({
      key: `${entry.slot_id}-${index}`,
      rank: index + 1,
      slotId: entry.slot_id,
      displayName: displayNameForPrelimRankingSlot(entry.slot_id, slots),
      yesCount: entry.yes_count,
      altCount: entry.alt_count,
      madeCut: cut >= 0 && index <= cut,
    }));
  }, [results, slots]);

  const mixMatchLeadRows = useMemo(() => {
    if (!results?.lead_ranking?.length) return [];
    const cut = results.lead_cut_line_index ?? -1;
    return results.lead_ranking.map((entry, index) => ({
      key: `${entry.competitor_id ?? entry.slot_id}-${index}`,
      rank: index + 1,
      competitorId: entry.competitor_id ?? "",
      displayName: entry.competitor_id ? displayNameForCompetitor(entry.competitor_id, slots) : "—",
      yesCount: entry.yes_count,
      altCount: entry.alt_count,
      madeCut: cut >= 0 && index <= cut,
    }));
  }, [results, slots]);

  const mixMatchFollowRows = useMemo(() => {
    if (!results?.follow_ranking?.length) return [];
    const cut = results.follow_cut_line_index ?? -1;
    return results.follow_ranking.map((entry, index) => ({
      key: `${entry.competitor_id ?? entry.slot_id}-${index}`,
      rank: index + 1,
      competitorId: entry.competitor_id ?? "",
      displayName: entry.competitor_id ? displayNameForCompetitor(entry.competitor_id, slots) : "—",
      yesCount: entry.yes_count,
      altCount: entry.alt_count,
      madeCut: cut >= 0 && index <= cut,
    }));
  }, [results, slots]);

  const mixMatchLeadRowsForResults = useMemo(() => {
    if (showZeroVoteResults) return mixMatchLeadRows;
    return mixMatchLeadRows.filter((r) => r.yesCount > 0 || r.altCount > 0);
  }, [mixMatchLeadRows, showZeroVoteResults]);

  const mixMatchFollowRowsForResults = useMemo(() => {
    if (showZeroVoteResults) return mixMatchFollowRows;
    return mixMatchFollowRows.filter((r) => r.yesCount > 0 || r.altCount > 0);
  }, [mixMatchFollowRows, showZeroVoteResults]);

  const mixMatchLeadRowsResultsVisible = useMemo(() => {
    const all = mixMatchLeadRowsForResults;
    if (all.length <= RESULTS_RANKINGS_PREVIEW || expandMixMatchLeadTable) return all;
    return all.slice(0, RESULTS_RANKINGS_PREVIEW);
  }, [mixMatchLeadRowsForResults, expandMixMatchLeadTable]);

  const mixMatchFollowRowsResultsVisible = useMemo(() => {
    const all = mixMatchFollowRowsForResults;
    if (all.length <= RESULTS_RANKINGS_PREVIEW || expandMixMatchFollowTable) return all;
    return all.slice(0, RESULTS_RANKINGS_PREVIEW);
  }, [mixMatchFollowRowsForResults, expandMixMatchFollowTable]);

  const mixMatchLeadResultsHidden = Math.max(0, mixMatchLeadRowsForResults.length - RESULTS_RANKINGS_PREVIEW);
  const mixMatchFollowResultsHidden = Math.max(0, mixMatchFollowRowsForResults.length - RESULTS_RANKINGS_PREVIEW);

  const prelimRankingRowsForResults = useMemo(() => {
    if (showZeroVoteResults) return prelimRankingRows;
    return prelimRankingRows.filter((r) => r.yesCount > 0 || r.altCount > 0);
  }, [prelimRankingRows, showZeroVoteResults]);

  const zeroVoteHiddenCount = useMemo(() => {
    if (isRandomPartner) {
      const zl = mixMatchLeadRows.filter((r) => r.yesCount === 0 && r.altCount === 0).length;
      const zf = mixMatchFollowRows.filter((r) => r.yesCount === 0 && r.altCount === 0).length;
      return zl + zf;
    }
    return prelimRankingRows.filter((r) => r.yesCount === 0 && r.altCount === 0).length;
  }, [isRandomPartner, mixMatchLeadRows, mixMatchFollowRows, prelimRankingRows]);

  const resultsSnapshotKey = useMemo(() => {
    if (!results || !isRandomPartner) return "";
    return buildMixMatchResultsSnapshot(results);
  }, [results, isRandomPartner]);

  const finalistSnap = useMemo(
    () => `${[...selectedLeadIds].sort().join(",")}||${[...selectedFollowIds].sort().join(",")}`,
    [selectedLeadIds, selectedFollowIds]
  );

  useEffect(() => {
    if (!competitionId || !isRandomPartner || !resultsSnapshotKey) return;
    setAltPickBundle((b) => {
      if (b.snapshot === resultsSnapshotKey) return b;
      const next: AlternatePickBundle = {
        snapshot: resultsSnapshotKey,
        lead: { ...b.lead, randomIds: undefined },
        follow: { ...b.follow, randomIds: undefined },
      };
      writeAlternatePickBundle(competitionId, next);
      return next;
    });
  }, [competitionId, isRandomPartner, resultsSnapshotKey]);

  useEffect(() => {
    if (!competitionId || !isRandomPartner) return;
    if (prevFinalistForAltRef.current === null) {
      prevFinalistForAltRef.current = finalistSnap;
      return;
    }
    if (prevFinalistForAltRef.current === finalistSnap) return;
    prevFinalistForAltRef.current = finalistSnap;
    setAltPickBundle((b) => {
      const next: AlternatePickBundle = {
        ...b,
        snapshot: resultsSnapshotKey,
        lead: { ...b.lead, randomIds: undefined },
        follow: { ...b.follow, randomIds: undefined },
      };
      writeAlternatePickBundle(competitionId, next);
      return next;
    });
  }, [competitionId, isRandomPartner, finalistSnap, resultsSnapshotKey]);

  /** If legacy data kept separate lead/follow ordering rules, normalize to a single rule (lead mode wins). */
  useEffect(() => {
    if (!competitionId || !isRandomPartner) return;
    setAltPickBundle((b) => {
      if (b.lead.mode === b.follow.mode) return b;
      const cap = clampAnnouncedAlternateCount(announcedAlternateCount);
      const mode = b.lead.mode;
      const pickFor = (prev: AlternatePickBundle["lead"]): AlternatePickBundle["lead"] => {
        if (mode === "rp") return { mode: "rp" };
        if (mode === "random_ties") {
          if (prev.mode === "random_ties" && prev.randomIds && prev.randomIds.length > 0) {
            return { mode: "random_ties", randomIds: prev.randomIds };
          }
          return { mode: "random_ties", randomIds: undefined };
        }
        const slots = (prev.mode === "manual" ? (prev.manualSlots ?? []) : []).slice(0, cap);
        while (slots.length < cap) slots.push("");
        return { mode: "manual", manualSlots: slots };
      };
      const snap = resultsSnapshotKey || b.snapshot;
      const next = { ...b, snapshot: snap, lead: pickFor(b.lead), follow: pickFor(b.follow) };
      writeAlternatePickBundle(competitionId, next);
      return next;
    });
  }, [
    competitionId,
    isRandomPartner,
    altPickBundle.lead.mode,
    altPickBundle.follow.mode,
    announcedAlternateCount,
    resultsSnapshotKey,
  ]);

  useEffect(() => {
    if (
      !competitionId ||
      !isRandomPartner ||
      !results?.lead_ranking?.length ||
      !results?.follow_ranking?.length ||
      !resultsSnapshotKey
    )
      return;
    setAltPickBundle((b) => {
      if (b.lead.mode !== "random_ties" || b.follow.mode !== "random_ties") return b;
      const leadOk = Boolean(b.lead.randomIds && b.lead.randomIds.length > 0);
      const followOk = Boolean(b.follow.randomIds && b.follow.randomIds.length > 0);
      if (leadOk && followOk) return b;
      const cap = clampAnnouncedAlternateCount(announcedAlternateCount);
      const leadIds = leadOk
        ? b.lead.randomIds!
        : computeRandomTiesAlternateIds(results.lead_ranking!, selectedLeadIds, cap, Math.random);
      const followIds = followOk
        ? b.follow.randomIds!
        : computeRandomTiesAlternateIds(results.follow_ranking!, selectedFollowIds, cap, Math.random);
      const next = {
        ...b,
        snapshot: resultsSnapshotKey,
        lead: { ...b.lead, randomIds: leadIds },
        follow: { ...b.follow, randomIds: followIds },
      };
      writeAlternatePickBundle(competitionId, next);
      return next;
    });
  }, [
    competitionId,
    isRandomPartner,
    results?.lead_ranking,
    results?.follow_ranking,
    resultsSnapshotKey,
    announcedAlternateCount,
    finalistSnap,
    altPickBundle.lead.mode,
    altPickBundle.follow.mode,
    altPickBundle.lead.randomIds,
    altPickBundle.follow.randomIds,
  ]);

  const resolvedLeadAltIds = useMemo(() => {
    if (!results?.lead_ranking?.length) return [];
    const cap = clampAnnouncedAlternateCount(announcedAlternateCount);
    return resolveRoleAlternateIds(
      results.lead_ranking,
      selectedLeadIds,
      cap,
      altPickBundle.lead,
      altPickBundle.snapshot,
      resultsSnapshotKey
    );
  }, [
    results?.lead_ranking,
    selectedLeadIds,
    announcedAlternateCount,
    altPickBundle.lead,
    altPickBundle.snapshot,
    resultsSnapshotKey,
  ]);

  const resolvedFollowAltIds = useMemo(() => {
    if (!results?.follow_ranking?.length) return [];
    const cap = clampAnnouncedAlternateCount(announcedAlternateCount);
    return resolveRoleAlternateIds(
      results.follow_ranking,
      selectedFollowIds,
      cap,
      altPickBundle.follow,
      altPickBundle.snapshot,
      resultsSnapshotKey
    );
  }, [
    results?.follow_ranking,
    selectedFollowIds,
    announcedAlternateCount,
    altPickBundle.follow,
    altPickBundle.snapshot,
    resultsSnapshotKey,
  ]);

  const officialLeadAlternateRank = useMemo(() => {
    const m = new Map<string, number>();
    resolvedLeadAltIds.forEach((id, i) => m.set(id, i + 1));
    return m;
  }, [resolvedLeadAltIds]);

  const officialFollowAlternateRank = useMemo(() => {
    const m = new Map<string, number>();
    resolvedFollowAltIds.forEach((id, i) => m.set(id, i + 1));
    return m;
  }, [resolvedFollowAltIds]);

  const officialAlternatesAnnouncement = useMemo(() => {
    const leadNames = [...officialLeadAlternateRank.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([id, r]) => {
        const row = mixMatchLeadRows.find((x) => x.competitorId === id);
        return `${r}. ${row?.displayName ?? "—"}`;
      });
    const followNames = [...officialFollowAlternateRank.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([id, r]) => {
        const row = mixMatchFollowRows.find((x) => x.competitorId === id);
        return `${r}. ${row?.displayName ?? "—"}`;
      });
    return { leadNames, followNames };
  }, [mixMatchLeadRows, mixMatchFollowRows, officialLeadAlternateRank, officialFollowAlternateRank]);

  useEffect(() => {
    if (!isRandomPartner || !results?.lead_ranking?.length || !results.follow_ranking?.length) {
      setSelectedLeadIds(new Set());
      setSelectedFollowIds(new Set());
      return;
    }
    const lr = results.lead_ranking;
    const fr = results.follow_ranking;
    const lc = results.lead_cut_line_index ?? -1;
    const fc = results.follow_cut_line_index ?? -1;
    const nLead = lc >= 0 ? lc + 1 : 0;
    const nFol = fc >= 0 ? fc + 1 : 0;
    let k = nLead > 0 && nFol > 0 ? Math.min(nLead, nFol) : 0;
    if (k === 0) {
      const yc = prelim?.config?.yes_count;
      if (typeof yc === "number" && yc > 0) {
        k = Math.min(yc, lr.length, fr.length);
      }
    }
    if (k === 0) {
      setSelectedLeadIds(new Set());
      setSelectedFollowIds(new Set());
      return;
    }
    const leadIds = lr.slice(0, k).map((e) => e.competitor_id).filter(Boolean) as string[];
    const followIds = fr.slice(0, k).map((e) => e.competitor_id).filter(Boolean) as string[];
    setSelectedLeadIds(new Set(leadIds));
    setSelectedFollowIds(new Set(followIds));
  }, [competitionId, isRandomPartner, resultsSnapshotKey, prelim?.config?.yes_count]);

  const toggleLeadAdvance = (competitorId: string) => {
    if (!competitorId) return;
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(competitorId)) next.delete(competitorId);
      else next.add(competitorId);
      return next;
    });
  };

  const toggleFollowAdvance = (competitorId: string) => {
    if (!competitorId) return;
    setSelectedFollowIds((prev) => {
      const next = new Set(prev);
      if (next.has(competitorId)) next.delete(competitorId);
      else next.add(competitorId);
      return next;
    });
  };

  const altCapResolved = clampAnnouncedAlternateCount(announcedAlternateCount);

  const leadManualOptionsForSlot = (slotIndex: number) => {
    const slots = altPickBundle.lead.manualSlots ?? [];
    const other = new Set(
      slots.map((s, j) => (j !== slotIndex ? s.trim() : "")).filter(Boolean)
    );
    const cur = (slots[slotIndex] ?? "").trim();
    const base = mixMatchLeadRows
      .filter((r) => r.competitorId && !selectedLeadIds.has(r.competitorId))
      .filter((r) => !other.has(r.competitorId) || r.competitorId === cur)
      .map((r) => ({
        value: r.competitorId,
        label: `${r.displayName} (${r.yesCount}Y / ${r.altCount}A)`,
      }));
    return [{ value: "", label: "— Fill with next in RP order" }, ...base];
  };

  const followManualOptionsForSlot = (slotIndex: number) => {
    const slots = altPickBundle.follow.manualSlots ?? [];
    const other = new Set(
      slots.map((s, j) => (j !== slotIndex ? s.trim() : "")).filter(Boolean)
    );
    const cur = (slots[slotIndex] ?? "").trim();
    const base = mixMatchFollowRows
      .filter((r) => r.competitorId && !selectedFollowIds.has(r.competitorId))
      .filter((r) => !other.has(r.competitorId) || r.competitorId === cur)
      .map((r) => ({
        value: r.competitorId,
        label: `${r.displayName} (${r.yesCount}Y / ${r.altCount}A)`,
      }));
    return [{ value: "", label: "— Fill with next in RP order" }, ...base];
  };

  /** Mix & match: single ordering rule; lead/follow counts must already match. */
  const setUnifiedAltMode = (mode: AlternatePickMode) => {
    if (!competitionId) return;
    setAltPickBundle((b) => {
      const pickFor = (prev: AlternatePickBundle["lead"]): AlternatePickBundle["lead"] => {
        if (mode === "rp") return { mode: "rp" };
        if (mode === "random_ties") return { mode: "random_ties", randomIds: undefined };
        const slots = (prev.mode === "manual" ? (prev.manualSlots ?? []) : []).slice(0, altCapResolved);
        while (slots.length < altCapResolved) slots.push("");
        return { mode: "manual", manualSlots: slots };
      };
      const snap = resultsSnapshotKey || b.snapshot;
      const next = { ...b, snapshot: snap, lead: pickFor(b.lead), follow: pickFor(b.follow) };
      writeAlternatePickBundle(competitionId, next);
      return next;
    });
  };

  const rerollBothRandomAlternates = () => {
    if (!competitionId || !results?.lead_ranking?.length || !results?.follow_ranking?.length) return;
    const leadIds = computeRandomTiesAlternateIds(results.lead_ranking, selectedLeadIds, altCapResolved, Math.random);
    const followIds = computeRandomTiesAlternateIds(
      results.follow_ranking,
      selectedFollowIds,
      altCapResolved,
      Math.random
    );
    setAltPickBundle((b) => {
      const snap = resultsSnapshotKey || b.snapshot;
      const next = {
        ...b,
        snapshot: snap,
        lead: { ...b.lead, mode: "random_ties" as const, randomIds: leadIds },
        follow: { ...b.follow, mode: "random_ties" as const, randomIds: followIds },
      };
      writeAlternatePickBundle(competitionId, next);
      return next;
    });
    toast.success("Alternates refreshed by random draw (lead and follow).");
  };

  const setLeadManualSlot = (index: number, value: string) => {
    if (!competitionId) return;
    setAltPickBundle((b) => {
      const slots = [...(b.lead.manualSlots ?? Array(altCapResolved).fill(""))];
      while (slots.length < altCapResolved) slots.push("");
      slots[index] = value;
      const snap = resultsSnapshotKey || b.snapshot;
      let follow = b.follow;
      if (follow.mode !== "manual") {
        const fs = Array<string>(altCapResolved).fill("");
        follow = { mode: "manual" as const, manualSlots: fs };
      } else {
        const fs = [...(follow.manualSlots ?? [])];
        while (fs.length < altCapResolved) fs.push("");
        follow = { mode: "manual" as const, manualSlots: fs.slice(0, altCapResolved) };
      }
      const next = { ...b, snapshot: snap, lead: { mode: "manual" as const, manualSlots: slots }, follow };
      writeAlternatePickBundle(competitionId, next);
      return next;
    });
  };

  const setFollowManualSlot = (index: number, value: string) => {
    if (!competitionId) return;
    setAltPickBundle((b) => {
      const slots = [...(b.follow.manualSlots ?? Array(altCapResolved).fill(""))];
      while (slots.length < altCapResolved) slots.push("");
      slots[index] = value;
      const snap = resultsSnapshotKey || b.snapshot;
      let lead = b.lead;
      if (lead.mode !== "manual") {
        const ls = Array<string>(altCapResolved).fill("");
        lead = { mode: "manual" as const, manualSlots: ls };
      } else {
        const ls = [...(lead.manualSlots ?? [])];
        while (ls.length < altCapResolved) ls.push("");
        lead = { mode: "manual" as const, manualSlots: ls.slice(0, altCapResolved) };
      }
      const next = { ...b, snapshot: snap, lead, follow: { mode: "manual" as const, manualSlots: slots } };
      writeAlternatePickBundle(competitionId, next);
      return next;
    });
  };

  const applyAdvanceTopNFromInputs = () => {
    const n = Math.floor(Number(advanceTopNInput));
    if (isNaN(n) || n < 1) {
      toast.error("Enter a positive number (how many per role).");
      return;
    }
    const maxN = Math.min(mixMatchLeadRows.length, mixMatchFollowRows.length);
    const take = Math.min(n, maxN);
    if (take < 1) {
      toast.error("No rankings to select.");
      return;
    }
    if (n > maxN) {
      toast.info(`Only ${maxN} couples in prelim; selected ${take} per role.`);
    }
    setSelectedLeadIds(
      new Set(
        mixMatchLeadRows
          .slice(0, take)
          .map((r) => r.competitorId)
          .filter(Boolean)
      )
    );
    setSelectedFollowIds(
      new Set(
        mixMatchFollowRows
          .slice(0, take)
          .map((r) => r.competitorId)
          .filter(Boolean)
      )
    );
  };

  /** Announced alternates: RP, random among ties, or manual — configured in Advance card. */
  const advanceListRoleTag = (competitorId: string, selected: Set<string>, officialRank: Map<string, number>) => {
    if (!competitorId || selected.has(competitorId)) return null;
    const r = officialRank.get(competitorId);
    if (r == null) return null;
    return (
      <span className="ml-2 inline-flex items-center rounded-full border border-amber-400/45 bg-amber-400/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950 dark:border-amber-500/35 dark:bg-amber-400/10 dark:text-amber-100">
        Alternate{r > 1 ? ` ${r}` : ""}
      </span>
    );
  };

  const reapplyAdvanceSuggestionFromCut = () => {
    if (!results?.lead_ranking?.length || !results.follow_ranking?.length) return;
    const lr = results.lead_ranking;
    const fr = results.follow_ranking;
    const lc = results.lead_cut_line_index ?? -1;
    const fc = results.follow_cut_line_index ?? -1;
    const nLead = lc >= 0 ? lc + 1 : 0;
    const nFol = fc >= 0 ? fc + 1 : 0;
    let k = nLead > 0 && nFol > 0 ? Math.min(nLead, nFol) : 0;
    if (k === 0) {
      const yc = prelim?.config?.yes_count;
      if (typeof yc === "number" && yc > 0) {
        k = Math.min(yc, lr.length, fr.length);
      }
    }
    if (k === 0) {
      setSelectedLeadIds(new Set());
      setSelectedFollowIds(new Set());
      toast.info('No automatic cut (majority). Use "Select first N" or check names manually.');
      return;
    }
    setSelectedLeadIds(new Set(lr.slice(0, k).map((e) => e.competitor_id).filter(Boolean) as string[]));
    setSelectedFollowIds(new Set(fr.slice(0, k).map((e) => e.competitor_id).filter(Boolean) as string[]));
  };

  if (!competitionId) {
    return <MissingIdState message="Missing competition ID in the URL." backTo="/events" />;
  }
  if (!competition) {
    return <PageLoadSkeleton variant="table" />;
  }

  const hasConfig = prelim?.has_config ?? false;

  const requestGenerateHeats = () => {
    if (heats.length > 0) {
      const msg =
        savedPrelimScoreCount > 0
          ? "This replaces all prelim heats and permanently deletes every saved prelim score. Continue?"
          : "This replaces all prelim heats and assignments. Continue?";
      if (!window.confirm(msg)) return;
    }
    generateMutation.mutate();
  };

  const requestReRandomizePrelim = () => {
    if (
      !window.confirm(
        "This re-randomizes prelim pairings and permanently deletes all saved prelim scores. Continue?"
      )
    ) {
      return;
    }
    reRandomizeMutation.mutate();
  };

  return (
    <PageShell>
      <PageBackLink to={`/competitions/${competitionId}`}>Competition</PageBackLink>
      <PageHeader title="Prelim" description={competition.name} />

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Setup</CardTitle>
          <CardDescription>
            Heat count, ballot sizes (Yes / Alternate), and whether maybe/alternates are ranked. Yes count is <strong>not</strong> finalist count or RP cut.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4 flex-wrap items-end">
          <div className="space-y-2">
            <Label>Heat count</Label>
            <Input type="number" min={1} value={heatCount} onChange={(e) => setHeatCount(Number(e.target.value))} />
          </div>
          <div className="space-y-2 max-w-[11rem]">
            <Label>Yes count</Label>
            <Input type="number" min={0} value={yesCount} onChange={(e) => setYesCount(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label>Alternate count</Label>
            <Input type="number" min={0} value={altCount} onChange={(e) => setAltCount(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prelim-alt-ranked">Maybe / alternates</Label>
            <Select
              id="prelim-alt-ranked"
              options={[
                { value: "unranked", label: "Unranked (any order)" },
                { value: "ranked", label: "Ranked (preference order)" },
              ]}
              value={alternatesRanked ? "ranked" : "unranked"}
              onChange={(e) => setAlternatesRanked(e.target.value === "ranked")}
              className="w-[14rem]"
            />
          </div>
          <Button
            onClick={() =>
              putConfigMutation.mutate({
                heat_count: heatCount,
                yes_count: yesCount,
                alternate_count: altCount,
                alternates_ranked: alternatesRanked,
              })
            }
            disabled={putConfigMutation.isPending}
          >
            Save config
          </Button>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Heats</CardTitle>
          <CardDescription>Generate or re-randomize heats (random_partner only for re-randomize).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-4 items-end">
            <Button onClick={requestGenerateHeats} disabled={!hasConfig || generateMutation.isPending}>
              Generate heats
            </Button>
            {competition.division_type === "random_partner" && heats.length > 0 && (
              <Button variant="outline" onClick={requestReRandomizePrelim} disabled={reRandomizeMutation.isPending}>
                Re-randomize
              </Button>
            )}
            {heats.length > 0 && (
              <div className="flex items-center gap-2">
                <Label htmlFor="heat-order" className="text-sm text-muted-foreground">By number</Label>
                <Select
                  id="heat-order"
                  options={[
                    { value: "asc", label: "1 → n (ascending)" },
                    { value: "desc", label: "n → 1 (descending)" },
                  ]}
                  value={heatOrder}
                  onChange={(e) => setHeatOrder(e.target.value as "asc" | "desc")}
                  className="w-[11rem]"
                />
              </div>
            )}
            {heats.length > 0 && slots.length > 0 && (
              <Button variant="secondary" asChild>
                <Link to={`/competitions/${competitionId}/prelim/heat-layout`}>Heat layout (drag and drop)</Link>
              </Button>
            )}
          </div>
          {heats.length > 0 && (
            <>
              <p className="text-sm text-muted-foreground">{heats.length} heat(s), {slots.length} slot(s).</p>
              <ul className="text-sm list-disc list-inside space-y-1">
                {sortedHeats.map((heat) => {
                  const slotCount = slotCountByHeatId.get(heat.id) ?? 0;
                  return (
                    <li key={heat.id}>
                      Heat {heat.heat_number}
                      {slotCount > 0 && <span className="text-muted-foreground"> — {slotCount} slot(s)</span>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {heats.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Printing</CardTitle>
            <CardDescription>Print judge sheets, MC & Staff summary, or mock judge sheets.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-2">
                <Label htmlFor="judge-copies">Copies</Label>
                <Input
                  id="judge-copies"
                  type="number"
                  min={1}
                  className="w-24"
                  value={judgeCopies}
                  onChange={(e) => setJudgeCopies(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <Button
                onClick={() => setPrintMode("judge")}
                disabled={!heats.length}
              >
                Print judge sheets
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              One page per heat per copy, then one <strong>vote summary</strong> page per copy with empty cells: YES count and Maybe (ALT) count from config. Mix &amp; Match: copy 1 matches prelim judge 1 (lead or follow sheet), copy 2 judge 2, etc. Ranked vs unranked alternates follow your <strong>saved prelim config</strong> (summary page wording and numbered maybe boxes when ranked).
            </p>

            <div className="border-t border-border pt-6">
              <Button variant="outline" onClick={() => setPrintMode("mc-staff")} disabled={!heats.length}>
                Print MC & Staff sheet
              </Button>
              <p className="text-sm text-muted-foreground mt-2">
                Summary page (heats, dancer counts, judges), then one page per heat with every dancer’s number and name.
              </p>
            </div>

            <div className="border-t border-border pt-6">
              <div className="flex flex-wrap gap-4 items-end mb-2">
                <div className="space-y-2">
                  <Label htmlFor="mock-judges">Number of mock judges</Label>
                  <Input
                    id="mock-judges"
                    type="number"
                    min={0}
                    className="w-24"
                    value={mockJudgeCount}
                    onChange={(e) => setMockJudgeCount(Math.max(0, Number(e.target.value) || 0))}
                  />
                </div>
                {competition.division_type === "random_partner" && (
                  <div className="space-y-2">
                    <Label htmlFor="mock-votes-role">Mock scores (Mix &amp; Match)</Label>
                    <Select
                      id="mock-votes-role"
                      options={[
                        { value: "lead", label: "Lead" },
                        { value: "follow", label: "Follow" },
                      ]}
                      value={mockVotesForPrelim}
                      onChange={(e) => setMockVotesForPrelim(e.target.value as "lead" | "follow")}
                      className="w-[10rem]"
                    />
                  </div>
                )}
                <Button
                  variant="outline"
                  onClick={() => setPrintMode("mock")}
                  disabled={mockJudgeCount < 1 || !heats.length}
                >
                  Print mock judge sheets
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {competition.division_type === "random_partner"
                  ? "Same rows and layout as judge sheets for the chosen role (Lead or Follow). Labeled Mock Judge 1, 2, …, each with the same vote summary page as real judge sheets."
                  : "Extra sheets for practice judges (same heat content + vote summary page, labeled Mock Judge 1, 2, …)."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Scoring</CardTitle>
          <CardDescription>Enter competitor/pair numbers for YES and ALT; name appears to confirm.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild><Link to={`/competitions/${competitionId}/prelim/scoring`}>Open scoring</Link></Button>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>
            {isRandomPartner
              ? "Leads ranked from lead judges only; follows from follow judges only (Relative Placement per role)."
              : "Relative Placement ranking and cut line."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {resultsPending && <p className="text-muted-foreground text-sm">Loading results…</p>}
          {resultsQueryError && (
            <p className="text-destructive text-sm">
              Results could not be loaded{resultsFetchError instanceof Error ? `: ${resultsFetchError.message}` : ""}. Check that the API is running and{" "}
              <code className="text-xs">VITE_ADMIN_TOKEN</code> matches the server if auth is enabled.
            </p>
          )}
          {!resultsPending && !resultsQueryError && results && !isRandomPartner && (
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong>RP cut</strong> (0-based last index in sorted order that still has majority YES or YES+ALT): {results.cut_line_index}. Judges: {results.judge_count}. Slots ranked:{" "}
                {results.ranking?.length ?? 0}. If cut is <strong>1</strong>, only the top <strong>two</strong> places in that order meet the threshold — not “2 out of 10” from Setup.
              </p>
              <p>
                <strong>Setup Yes count</strong> (e.g. 10) only limits how many YES each judge may give on paper. It is <strong>not</strong> used to compute this cut.
              </p>
              <p>
                <strong>Cut</strong> uses Relative Placement with majority ⌊J/2⌋+1 on tallies — not how many finalists you intend.
              </p>
            </div>
          )}
          {!resultsPending && !resultsQueryError && results && isRandomPartner && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground space-y-2">
                <p>
                  Lead judges: {results.lead_judge_count ?? 0} — <strong>RP cut</strong> index {results.lead_cut_line_index ?? -1}. Follow judges: {results.follow_judge_count ?? 0} — <strong>RP cut</strong> index{" "}
                  {results.follow_cut_line_index ?? -1}. Total prelim judges: {results.judge_count}.
                </p>
                <p className="text-xs rounded-md border border-border bg-muted/40 p-2">
                  <strong className="text-foreground">Why isn’t cut = your Yes count (10)?</strong> Setup <strong>Yes count</strong> is only how many YES each <em>judge</em> may mark on the ballot. <strong>RP cut</strong> is computed only from
                  vote totals and majority (⌊J/2⌋+1 per role). A cut index of <strong>1</strong> means only the top <strong>two</strong> ranks in sorted order still hit YES or YES+ALT majority — it can stay low even when Yes count is 10.
                </p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">How cut works (Mix &amp; Match)</p>
                <p>
                  For each role, if there are J judges, majority is <strong>M = ⌊J/2⌋ + 1</strong>. Rows are sorted by Relative Placement (YES majority first, then YES+ALT majority, then vote counts). The{" "}
                  <strong>cut</strong> is the last place in that order where someone still has at least M YES or M total YES+ALT — it is <strong>not</strong> your Setup Yes count and <strong>not</strong> your chosen finalist count.
                </p>
                <p>
                  Finalists and <strong>announced alternates</strong> are configured in the <strong>Advance to final</strong> section below (checkboxes + alternate order). Results tables here focus on scores and cut.
                </p>
              </div>
            </div>
          )}
          {!resultsPending && !resultsQueryError && isRandomPartner && (mixMatchLeadRows.length > 0 || mixMatchFollowRows.length > 0) && (
            <div className="space-y-6">
              {zeroVoteHiddenCount > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowZeroVoteResults((v) => !v)}>
                    {showZeroVoteResults
                      ? "Hide dancers with no votes (0 YES & 0 ALT)"
                      : `Show ${zeroVoteHiddenCount} with no votes`}
                  </Button>
                  {!showZeroVoteResults ? (
                    <span className="text-xs text-muted-foreground">Results tables hide 0 YES / 0 ALT by default. Advance list below still lists everyone.</span>
                  ) : null}
                </div>
              ) : null}
              <div>
                <h3 className="text-sm font-semibold mb-2">Leads (lead judges)</h3>
                {mixMatchLeadResultsHidden > 0 && !expandMixMatchLeadTable ? (
                  <p className="text-xs text-muted-foreground mb-2">
                    Showing first <strong>{RESULTS_RANKINGS_PREVIEW}</strong> rows ({mixMatchLeadRowsForResults.length} rows total). Finalist cut is usually in the top ranks.
                  </p>
                ) : null}
                {mixMatchLeadRowsForResults.length === 0 && mixMatchLeadRows.length > 0 ? (
                  <p className="text-sm text-muted-foreground">All leads here have 0 YES and 0 ALT — expand above to show them.</p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-14">#</TableHead>
                          <TableHead>Lead</TableHead>
                          <TableHead className="w-16 text-center">Alt</TableHead>
                          <TableHead className="w-20 text-right">YES</TableHead>
                          <TableHead className="w-20 text-right">ALT</TableHead>
                          <TableHead className="w-28">Cut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mixMatchLeadRowsResultsVisible.map((row) => (
                          <TableRow
                            key={row.key}
                            className={`${row.madeCut ? "bg-muted/40 " : ""}${
                              officialLeadAlternateRank.has(row.competitorId) ? "border-l-2 border-amber-500/60" : ""
                            }`.trim()}
                          >
                            <TableCell className="font-medium">{row.rank}</TableCell>
                            <TableCell>{row.displayName}</TableCell>
                            <TableCell className="text-center text-sm tabular-nums">
                              {officialLeadAlternateRank.get(row.competitorId) ?? "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{row.yesCount}</TableCell>
                            <TableCell className="text-right tabular-nums">{row.altCount}</TableCell>
                            <TableCell className="text-sm">{row.madeCut ? "Above cut" : "Below cut"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {mixMatchLeadResultsHidden > 0 ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setExpandMixMatchLeadTable((v) => !v)}
                          className="gap-1.5"
                        >
                          {expandMixMatchLeadTable ? (
                            <>
                              <ChevronUp className="h-4 w-4 shrink-0" aria-hidden />
                              First {RESULTS_RANKINGS_PREVIEW} rows
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                              Show all ({mixMatchLeadRowsForResults.length} leads)
                            </>
                          )}
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">Follows (follow judges)</h3>
                {mixMatchFollowResultsHidden > 0 && !expandMixMatchFollowTable ? (
                  <p className="text-xs text-muted-foreground mb-2">
                    Showing first <strong>{RESULTS_RANKINGS_PREVIEW}</strong> rows ({mixMatchFollowRowsForResults.length} rows total).
                  </p>
                ) : null}
                {mixMatchFollowRowsForResults.length === 0 && mixMatchFollowRows.length > 0 ? (
                  <p className="text-sm text-muted-foreground">All follows here have 0 YES and 0 ALT — expand above to show them.</p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-14">#</TableHead>
                          <TableHead>Follow</TableHead>
                          <TableHead className="w-16 text-center">Alt</TableHead>
                          <TableHead className="w-20 text-right">YES</TableHead>
                          <TableHead className="w-20 text-right">ALT</TableHead>
                          <TableHead className="w-28">Cut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mixMatchFollowRowsResultsVisible.map((row) => (
                          <TableRow
                            key={row.key}
                            className={`${row.madeCut ? "bg-muted/40 " : ""}${
                              officialFollowAlternateRank.has(row.competitorId) ? "border-l-2 border-amber-500/60" : ""
                            }`.trim()}
                          >
                            <TableCell className="font-medium">{row.rank}</TableCell>
                            <TableCell>{row.displayName}</TableCell>
                            <TableCell className="text-center text-sm tabular-nums">
                              {officialFollowAlternateRank.get(row.competitorId) ?? "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{row.yesCount}</TableCell>
                            <TableCell className="text-right tabular-nums">{row.altCount}</TableCell>
                            <TableCell className="text-sm">{row.madeCut ? "Above cut" : "Below cut"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {mixMatchFollowResultsHidden > 0 ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setExpandMixMatchFollowTable((v) => !v)}
                          className="gap-1.5"
                        >
                          {expandMixMatchFollowTable ? (
                            <>
                              <ChevronUp className="h-4 w-4 shrink-0" aria-hidden />
                              First {RESULTS_RANKINGS_PREVIEW} rows
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                              Show all ({mixMatchFollowRowsForResults.length} follows)
                            </>
                          )}
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          )}
          {!resultsPending && !resultsQueryError && !isRandomPartner && prelimRankingRows.length > 0 && (
            <>
              {zeroVoteHiddenCount > 0 ? (
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowZeroVoteResults((v) => !v)}>
                    {showZeroVoteResults
                      ? "Hide entries with no votes (0 YES & 0 ALT)"
                      : `Show ${zeroVoteHiddenCount} with no votes`}
                  </Button>
                  {!showZeroVoteResults ? (
                    <span className="text-xs text-muted-foreground">0 YES / 0 ALT rows are hidden by default.</span>
                  ) : null}
                </div>
              ) : null}
              {prelimRankingRowsForResults.length === 0 && prelimRankingRows.length > 0 ? (
                <p className="text-sm text-muted-foreground">All entries have 0 YES and 0 ALT — expand above to show them.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">#</TableHead>
                      <TableHead>Competitor / pair</TableHead>
                      <TableHead className="w-20 text-right">YES</TableHead>
                      <TableHead className="w-20 text-right">ALT</TableHead>
                      <TableHead className="w-28">Cut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prelimRankingRowsForResults.map((row) => (
                      <TableRow key={row.key} className={row.madeCut ? "bg-muted/40" : undefined}>
                        <TableCell className="font-medium">{row.rank}</TableCell>
                        <TableCell>{row.displayName}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.yesCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.altCount}</TableCell>
                        <TableCell className="text-sm">{row.madeCut ? "Above cut" : "Below cut"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
          {!resultsPending &&
            !resultsQueryError &&
            !prelimRankingRows.length &&
            !(isRandomPartner && (mixMatchLeadRows.length > 0 || mixMatchFollowRows.length > 0)) &&
            (slots.length ? (
              <p className="text-muted-foreground text-sm">
                No ranking data yet. Open <strong>Scoring</strong>, fill every judge sheet, then click <strong>Save scores</strong> (scores are not stored until you save).
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">Generate heats first; ranking appears once heat slots exist.</p>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Advance to final</CardTitle>
          <CardDescription>
            {isRandomPartner
              ? "Pick finalists with checkboxes (equal leads/follows). Announced alternates use one sequence rule for both roles (same count); manual picks stay per role. Saved in this browser."
              : "Advance competitors/pairs above the cut line to the final round."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isRandomPartner && (mixMatchLeadRows.length > 0 || mixMatchFollowRows.length > 0) && (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label htmlFor="advance-top-n">Finalists per role (top N from each list)</Label>
                  <Input
                    id="advance-top-n"
                    type="number"
                    min={1}
                    className="w-[8rem]"
                    value={advanceTopNInput}
                    onChange={(e) => setAdvanceTopNInput(Number(e.target.value))}
                  />
                </div>
                <Button type="button" variant="secondary" onClick={applyAdvanceTopNFromInputs}>
                  Select first N
                </Button>
                <Button type="button" variant="outline" onClick={reapplyAdvanceSuggestionFromCut}>
                  Reset to cut / Yes count
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                “Reset” uses the smaller of the two automatic cuts, or if there is no cut, the prelim <strong>Yes count</strong> from Setup (capped by how many couples exist).
              </p>

              <div className="rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50/50 via-background to-violet-50/20 p-5 shadow-sm dark:border-amber-900/35 dark:from-amber-950/25 dark:via-background dark:to-violet-950/15 space-y-5">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-100">
                    <Sparkles className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <h4 className="text-sm font-semibold tracking-tight text-foreground">Announcement: official alternates</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Set who counts as 1st / 2nd alternate based on finalist checkboxes. Alternate <strong>count</strong> must match for lead and follow; <strong>ordering rule</strong> (RP / random draw / manual) is one choice for both. In manual mode you pick names per role. Random draw resets when results or finalists change.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-4 rounded-xl border border-dashed border-amber-300/45 bg-background/90 px-4 py-3.5 dark:border-amber-800/40">
                  <div className="space-y-1.5">
                    <Label htmlFor="announced-alt-count-adv" className="text-xs font-medium">
                      How many alternates to announce (same count per role)
                    </Label>
                    <Input
                      id="announced-alt-count-adv"
                      type="number"
                      min={1}
                      step={1}
                      className="h-10 w-[7rem]"
                      value={announcedAlternateCount}
                      onChange={(e) => {
                        const v = clampAnnouncedAlternateCount(Number(e.target.value));
                        setAnnouncedAlternateCount(v);
                        if (competitionId) writeAnnouncedAlternateCount(competitionId, v);
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground max-w-md leading-relaxed pb-0.5">
                    Defaults to <strong>1</strong>. Setup <strong>Alternate count</strong> is only the number of maybe (ALT) boxes on judge ballots; don’t confuse it with announcements.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-3 rounded-xl border border-amber-300/40 bg-background/80 px-4 py-3.5 dark:border-amber-900/35">
                    <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Alternate ordering rule (lead + follow)</p>
                    <Select
                      value={altPickBundle.lead.mode}
                      onChange={(e) => setUnifiedAltMode(e.target.value as AlternatePickMode)}
                      className="w-full max-w-md"
                      options={[
                        { value: "rp", label: "RP order (default)" },
                        { value: "random_ties", label: "Tied scores — random draw" },
                        { value: "manual", label: "Manual pick" },
                      ]}
                    />
                    {altPickBundle.lead.mode === "random_ties" ? (
                      <div className="space-y-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={rerollBothRandomAlternates}
                          className="w-full sm:w-auto"
                        >
                          Redraw (lead and follow)
                        </Button>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          First draw runs automatically; redraw after finalists or results change.
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {altPickBundle.lead.mode === "manual" ? (
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-3 rounded-xl border border-sky-200/80 bg-gradient-to-b from-sky-500/[0.06] to-transparent p-4 dark:border-sky-900/50 dark:from-sky-500/10">
                        <p className="text-xs font-semibold uppercase tracking-wide text-sky-900 dark:text-sky-100">Lead — manual selection</p>
                        <div className="space-y-2">
                          {Array.from({ length: altCapResolved }, (_, i) => (
                            <div key={`lead-alt-slot-adv-${i}`} className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">Alternatif {i + 1}</Label>
                              <Select
                                value={altPickBundle.lead.manualSlots?.[i] ?? ""}
                                onChange={(e) => setLeadManualSlot(i, e.target.value)}
                                options={leadManualOptionsForSlot(i)}
                                className="w-full"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-3 rounded-xl border border-violet-200/80 bg-gradient-to-b from-violet-500/[0.06] to-transparent p-4 dark:border-violet-900/50 dark:from-violet-500/10">
                        <p className="text-xs font-semibold uppercase tracking-wide text-violet-900 dark:text-violet-100">Follow — manual selection</p>
                        <div className="space-y-2">
                          {Array.from({ length: altCapResolved }, (_, i) => (
                            <div key={`follow-alt-slot-adv-${i}`} className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">Alternatif {i + 1}</Label>
                              <Select
                                value={altPickBundle.follow.manualSlots?.[i] ?? ""}
                                onChange={(e) => setFollowManualSlot(i, e.target.value)}
                                options={followManualOptionsForSlot(i)}
                                className="w-full"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {(officialAlternatesAnnouncement.leadNames.length > 0 || officialAlternatesAnnouncement.followNames.length > 0) && (
                  <div className="rounded-xl border border-amber-400/40 bg-amber-500/[0.1] p-4 text-sm dark:border-amber-700/40 dark:bg-amber-500/[0.08] space-y-3">
                    <p className="font-semibold text-amber-950 dark:text-amber-50">Preview — announcement list</p>
                    <p className="text-xs text-amber-950/75 dark:text-amber-100/75 leading-relaxed">
                      Excluding finalists; only as many names as you selected are official alternates. See <strong>Results</strong> for the full score table.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-medium text-foreground/90 mb-1">Leads</p>
                        {officialAlternatesAnnouncement.leadNames.length ? (
                          <ul className="list-none pl-0 space-y-0.5 text-foreground">
                            {officialAlternatesAnnouncement.leadNames.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-muted-foreground text-xs">—</p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground/90 mb-1">Follows</p>
                        {officialAlternatesAnnouncement.followNames.length ? (
                          <ul className="list-none pl-0 space-y-0.5 text-foreground">
                            {officialAlternatesAnnouncement.followNames.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-muted-foreground text-xs">—</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors",
                    selectedLeadIds.size === selectedFollowIds.size && selectedLeadIds.size > 0
                      ? "border-emerald-300/70 bg-emerald-500/[0.07] dark:border-emerald-700/50 dark:bg-emerald-500/10"
                      : "border-border bg-muted/20"
                  )}
                >
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Leads</p>
                    <p className="text-2xl font-bold tabular-nums tracking-tight text-sky-700 dark:text-sky-300">
                      {selectedLeadIds.size}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/15 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200">
                    <span className="text-xs font-bold">L</span>
                  </div>
                </div>
                <div
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors",
                    selectedLeadIds.size === selectedFollowIds.size && selectedLeadIds.size > 0
                      ? "border-emerald-300/70 bg-emerald-500/[0.07] dark:border-emerald-700/50 dark:bg-emerald-500/10"
                      : "border-border bg-muted/20"
                  )}
                >
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Follows</p>
                    <p className="text-2xl font-bold tabular-nums tracking-tight text-violet-700 dark:text-violet-300">
                      {selectedFollowIds.size}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/15 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">
                    <span className="text-xs font-bold">F</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Counts must match and be greater than zero before you can advance.
              </p>
              <div className="rounded-xl border border-amber-200/70 bg-amber-50/60 p-4 text-sm text-amber-950/90 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-50/90 space-y-2">
                <p className="font-semibold text-amber-950 dark:text-amber-100">Finalists and alternates</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    <strong>Finalists</strong> = People you checked on the Advance list. Not everyone is an alternate.
                  </li>
                  <li>
                    <strong>Official alternates</strong>: chosen from non-finalists using the <strong>announcement</strong> settings above (count + RP / random draw / manual). The <strong>Alt</strong> column in Results shows the same order.
                  </li>
                  <li>
                    Only these official alternates get labels like <strong>(alternate)</strong> or <strong>(alternate 2)</strong> in the list.
                  </li>
                  <li>
                    To promote an alternate to finalist, <strong>check</strong> them; someone else becomes the new alternate by order. Uncheck a finalist to free a slot.
                  </li>
                  <li>
                    You must select the <strong>same number of leads and follows</strong> (e.g. 10 couples).
                  </li>
                </ul>
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                  <div className="border-b border-sky-200/80 bg-gradient-to-r from-sky-500/[0.12] via-sky-500/[0.06] to-transparent px-4 py-3.5 dark:border-sky-900/50 dark:from-sky-500/20 dark:via-sky-950/40 dark:to-transparent">
                    <h3 className="text-sm font-semibold tracking-tight text-sky-950 dark:text-sky-50">Advance (leads)</h3>
                    <p className="mt-0.5 text-xs text-sky-900/65 dark:text-sky-200/70">Check finalists in RP order</p>
                  </div>
                  <ul className="space-y-1.5 p-3">
                    {mixMatchLeadRows.map((row) => {
                      const selected = !!(row.competitorId && selectedLeadIds.has(row.competitorId));
                      const disabled = !row.competitorId;
                      return (
                        <li
                          key={row.key}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border px-2.5 py-2 transition-all",
                            disabled && "pointer-events-none opacity-45",
                            selected
                              ? "border-sky-300/80 bg-sky-500/[0.09] shadow-sm dark:border-sky-700/70 dark:bg-sky-500/[0.12]"
                              : "border-transparent hover:border-border/70 hover:bg-muted/35"
                          )}
                        >
                          <input
                            type="checkbox"
                            id={`adv-lead-${row.key}`}
                            className="h-4 w-4 shrink-0 rounded-md border-2 border-sky-400/50 text-sky-600 focus:ring-sky-500/30 disabled:opacity-50 dark:border-sky-600 dark:text-sky-400"
                            checked={selected}
                            disabled={disabled}
                            onChange={() => toggleLeadAdvance(row.competitorId)}
                          />
                          <label
                            htmlFor={`adv-lead-${row.key}`}
                            className={cn(
                              "flex min-w-0 flex-1 cursor-pointer items-center gap-2 leading-snug",
                              disabled && "cursor-not-allowed"
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums",
                                selected
                                  ? "bg-sky-600 text-white shadow-sm dark:bg-sky-500"
                                  : "bg-muted text-muted-foreground"
                              )}
                            >
                              {row.rank}
                            </span>
                            <span className="min-w-0 flex-1 text-sm font-medium">
                              {row.displayName}
                              {advanceListRoleTag(row.competitorId, selectedLeadIds, officialLeadAlternateRank)}
                            </span>
                            {selected ? (
                              <span className="hidden shrink-0 items-center gap-1 rounded-full bg-sky-600/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-400/15 dark:text-sky-200 sm:inline-flex">
                                <Check className="h-3 w-3" aria-hidden />
                                Finalist
                              </span>
                            ) : null}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                  <div className="border-b border-violet-200/80 bg-gradient-to-r from-violet-500/[0.12] via-violet-500/[0.06] to-transparent px-4 py-3.5 dark:border-violet-900/50 dark:from-violet-500/20 dark:via-violet-950/40 dark:to-transparent">
                    <h3 className="text-sm font-semibold tracking-tight text-violet-950 dark:text-violet-50">
                      Advance (follows)
                    </h3>
                    <p className="mt-0.5 text-xs text-violet-900/65 dark:text-violet-200/70">Check finalists in RP order</p>
                  </div>
                  <ul className="space-y-1.5 p-3">
                    {mixMatchFollowRows.map((row) => {
                      const selected = !!(row.competitorId && selectedFollowIds.has(row.competitorId));
                      const disabled = !row.competitorId;
                      return (
                        <li
                          key={row.key}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border px-2.5 py-2 transition-all",
                            disabled && "pointer-events-none opacity-45",
                            selected
                              ? "border-violet-300/80 bg-violet-500/[0.09] shadow-sm dark:border-violet-700/70 dark:bg-violet-500/[0.12]"
                              : "border-transparent hover:border-border/70 hover:bg-muted/35"
                          )}
                        >
                          <input
                            type="checkbox"
                            id={`adv-fol-${row.key}`}
                            className="h-4 w-4 shrink-0 rounded-md border-2 border-violet-400/50 text-violet-600 focus:ring-violet-500/30 disabled:opacity-50 dark:border-violet-600 dark:text-violet-400"
                            checked={selected}
                            disabled={disabled}
                            onChange={() => toggleFollowAdvance(row.competitorId)}
                          />
                          <label
                            htmlFor={`adv-fol-${row.key}`}
                            className={cn(
                              "flex min-w-0 flex-1 cursor-pointer items-center gap-2 leading-snug",
                              disabled && "cursor-not-allowed"
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums",
                                selected
                                  ? "bg-violet-600 text-white shadow-sm dark:bg-violet-500"
                                  : "bg-muted text-muted-foreground"
                              )}
                            >
                              {row.rank}
                            </span>
                            <span className="min-w-0 flex-1 text-sm font-medium">
                              {row.displayName}
                              {advanceListRoleTag(row.competitorId, selectedFollowIds, officialFollowAlternateRank)}
                            </span>
                            {selected ? (
                              <span className="hidden shrink-0 items-center gap-1 rounded-full bg-violet-600/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800 dark:bg-violet-400/15 dark:text-violet-200 sm:inline-flex">
                                <Check className="h-3 w-3" aria-hidden />
                                Finalist
                              </span>
                            ) : null}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </>
          )}
          {isRandomPartner && mixMatchLeadRows.length === 0 && mixMatchFollowRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Rankings appear after heats exist and prelim scores are saved.
            </p>
          ) : null}
          {isRandomPartner && (mixMatchLeadRows.length > 0 || mixMatchFollowRows.length > 0) ? (
            <Button
              disabled={
                selectedLeadIds.size !== selectedFollowIds.size ||
                selectedLeadIds.size === 0 ||
                advanceMutation.isPending
              }
              onClick={() => {
                advanceMutation.mutate({ competitor_ids: [...selectedLeadIds, ...selectedFollowIds] });
              }}
            >
              {advanceMutation.isPending ? "Advancing…" : "Advance to final"}
            </Button>
          ) : null}
          {!isRandomPartner ? (
            <Button
              disabled={!results?.ranking?.length || results.cut_line_index < 0 || advanceMutation.isPending}
              onClick={() => {
                const ranking = results!.ranking;
                const n = results!.cut_line_index + 1;
                const competitorIds: string[] = [];
                const pairIds: string[] = [];
                for (let i = 0; i < n && i < ranking.length; i++) {
                  const e = ranking[i];
                  if (e.competitor_id) competitorIds.push(e.competitor_id);
                  if (e.pair_id) pairIds.push(e.pair_id);
                }
                advanceMutation.mutate({
                  competitor_ids: competitorIds.length ? competitorIds : undefined,
                  pair_ids: pairIds.length ? pairIds : undefined,
                });
              }}
            >
              {advanceMutation.isPending ? "Advancing…" : "Advance to final"}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {/* Preview modal: visible on screen; no-print so it hides when printing */}
      {printMode &&
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
                  <Button variant="outline" onClick={() => setPrintMode(null)}>
                    Close
                  </Button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-auto p-6">
                <PrelimPrintView
                  mode={printMode}
                  competitionName={competition.name}
                  divisionType={competition.division_type}
                  heats={heats}
                  heatSlots={slots}
                  judges={prelim?.judges ?? []}
                  config={prelim?.config ?? null}
                  copies={printMode === "judge" ? judgeCopies : undefined}
                  mockCount={printMode === "mock" ? mockJudgeCount : undefined}
                  mockVotesForPrelim={
                    printMode === "mock" && competition.division_type === "random_partner"
                      ? mockVotesForPrelim
                      : undefined
                  }
                />
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Portal content for actual print: off-screen until @media print */}
      {printMode &&
        createPortal(
          <div className="prelim-print-root" aria-hidden="true">
            <PrelimPrintView
              mode={printMode}
              competitionName={competition.name}
              divisionType={competition.division_type}
              heats={heats}
              heatSlots={slots}
              judges={prelim?.judges ?? []}
              config={prelim?.config ?? null}
              copies={printMode === "judge" ? judgeCopies : undefined}
              mockCount={printMode === "mock" ? mockJudgeCount : undefined}
              mockVotesForPrelim={
                printMode === "mock" && competition.division_type === "random_partner"
                  ? mockVotesForPrelim
                  : undefined
              }
            />
          </div>,
          document.body
        )}
    </PageShell>
  );
}
