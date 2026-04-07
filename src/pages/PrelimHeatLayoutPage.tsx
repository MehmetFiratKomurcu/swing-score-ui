import { useParams } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  getCompetition,
  getPrelim,
  putPrelimHeatSlots,
  reRandomizePrelimHeats,
  type DivisionType,
  type Heat,
  type HeatSlot,
  type PrelimHeatSlotAssignment,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MissingIdState, PageBackLink, PageHeader, PageLoadSkeleton, PageShell } from "@/components/page-frame";

/** True when API still returns two rows per physical slot (old mix & match storage). */
function hasDuplicateSlotIds(slots: HeatSlot[]): boolean {
  const m = new Map<string, number>();
  for (const s of slots) m.set(s.id, (m.get(s.id) ?? 0) + 1);
  return [...m.values()].some((c) => c > 1);
}

function uniquePhysicalSlots(slots: HeatSlot[]): HeatSlot[] {
  const seen = new Set<string>();
  const out: HeatSlot[] = [];
  for (const s of slots) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

type GroupedSlot = {
  id: string;
  heat_id: string;
  slot_order: number;
  lines: { display_name?: string; numbers?: number[]; scoring_role?: "lead" | "follow" }[];
};

function groupSlots(slots: HeatSlot[]): Map<string, GroupedSlot> {
  const map = new Map<string, GroupedSlot>();
  for (const s of slots) {
    const line = {
      display_name: s.display_name,
      numbers: s.numbers,
      scoring_role: s.scoring_role,
    };
    const g = map.get(s.id);
    if (!g) {
      map.set(s.id, {
        id: s.id,
        heat_id: s.heat_id,
        slot_order: s.slot_order,
        lines: [line],
      });
    } else {
      g.lines.push(line);
    }
  }
  return map;
}

/** Per heat: all lead slot ids first (by current order), then follows — clearer layout + stable merge for split UI. */
function normalizeMixMatchHeatOrder(ids: string[], slotById: Map<string, HeatSlot>): string[] {
  const leads: string[] = [];
  const follows: string[] = [];
  const other: string[] = [];
  for (const id of ids) {
    const r = slotById.get(id)?.scoring_role;
    if (r === "follow") follows.push(id);
    else if (r === "lead") leads.push(id);
    else other.push(id);
  }
  return [...leads, ...follows, ...other];
}

function buildBoard(
  heats: Heat[],
  slots: HeatSlot[],
  legacyPaired: boolean,
  mixMatchFlat: boolean,
  slotById: Map<string, HeatSlot>
): Record<string, string[]> {
  const sortedHeats = [...heats].sort((a, b) => a.heat_number - b.heat_number);
  const board: Record<string, string[]> = {};
  for (const h of sortedHeats) board[h.id] = [];

  if (legacyPaired) {
    const grouped = groupSlots(slots);
    const ordered = [...grouped.values()].sort((a, b) => {
      if (a.heat_id !== b.heat_id) return a.heat_id.localeCompare(b.heat_id);
      return a.slot_order - b.slot_order;
    });
    for (const g of ordered) {
      const list = board[g.heat_id];
      if (list) list.push(g.id);
    }
    return board;
  }

  const physical = uniquePhysicalSlots(slots);
  for (const h of sortedHeats) {
    let ordered = physical
      .filter((s) => s.heat_id === h.id)
      .sort((a, b) => a.slot_order - b.slot_order)
      .map((s) => s.id);
    if (mixMatchFlat) {
      ordered = normalizeMixMatchHeatOrder(ordered, slotById);
    }
    board[h.id] = ordered;
  }
  return board;
}

function findContainer(board: Record<string, string[]>, id: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(board, id)) {
    return id;
  }
  for (const [containerId, list] of Object.entries(board)) {
    if (list.includes(id)) return containerId;
  }
  return undefined;
}

function splitMixMatchBoard(
  board: Record<string, string[]>,
  heatIds: string[],
  slotById: Map<string, HeatSlot>
): { leads: Record<string, string[]>; follows: Record<string, string[]> } {
  const leads: Record<string, string[]> = {};
  const follows: Record<string, string[]> = {};
  for (const hid of heatIds) {
    leads[hid] = [];
    follows[hid] = [];
    for (const id of board[hid] ?? []) {
      const r = slotById.get(id)?.scoring_role;
      if (r === "follow") follows[hid].push(id);
      else leads[hid].push(id);
    }
  }
  return { leads, follows };
}

