import { describe, expect, it } from "vitest";
import {
  buildMixMatchResultsSnapshot,
  computeManualHybridAlternateIds,
  computeRandomTiesAlternateIds,
  officialAlternateCompetitorIds,
  resolveRoleAlternateIds,
} from "./prelimAlternates";

const ranking = [
  { competitor_id: "a", yes_count: 3, alt_count: 0 },
  { competitor_id: "b", yes_count: 3, alt_count: 0 },
  { competitor_id: "c", yes_count: 3, alt_count: 0 },
  { competitor_id: "d", yes_count: 1, alt_count: 0 },
];

describe("computeRandomTiesAlternateIds", () => {
  it("picks only from the first tied group for the first alternate slot", () => {
    const finalists = new Set<string>();
    let rng = 0;
    const ids = computeRandomTiesAlternateIds(ranking, finalists, 1, () => {
      rng += 0.31;
      return rng % 1;
    });
    expect(ids).toHaveLength(1);
    expect(["a", "b", "c"]).toContain(ids[0]!);
  });

  it("after one tie-break removes only the chosen competitor", () => {
    const finalists = new Set<string>();
    const ids = computeRandomTiesAlternateIds(ranking, finalists, 2, () => 0);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe("a");
    expect(ids[1]).toBe("b");
  });
});

describe("computeManualHybridAlternateIds", () => {
  it("uses manual pick then RP for remaining slots", () => {
    const finalists = new Set<string>();
    const ids = computeManualHybridAlternateIds(ranking, finalists, 2, ["c", ""]);
    expect(ids[0]).toBe("c");
    expect(ids[1]).toBe("a");
  });
});

describe("resolveRoleAlternateIds", () => {
  const snap = buildMixMatchResultsSnapshot({
    lead_ranking: ranking,
    follow_ranking: [],
    lead_cut_line_index: 0,
    follow_cut_line_index: -1,
  });

  it("uses cached random ids when snapshot matches", () => {
    const ids = resolveRoleAlternateIds(
      ranking,
      new Set(),
      1,
      { mode: "random_ties", randomIds: ["b"] },
      snap,
      snap
    );
    expect(ids).toEqual(["b"]);
  });

  it("falls back to RP when random cache snapshot mismatches", () => {
    const ids = resolveRoleAlternateIds(
      ranking,
      new Set(),
      1,
      { mode: "random_ties", randomIds: ["b"] },
      "old",
      snap
    );
    expect(ids).toEqual(officialAlternateCompetitorIds(ranking, new Set(), 1));
  });
});
