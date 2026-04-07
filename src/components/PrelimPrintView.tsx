import { Fragment } from "react";
import type { DivisionType, Heat, HeatSlot, PrelimConfig, PrelimJudge } from "@/lib/api";

export type PrelimPrintMode = "judge" | "mc-staff" | "mock";

type Props = {
  mode: PrelimPrintMode;
  competitionName: string;
  divisionType: DivisionType;
  heats: Heat[];
  heatSlots: HeatSlot[];
  judges: PrelimJudge[];
  config: PrelimConfig | null;
  copies?: number;
  mockCount?: number;
  /** Mix & Match: mock sheets use the same lead/follow rows as judge sheets for that role. */
  mockVotesForPrelim?: "lead" | "follow";
};

function slotsByHeat(heatSlots: HeatSlot[], heatId: string): HeatSlot[] {
  return heatSlots
    .filter((s) => s.heat_id === heatId)
    .sort((a, b) => {
      if (a.slot_order !== b.slot_order) return a.slot_order - b.slot_order;
      const roleRank = (r?: string) => (r === "lead" ? 0 : r === "follow" ? 1 : 2);
      return roleRank(a.scoring_role) - roleRank(b.scoring_role);
    });
}

/** Mix & Match: merge lead+follow rows (same slot id) into one row for undifferentiated print. */
function collapseRandomPartnerSlots(slots: HeatSlot[]): HeatSlot[] {
  const bySlotId = new Map<string, HeatSlot[]>();
  for (const s of slots) {
    const list = bySlotId.get(s.id) ?? [];
    list.push(s);
    bySlotId.set(s.id, list);
  }
  const out: HeatSlot[] = [];
  for (const group of bySlotId.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const lead = group.find((g) => g.scoring_role === "lead") ?? group[0];
    const follow = group.find((g) => g.scoring_role === "follow") ?? group[1];
    const nums = [...(lead.numbers ?? []), ...(follow.numbers ?? [])];
    out.push({
      ...lead,
      numbers: nums,
      display_name: `${lead.display_name ?? "—"} & ${follow.display_name ?? "—"}`,
      scoring_role: undefined,
      competitor_id: undefined,
    });
  }
  return out.sort((a, b) => a.slot_order - b.slot_order);
}

function slotsForRandomPartnerRole(
  allSlots: HeatSlot[],
  votesFor?: "lead" | "follow"
): HeatSlot[] {
  if (votesFor === "lead" || votesFor === "follow") {
    return allSlots.filter((s) => s.scoring_role === votesFor);
  }
  return collapseRandomPartnerSlots(allSlots);
}

function slotsForJudgeCopy(
  divisionType: DivisionType,
  allSlots: HeatSlot[],
  copyIndex: number,
  judges: PrelimJudge[]
): HeatSlot[] {
  if (divisionType !== "random_partner") return allSlots;
  const j = judges[copyIndex];
  return slotsForRandomPartnerRole(allSlots, j?.votes_for_prelim);
}

function roleLabel(role?: string) {
  if (role === "lead") return "Lead";
  if (role === "follow") return "Follow";
  return "—";
}

/** Shown after “Maybe (ALT): n” on judge heat pages and vote summary so jurors see the rule. */
function maybeAltRankHint(alternateCount: number, alternatesRanked: boolean): string {
  if (alternateCount <= 0) return "";
  return alternatesRanked ? " — ranked (preference order)" : " — unranked (any order)";
}