function mergeMixMatchParts(
  leads: Record<string, string[]>,
  follows: Record<string, string[]>,
  heatIds: string[]
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const hid of heatIds) {
    out[hid] = [...(leads[hid] ?? []), ...(follows[hid] ?? [])];
  }
  return out;
}

function parseRoleHeatId(role: "lead" | "follow", overId: string): string | undefined {
  const p = `${role}:`;
  if (overId.startsWith(p)) return overId.slice(p.length);
  return undefined;
}

function buildAssignments(
  board: Record<string, string[]>,
  heatsOrdered: Heat[]
): PrelimHeatSlotAssignment[] {
  const out: PrelimHeatSlotAssignment[] = [];
  for (const h of heatsOrdered) {
    const ids = board[h.id] ?? [];
    ids.forEach((id, i) => out.push({ id, heat_id: h.id, slot_order: i + 1 }));
  }
  return out;
}

function SortableSlotCard({ slot, showRoleBadge = true }: { slot: HeatSlot; showRoleBadge?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slot.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const nums = slot.numbers?.length ? slot.numbers.join(" · ") : "—";
  const roleLabel =
    slot.scoring_role === "follow" ? "Follow" : slot.scoring_role === "lead" ? "Lead" : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border border-border bg-card px-3 py-2 shadow-sm touch-none ${
        isDragging ? "opacity-50 ring-2 ring-primary/40" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Drag"
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
        <div className="min-w-0 flex-1 text-sm">
          {showRoleBadge && roleLabel && (
            <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {roleLabel}
            </div>
          )}
          <div className="font-mono text-xs text-muted-foreground">#{nums}</div>
          <div className="font-medium leading-snug">{slot.display_name ?? "—"}</div>
        </div>
      </div>
    </div>
  );
}

function LegacyPairedColumn({
  heat,
  groups,
}: {
  heat: Heat;
  groups: GroupedSlot[];
}) {
  return (
    <div className="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-muted/20 shadow-sm opacity-90">
      <div className="border-b border-border bg-muted/40 px-3 py-2">
        <div className="font-semibold tracking-tight">Heat {heat.heat_number}</div>
      </div>
      <div className="flex flex-col gap-2 p-3">
        {groups.map((g) => (
          <div
            key={g.id}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm"
          >
            {g.lines.map((line, i) => (
              <div key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-xs font-medium uppercase text-muted-foreground">
                  {line.scoring_role === "follow" ? "Follow" : "Lead"}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  #{line.numbers?.length ? line.numbers.join(" · ") : "—"}
                </span>
                <span className="font-medium">{line.display_name ?? "—"}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function HeatColumn({
  heat,
  slotIds,
  slotById,
}: {
  heat: Heat;
  slotIds: string[];
  slotById: Map<string, HeatSlot>;
}) {
  const { setNodeRef } = useDroppable({ id: heat.id });

  return (
    <div className="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-muted/20 shadow-sm">
      <div className="border-b border-border bg-muted/40 px-3 py-2">
        <div className="font-semibold tracking-tight">Heat {heat.heat_number}</div>
        <div className="text-xs text-muted-foreground">
          {slotIds.length} {slotIds.length === 1 ? "dancer" : "dancers"}
        </div>
      </div>
      <SortableContext items={slotIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className="flex min-h-[7rem] flex-col gap-2 p-3"
          data-heat-droppable={heat.id}
        >
          {slotIds.map((id) => {
            const slot = slotById.get(id);
            if (!slot) return null;
            return <SortableSlotCard key={id} slot={slot} />;
          })}
        </div>
      </SortableContext>
    </div>
  );
}

function RoleHeatColumn({
  heat,
  role,
  slotIds,
  slotById,
}: {
  heat: Heat;
  role: "lead" | "follow";
  slotIds: string[];
  slotById: Map<string, HeatSlot>;
}) {
  const droppableId = `${role}:${heat.id}`;
  const { setNodeRef } = useDroppable({ id: droppableId });

  const label = role === "lead" ? "Lead" : "Follow";
  const tint =
    role === "lead"
      ? "border-sky-500/25 bg-sky-500/5 dark:border-sky-400/20 dark:bg-sky-950/30"
      : "border-violet-500/25 bg-violet-500/5 dark:border-violet-400/20 dark:bg-violet-950/30";

  return (
    <div
      className={`flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border-2 shadow-sm ${tint}`}
    >
      <div className="border-b border-border/80 bg-background/60 px-3 py-2 backdrop-blur-sm">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="font-semibold tracking-tight">Heat {heat.heat_number}</div>
        <div className="text-xs text-muted-foreground">
          {slotIds.length} {slotIds.length === 1 ? "dancer" : "dancers"}
        </div>
      </div>
      <SortableContext items={slotIds} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-[6rem] flex-col gap-2 p-3">
          {slotIds.map((id) => {
            const slot = slotById.get(id);
            if (!slot) return null;
            return <SortableSlotCard key={id} slot={slot} showRoleBadge={false} />;
          })}
        </div>
      </SortableContext>
    </div>
  );
}

function useMixMatchRoleDragHandlers(
  role: "lead" | "follow",
  setBoard: Dispatch<SetStateAction<Record<string, string[]>>>,
  persist: (next: Record<string, string[]>) => void,
  sortedHeats: Heat[],
  slotById: Map<string, HeatSlot>
) {
  const heatIds = useMemo(() => sortedHeats.map((h) => h.id), [sortedHeats]);

  const onDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      const overId = over?.id;
      if (overId == null) return;

      const activeIdStr = String(active.id);
      const overIdStr = String(overId);

      setBoard((prev) => {
        const { leads, follows } = splitMixMatchBoard(prev, heatIds, slotById);
        const roleMap = role === "lead" ? leads : follows;
        const otherMap = role === "lead" ? follows : leads;

        let overContainer = findContainer(roleMap, overIdStr) ?? parseRoleHeatId(role, overIdStr);
        const activeContainer = findContainer(roleMap, activeIdStr);

        if (!overContainer || !activeContainer || activeContainer === overContainer) return prev;

        const activeItems = [...(roleMap[activeContainer] ?? [])];
        const overItems = [...(roleMap[overContainer] ?? [])];
        const activeIndex = activeItems.indexOf(activeIdStr);
        if (activeIndex === -1) return prev;

        const overIndexInOver = overItems.indexOf(overIdStr);
        let newIndex: number;

        if (
          Object.prototype.hasOwnProperty.call(roleMap, overIdStr) &&
          !overItems.includes(overIdStr)
        ) {
          newIndex = overItems.length;
        } else if (overIndexInOver >= 0) {
          const isBelowOverItem =
            over &&
            active.rect.current.translated &&
            active.rect.current.translated.top > over.rect.top + over.rect.height;
          const modifier = isBelowOverItem ? 1 : 0;
          newIndex = overIndexInOver + modifier;
        } else {
          newIndex = overItems.length;
        }

        const nextActive = activeItems.filter((id) => id !== activeIdStr);
        const nextOver = [...overItems.slice(0, newIndex), activeIdStr, ...overItems.slice(newIndex)];

        const newRoleMap = { ...roleMap, [activeContainer]: nextActive, [overContainer]: nextOver };
        if (role === "lead") {
          return mergeMixMatchParts(newRoleMap, otherMap, heatIds);
        }
        return mergeMixMatchParts(otherMap, newRoleMap, heatIds);
      });
    },
    [heatIds, role, setBoard, slotById]
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeIdStr = String(active.id);
      const overIdStr = String(over.id);

      setBoard((prev) => {
        const { leads, follows } = splitMixMatchBoard(prev, heatIds, slotById);
        const roleMap = role === "lead" ? leads : follows;
        const otherMap = role === "lead" ? follows : leads;

        const activeContainer = findContainer(roleMap, activeIdStr);
        if (!activeContainer) return prev;

        const overIsColumn = parseRoleHeatId(role, overIdStr) !== undefined;
        const overContainer =
          findContainer(roleMap, overIdStr) ?? (overIsColumn ? parseRoleHeatId(role, overIdStr) : undefined);
        if (!overContainer) return prev;

        const list = [...(roleMap[overContainer] ?? [])];
        const activeIndex = list.indexOf(activeIdStr);
        if (activeIndex === -1) return prev;

        let overIndex: number;
        if (overIsColumn && overContainer === parseRoleHeatId(role, overIdStr)) {
          overIndex = Math.max(0, list.length - 1);
        } else {
          overIndex = list.indexOf(overIdStr);
        }

        if (overIndex < 0) {
          persist(prev);
          return prev;
        }
        if (activeIndex === overIndex) {
          persist(prev);
          return prev;
        }

        const newRoleList = arrayMove(list, activeIndex, overIndex);
        const newRoleMap = { ...roleMap, [overContainer]: newRoleList };
        const next =
          role === "lead"
            ? mergeMixMatchParts(newRoleMap, otherMap, heatIds)
            : mergeMixMatchParts(otherMap, newRoleMap, heatIds);
        persist(next);
        return next;
      });
    },
    [heatIds, persist, role, setBoard, slotById]
  );

  return { onDragOver, onDragEnd };
}

export default function PrelimHeatLayoutPage() {
  const { competitionId } = useParams<{ competitionId: string }>();
  const queryClient = useQueryClient();
  const [board, setBoard] = useState<Record<string, string[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: competition } = useQuery({
    queryKey: ["competitions", competitionId],
    queryFn: () => getCompetition(competitionId!),
    enabled: !!competitionId,
  });

  const { data: prelim } = useQuery({
    queryKey: ["prelim", competitionId],
    queryFn: () => getPrelim(competitionId!),
    enabled: !!competitionId,
  });

  const heats = prelim?.heats ?? [];
  const slots = prelim?.heat_slots ?? [];
  const divisionType: DivisionType | undefined = competition?.division_type;

  const sortedHeats = useMemo(
    () => [...heats].sort((a, b) => a.heat_number - b.heat_number),
    [heats]
  );

  const legacyPairedMixMatch =
    divisionType === "random_partner" && hasDuplicateSlotIds(slots);

  const mixMatchFlat =
    divisionType === "random_partner" && !legacyPairedMixMatch;

  const slotById = useMemo(() => {
    const m = new Map<string, HeatSlot>();
    for (const s of uniquePhysicalSlots(slots)) {
      m.set(s.id, s);
    }
    return m;
  }, [slots]);

  const slotsFingerprint = useMemo(() => {
    return [...slots]
      .map((s) => `${s.id}:${s.heat_id}:${s.slot_order}:${s.competitor_id ?? ""}`)
      .sort()
      .join("|");
  }, [slots]);

  useEffect(() => {
    if (!sortedHeats.length) {
      setBoard({});
      return;
    }
    setBoard(buildBoard(sortedHeats, slots, legacyPairedMixMatch, mixMatchFlat, slotById));
  }, [competitionId, slotsFingerprint, sortedHeats, legacyPairedMixMatch, mixMatchFlat, slots, slotById]);

  const putMutation = useMutation({
    mutationFn: (assignments: PrelimHeatSlotAssignment[]) => putPrelimHeatSlots(competitionId!, assignments),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prelim", competitionId] });
      toast.success("Heat layout saved");
    },
    onError: (e: Error) => {
      toast.error(e.message || "Kaydedilemedi");
      queryClient.invalidateQueries({ queryKey: ["prelim", competitionId] });
    },
  });

  const reRandomizeMutation = useMutation({
    mutationFn: () => reRandomizePrelimHeats(competitionId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prelim", competitionId] });
      queryClient.invalidateQueries({ queryKey: ["prelim-results", competitionId] });
      toast.success("Heats re-randomized");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const persist = useCallback(
    (next: Record<string, string[]>) => {
      if (!competitionId || !sortedHeats.length) return;
      const payload = buildAssignments(next, sortedHeats);
      putMutation.mutate(payload);
    },
    [competitionId, sortedHeats, putMutation]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const onDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  }, []);

  const onDragOverCombined = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    const overId = over?.id;
    if (overId == null) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(overId);

    setBoard((prev) => {
      let overContainer = findContainer(prev, overIdStr);
      if (overContainer === undefined && Object.prototype.hasOwnProperty.call(prev, overIdStr)) {
        overContainer = overIdStr;
      }
      const activeContainer = findContainer(prev, activeIdStr);

      if (!overContainer || !activeContainer || activeContainer === overContainer) return prev;

      const activeItems = [...(prev[activeContainer] ?? [])];
      const overItems = [...(prev[overContainer] ?? [])];
      const activeIndex = activeItems.indexOf(activeIdStr);
      if (activeIndex === -1) return prev;

      const overIndexInOver = overItems.indexOf(overIdStr);
      let newIndex: number;

      if (Object.prototype.hasOwnProperty.call(prev, overIdStr) && !overItems.includes(overIdStr)) {
        newIndex = overItems.length;
      } else if (overIndexInOver >= 0) {
        const isBelowOverItem =
          over &&
          active.rect.current.translated &&
          active.rect.current.translated.top > over.rect.top + over.rect.height;
        const modifier = isBelowOverItem ? 1 : 0;
        newIndex = overIndexInOver + modifier;
      } else {
        newIndex = overItems.length;
      }

      const nextActive = activeItems.filter((id) => id !== activeIdStr);
      const nextOver = [...overItems.slice(0, newIndex), activeIdStr, ...overItems.slice(newIndex)];

      return { ...prev, [activeContainer]: nextActive, [overContainer]: nextOver };
    });
  }, []);

  const onDragEndCombined = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over) return;

      const activeIdStr = String(active.id);
      const overIdStr = String(over.id);

      setBoard((prev) => {
        const activeContainer = findContainer(prev, activeIdStr);
        if (!activeContainer) return prev;

        const overIsColumn = Object.prototype.hasOwnProperty.call(prev, overIdStr);
        const overContainer =
          findContainer(prev, overIdStr) ?? (overIsColumn ? overIdStr : undefined);
        if (!overContainer) return prev;

        const list = [...(prev[overContainer] ?? [])];
        const activeIndex = list.indexOf(activeIdStr);
        if (activeIndex === -1) return prev;

        let overIndex: number;
        if (overIsColumn && overIdStr === overContainer) {
          overIndex = Math.max(0, list.length - 1);
        } else {
          overIndex = list.indexOf(overIdStr);
        }

        if (overIndex < 0) {
          persist(prev);
          return prev;
        }
        if (activeIndex === overIndex) {
          persist(prev);
          return prev;
        }

        const next = { ...prev, [overContainer]: arrayMove(list, activeIndex, overIndex) };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const { onDragOver: onDragOverLeads, onDragEnd: onDragEndLeads } = useMixMatchRoleDragHandlers(
    "lead",
    setBoard,
    persist,
    sortedHeats,
    slotById
  );
  const { onDragOver: onDragOverFollows, onDragEnd: onDragEndFollows } = useMixMatchRoleDragHandlers(
    "follow",
    setBoard,
    persist,
    sortedHeats,
    slotById
  );

  const onDragCancel = useCallback(() => {
    setActiveId(null);
    if (competitionId && sortedHeats.length) {
      setBoard(buildBoard(sortedHeats, slots, legacyPairedMixMatch, mixMatchFlat, slotById));
    }
  }, [competitionId, sortedHeats, slots, legacyPairedMixMatch, mixMatchFlat, slotById]);

  const onDragEndLeadsWrapped = useCallback(
    (e: DragEndEvent) => {
      setActiveId(null);
      onDragEndLeads(e);
    },
    [onDragEndLeads]
  );
  const onDragEndFollowsWrapped = useCallback(
    (e: DragEndEvent) => {
      setActiveId(null);
      onDragEndFollows(e);
    },
    [onDragEndFollows]
  );

  if (!competitionId) {
    return <MissingIdState message="Missing competition ID in the URL." backTo="/events" />;
  }
  if (!competition) {
    return (
      <PageShell maxWidth="full">
        <PageLoadSkeleton variant="minimal" />
      </PageShell>
    );
  }

  const activeSlot = activeId ? slotById.get(activeId) : undefined;
  const hasSlots = uniquePhysicalSlots(slots).length > 0 || legacyPairedMixMatch;

  const requestReRandomize = () => {
    if (
      !window.confirm(
        "This re-randomizes prelim pairings and permanently deletes all saved prelim scores. Continue?"
      )
    ) {
      return;
    }
    reRandomizeMutation.mutate();
  };

  const legacyGroupsByHeat = useMemo(() => {
    if (!legacyPairedMixMatch) return new Map<string, GroupedSlot[]>();
    const grouped = groupSlots(slots);
    const byHeat = new Map<string, GroupedSlot[]>();
    for (const h of sortedHeats) byHeat.set(h.id, []);
    for (const g of grouped.values()) {
      const list = byHeat.get(g.heat_id);
      if (list) list.push(g);
    }
    for (const list of byHeat.values()) {
      list.sort((a, b) => a.slot_order - b.slot_order);
    }
    return byHeat;
  }, [legacyPairedMixMatch, slots, sortedHeats]);

  const heatIdList = sortedHeats.map((h) => h.id);
  const { leads: leadPart, follows: followPart } = splitMixMatchBoard(board, heatIdList, slotById);

  return (
    <PageShell maxWidth="full">
      <PageBackLink to={`/competitions/${competitionId}/prelim`}>Prelim</PageBackLink>
      <PageHeader title="Heat layout" description={competition.name} />

      <Card className="mb-6">
        <CardHeader className="space-y-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0 flex-1 space-y-1.5">
              <CardTitle>Assign competitors to heats</CardTitle>
              <CardDescription className="space-y-2">
                <span>Drag to change heat and order; dropping saves to the server.</span>
                {mixMatchFlat && (
                  <span className="block text-muted-foreground">
                    Mix &amp; Match: the top band shows only <strong>lead</strong> columns, the bottom band only{" "}
                    <strong>follow</strong> columns — easier to compare side by side. In each heat, slot order is all
                    leads first, then all follows.
                  </span>
                )}
              </CardDescription>
            </div>
            {divisionType === "random_partner" && heats.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={requestReRandomize}
                disabled={reRandomizeMutation.isPending}
                className="shrink-0 self-end sm:self-start"
              >
                Re-randomize
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {legacyPairedMixMatch && (
            <div
              className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
              role="status"
            >
              This competition uses the legacy heat format (one slot per couple). To move leads and follows separately, go to the Prelim page and{" "}
              <strong>Generate heats</strong> again (existing prelim scores will reset).
            </div>
          )}
          {sortedHeats.length === 0 || !hasSlots ? (
            <p className="text-sm text-muted-foreground">
              No heats yet. Configure on the Prelim page and run <strong>Generate heats</strong>.
            </p>
          ) : legacyPairedMixMatch ? (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {sortedHeats.map((heat) => (
                <LegacyPairedColumn
                  key={heat.id}
                  heat={heat}
                  groups={legacyGroupsByHeat.get(heat.id) ?? []}
                />
              ))}
            </div>
          ) : mixMatchFlat ? (
            <div className="space-y-10">
              <section aria-labelledby="heat-layout-leads-heading">
                <h2
                  id="heat-layout-leads-heading"
                  className="mb-3 text-sm font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300"
                >
                  Leads
                </h2>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={onDragStart}
                  onDragOver={onDragOverLeads}
                  onDragEnd={onDragEndLeadsWrapped}
                  onDragCancel={onDragCancel}
                >
                  <div className="flex gap-4 overflow-x-auto pb-2">
                    {sortedHeats.map((heat) => (
                      <RoleHeatColumn
                        key={`lead-${heat.id}`}
                        heat={heat}
                        role="lead"
                        slotIds={leadPart[heat.id] ?? []}
                        slotById={slotById}
                      />
                    ))}
                  </div>
                  <DragOverlay>
                    {activeSlot?.scoring_role === "lead" ? (
                      <div className="rounded-lg border-2 border-sky-500/40 bg-card px-3 py-2 shadow-lg">
                        <div className="text-[10px] font-semibold uppercase text-muted-foreground">Lead</div>
                        <div className="text-sm font-medium">{activeSlot.display_name ?? "Dancer"}</div>
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              </section>

              <section aria-labelledby="heat-layout-follows-heading">
                <h2
                  id="heat-layout-follows-heading"
                  className="mb-3 text-sm font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300"
                >
                  Follows
                </h2>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={onDragStart}
                  onDragOver={onDragOverFollows}
                  onDragEnd={onDragEndFollowsWrapped}
                  onDragCancel={onDragCancel}
                >
                  <div className="flex gap-4 overflow-x-auto pb-2">
                    {sortedHeats.map((heat) => (
                      <RoleHeatColumn
                        key={`follow-${heat.id}`}
                        heat={heat}
                        role="follow"
                        slotIds={followPart[heat.id] ?? []}
                        slotById={slotById}
                      />
                    ))}
                  </div>
                  <DragOverlay>
                    {activeSlot?.scoring_role === "follow" ? (
                      <div className="rounded-lg border-2 border-violet-500/40 bg-card px-3 py-2 shadow-lg">
                        <div className="text-[10px] font-semibold uppercase text-muted-foreground">Follow</div>
                        <div className="text-sm font-medium">{activeSlot.display_name ?? "Dancer"}</div>
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              </section>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={onDragStart}
              onDragOver={onDragOverCombined}
              onDragEnd={onDragEndCombined}
              onDragCancel={onDragCancel}
            >
              <div className="flex gap-4 overflow-x-auto pb-2">
                {sortedHeats.map((heat) => (
                  <HeatColumn
                    key={heat.id}
                    heat={heat}
                    slotIds={board[heat.id] ?? []}
                    slotById={slotById}
                  />
                ))}
              </div>
              <DragOverlay>
                {activeSlot ? (
                  <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
                    <div className="text-sm font-medium">{activeSlot.display_name ?? "Dancer"}</div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
          {putMutation.isPending && (
            <p className="mt-4 text-xs text-muted-foreground">Saving…</p>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