function HeatPage({
  competitionName,
  heatNumber,
  slots,
  yesCount,
  alternateCount,
  alternatesRanked,
  titlePrefix,
  showRoleColumn,
}: {
  competitionName: string;
  heatNumber: number;
  slots: HeatSlot[];
  yesCount: number;
  alternateCount: number;
  alternatesRanked: boolean;
  titlePrefix?: string;
  /** Mix & Match: distinguish lead/follow rows that share the same order. */
  showRoleColumn?: boolean;
}) {
  const title = titlePrefix
    ? `${titlePrefix} – ${competitionName} – Heat ${heatNumber}`
    : `${competitionName} – Heat ${heatNumber}`;
  const numbersStr = (slot: HeatSlot) =>
    slot.numbers?.length ? slot.numbers.join(", ") : "—";

  return (
    <div className="break-after-page print-page">
      <h1 className="text-lg font-bold mb-2">{title}</h1>
      <p className="text-sm mb-4">
        Advancing to final: YES: {yesCount}, Maybe (ALT): {alternateCount}
        {maybeAltRankHint(alternateCount, alternatesRanked)}
      </p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 pr-4">Order</th>
            {showRoleColumn ? (
              <th className="text-left py-2 pr-4">Role</th>
            ) : null}
            <th className="text-left py-2 pr-4">Number(s)</th>
            <th className="text-left py-2">Name</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <tr
              key={
                slot.competitor_id
                  ? `${slot.id}-${slot.competitor_id}-${slot.scoring_role ?? ""}`
                  : `${slot.id}-${slot.scoring_role ?? ""}`
              }
              className="border-b border-border"
            >
              <td className="py-2 pr-4">{slot.slot_order}</td>
              {showRoleColumn ? (
                <td className="py-2 pr-4">{roleLabel(slot.scoring_role)}</td>
              ) : null}
              <td className="py-2 pr-4">{numbersStr(slot)}</td>
              <td className="py-2">{slot.display_name ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VoteSummaryBoxes({
  count,
  showRank,
}: {
  count: number;
  /** Show 1…n in the corner when alternates are ranked. */
  showRank?: boolean;
}) {
  if (count <= 0) {
    return <p className="text-sm text-muted-foreground">None (0).</p>;
  }
  return (
    <div
      className="grid gap-2 w-full"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(4.5rem, 1fr))",
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="relative border border-border rounded-sm min-h-14 flex items-end justify-center pb-1 print:border-black"
        >
          {showRank ? (
            <span className="absolute left-1 top-1 text-xs text-muted-foreground print:text-black">
              {i + 1}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** One page at the end of each judge (or mock) packet: empty cells for YES / Maybe numbers. */
function JudgeVoteSummaryPage({
  competitionName,
  titlePrefix,
  yesCount,
  alternateCount,
  alternatesRanked,
}: {
  competitionName: string;
  titlePrefix?: string;
  yesCount: number;
  alternateCount: number;
  alternatesRanked: boolean;
}) {
  const title = titlePrefix
    ? `${titlePrefix} – ${competitionName} – Vote summary`
    : `${competitionName} – Vote summary`;
  const maybeHeading =
    alternateCount > 0
      ? alternatesRanked
        ? `Maybe / Alternates (ranked)`
        : `Maybe / Alternates`
      : `Maybe / Alternates`;

  return (
    <div className="break-after-page print-page">
      <h1 className="text-lg font-bold mb-2">{title}</h1>
      <p className="text-sm mb-6 text-muted-foreground print:text-black">
        Advancing to final: YES: {yesCount}, Maybe (ALT): {alternateCount}
        {maybeAltRankHint(alternateCount, alternatesRanked)}. Write competitor or bib numbers below for quick
        entry into the system.
      </p>
      <section className="mb-8">
        <h2 className="text-base font-semibold mb-2 border-b border-border pb-1 print:border-black">
          YES — {yesCount} {yesCount === 1 ? "slot" : "slots"}
        </h2>
        <VoteSummaryBoxes count={yesCount} />
      </section>
      <section>
        <h2 className="text-base font-semibold mb-2 border-b border-border pb-1 print:border-black">
          {maybeHeading} — {alternateCount} {alternateCount === 1 ? "slot" : "slots"}
        </h2>
        {alternatesRanked && alternateCount > 0 ? (
          <p className="text-xs text-muted-foreground mb-2 print:text-black">
            Use preference order: 1 = strongest maybe, then 2, 3, …
          </p>
        ) : null}
        <VoteSummaryBoxes count={alternateCount} showRank={alternatesRanked} />
      </section>
    </div>
  );
}

export function PrelimPrintView({
  mode,
  competitionName,
  divisionType,
  heats,
  heatSlots,
  judges,
  config,
  copies = 1,
  mockCount = 0,
  mockVotesForPrelim,
}: Props) {
  const yesCount = config?.yes_count ?? 0;
  const alternateCount = config?.alternate_count ?? 0;
  const alternatesRanked = config?.alternates_ranked ?? false;
  const sortedHeats = [...heats].sort((a, b) => a.heat_number - b.heat_number);

  if (mode === "mc-staff") {
    const heatSlotCounts = sortedHeats.map((h) => {
      const inHeat = heatSlots.filter((s) => s.heat_id === h.id);
      const slotsForCount =
        divisionType === "random_partner" ? collapseRandomPartnerSlots(inHeat) : inHeat;
      return { heat: h, count: slotsForCount.length };
    });
    const totalDancerRows = heatSlots.length;
    const uniqueCompetitorIds = new Set(
      heatSlots.map((s) => s.competitor_id).filter((id): id is string => Boolean(id))
    );
    const leadLineCount = heatSlots.filter((s) => s.scoring_role === "lead").length;
    const followLineCount = heatSlots.filter((s) => s.scoring_role === "follow").length;
    return (
      <div className="print-content p-6">
        <div className="break-after-page print-page">
          <h1 className="text-xl font-bold mb-2">{competitionName}</h1>
          <p className="text-sm text-muted-foreground mb-4">Prelim – MC &amp; Staff – Summary</p>
          <div className="space-y-2 text-sm mb-6">
            <p>
              <span className="font-medium">Heats:</span> {sortedHeats.length}
            </p>
            <p>
              <span className="font-medium">Dancers (lines):</span> {totalDancerRows}
              {divisionType === "random_partner" && leadLineCount + followLineCount > 0 ? (
                <>
                  {" "}
                  <span className="text-muted-foreground">
                    ({leadLineCount} Lead · {followLineCount} Follow)
                  </span>
                </>
              ) : uniqueCompetitorIds.size > 0 ? (
                <>
                  {" "}
                  <span className="text-muted-foreground">
                    ({uniqueCompetitorIds.size} unique competitor id
                    {uniqueCompetitorIds.size !== 1 ? "s" : ""})
                  </span>
                </>
              ) : null}
            </p>
            <p>
              <span className="font-medium">Advancing to final:</span> YES: {yesCount}, Maybe (ALT):{" "}
              {alternateCount}
              {maybeAltRankHint(alternateCount, alternatesRanked)}
            </p>
          </div>
          <h2 className="text-base font-semibold mb-2">Heats overview</h2>
          <table className="w-full border-collapse text-sm mb-6">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2">Heat</th>
                <th className="text-left py-2">
                  {divisionType === "random_partner" ? "Couples" : "Entries"}
                </th>
              </tr>
            </thead>
            <tbody>
              {heatSlotCounts.map(({ heat, count }) => (
                <tr key={heat.id} className="border-b border-border">
                  <td className="py-2">Heat {heat.heat_number}</td>
                  <td className="py-2">{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2 className="text-base font-semibold mb-2">Judges</h2>
          {judges.length === 0 ? (
            <p className="text-sm text-muted-foreground">No prelim judges assigned.</p>
          ) : (
            <ul className="list-disc list-inside text-sm space-y-1">
              {judges.map((j) => (
                <li key={j.id}>
                  {j.name}
                  {divisionType === "random_partner" && j.votes_for_prelim ? (
                    <span className="text-muted-foreground">
                      {" "}
                      ({j.votes_for_prelim === "follow" ? "Follow" : "Lead"} sheet)
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        {divisionType === "random_partner"
          ? (["lead", "follow"] as const).flatMap((role) =>
              sortedHeats.map((heat) => {
                const perHeat = slotsByHeat(heatSlots, heat.id);
                const slots = slotsForRandomPartnerRole(perHeat, role);
                return (
                  <HeatPage
                    key={`mc-${role}-${heat.id}`}
                    competitionName={competitionName}
                    heatNumber={heat.heat_number}
                    slots={slots}
                    yesCount={yesCount}
                    alternateCount={alternateCount}
                    alternatesRanked={alternatesRanked}
                    titlePrefix={`MC & Staff (${role === "lead" ? "Lead" : "Follow"})`}
                  />
                );
              })
            )
          : sortedHeats.map((heat) => {
              const perHeat = slotsByHeat(heatSlots, heat.id);
              return (
                <HeatPage
                  key={heat.id}
                  competitionName={competitionName}
                  heatNumber={heat.heat_number}
                  slots={perHeat}
                  yesCount={yesCount}
                  alternateCount={alternateCount}
                  alternatesRanked={alternatesRanked}
                  titlePrefix="MC & Staff"
                />
              );
            })}
      </div>
    );
  }

  if (mode === "judge") {
    return (
      <div className="print-content p-6">
        {Array.from({ length: copies }, (_, copyIndex) => {
          const judge = judges[copyIndex];
          const roleLabel =
            divisionType === "random_partner" && judge?.votes_for_prelim
              ? judge.votes_for_prelim === "follow"
                ? "Follow judge"
                : "Lead judge"
              : undefined;
          const titlePrefix = judge
            ? roleLabel
              ? `${judge.name} (${roleLabel})`
              : judge.name
            : undefined;
          return (
            <Fragment key={copyIndex}>
              {sortedHeats.map((heat) => {
                const perHeat = slotsByHeat(heatSlots, heat.id);
                const slots = slotsForJudgeCopy(divisionType, perHeat, copyIndex, judges);
                return (
                  <HeatPage
                    key={`${copyIndex}-${heat.id}`}
                    competitionName={competitionName}
                    heatNumber={heat.heat_number}
                    slots={slots}
                    yesCount={yesCount}
                    alternateCount={alternateCount}
                    alternatesRanked={alternatesRanked}
                    titlePrefix={titlePrefix}
                  />
                );
              })}
              <JudgeVoteSummaryPage
                competitionName={competitionName}
                titlePrefix={titlePrefix}
                yesCount={yesCount}
                alternateCount={alternateCount}
                alternatesRanked={alternatesRanked}
              />
            </Fragment>
          );
        })}
      </div>
    );
  }

  if (mode === "mock" && mockCount > 0) {
    return (
      <div className="print-content p-6">
        {Array.from({ length: mockCount }, (_, mockIndex) => {
          const roleLabel =
            divisionType === "random_partner" && mockVotesForPrelim
              ? mockVotesForPrelim === "follow"
                ? "Follow judge"
                : "Lead judge"
              : undefined;
          const titlePrefix = roleLabel
            ? `Mock Judge ${mockIndex + 1} (${roleLabel})`
            : `Mock Judge ${mockIndex + 1}`;
          return (
            <Fragment key={mockIndex}>
              {sortedHeats.map((heat) => {
                const perHeat = slotsByHeat(heatSlots, heat.id);
                const slots =
                  divisionType === "random_partner"
                    ? slotsForRandomPartnerRole(perHeat, mockVotesForPrelim)
                    : perHeat;
                return (
                  <HeatPage
                    key={`mock-${mockIndex}-${heat.id}`}
                    competitionName={competitionName}
                    heatNumber={heat.heat_number}
                    slots={slots}
                    yesCount={yesCount}
                    alternateCount={alternateCount}
                    alternatesRanked={alternatesRanked}
                    titlePrefix={titlePrefix}
                  />
                );
              })}
              <JudgeVoteSummaryPage
                competitionName={competitionName}
                titlePrefix={titlePrefix}
                yesCount={yesCount}
                alternateCount={alternateCount}
                alternatesRanked={alternatesRanked}
              />
            </Fragment>
          );
        })}
      </div>
    );
  }

  return null;
}
