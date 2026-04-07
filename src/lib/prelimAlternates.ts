const storageKey = (competitionId: string) => `swing-score:prelimAnnounceAlt:${competitionId}`;
const pickBundleKey = (competitionId: string) => `swing-score:prelimAltPick:${competitionId}`;

/** Default 1; use read/write for persisted “how many named alternates to announce” per competition. */
export function clampAnnouncedAlternateCount(n: number): number {
  if (!Number.isFinite(n)) return 1;
  const f = Math.floor(n);
  return f < 1 ? 1 : f;
}

export function readAnnouncedAlternateCount(competitionId: string): number {
  if (!competitionId || typeof localStorage === "undefined") return 1;
  try {
    const v = localStorage.getItem(storageKey(competitionId));
    if (v == null) return 1;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? clampAnnouncedAlternateCount(n) : 1;
  } catch {
    return 1;
  }
}

export function writeAnnouncedAlternateCount(competitionId: string, n: number): void {
  if (!competitionId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(competitionId), String(clampAnnouncedAlternateCount(n)));
  } catch {
    /* ignore quota / private mode */
  }
}

export type AlternatePickMode = "rp" | "random_ties" | "manual";

export type RoleAlternatePick = {
  mode: AlternatePickMode;
  /** Per slot 1…N; empty string = fill from RP for that slot. */
  manualSlots?: string[];
  /** Last random resolution (ordered, length ≤ cap). */
  randomIds?: string[];
};

export type AlternatePickBundle = {
  /** Fingerprint of prelim results; when it changes, cached random picks are cleared. */
  snapshot: string;
  lead: RoleAlternatePick;
  follow: RoleAlternatePick;
};

function defaultRolePick(): RoleAlternatePick {
  return { mode: "rp" };
}

export function defaultAlternatePickBundle(): AlternatePickBundle {
  return { snapshot: "", lead: defaultRolePick(), follow: defaultRolePick() };
}

/** Same fingerprint as Prelim results page uses for Mix & Match. */
export function buildMixMatchResultsSnapshot(results: {
  lead_ranking?: { competitor_id?: string; yes_count: number; alt_count: number }[];
  follow_ranking?: { competitor_id?: string; yes_count: number; alt_count: number }[];
  lead_cut_line_index?: number;
  follow_cut_line_index?: number;
}): string {
  const lr = (results.lead_ranking ?? []).map((e) => `${e.competitor_id}:${e.yes_count}:${e.alt_count}`).join("|");
  const fr = (results.follow_ranking ?? []).map((e) => `${e.competitor_id}:${e.yes_count}:${e.alt_count}`).join("|");
  return `${lr};;${fr};;${results.lead_cut_line_index ?? ""};;${results.follow_cut_line_index ?? ""}`;
}

function normalizeRolePick(r: unknown): RoleAlternatePick {
  if (!r || typeof r !== "object") return defaultRolePick();
  const o = r as Record<string, unknown>;
  const mode =
    o.mode === "random_ties" || o.mode === "manual" ? (o.mode as AlternatePickMode) : ("rp" as const);
  const manualSlots = Array.isArray(o.manualSlots)
    ? (o.manualSlots as unknown[]).map((x) => (typeof x === "string" ? x : ""))
    : undefined;
  const randomIds = Array.isArray(o.randomIds)
    ? (o.randomIds as unknown[]).filter((x): x is string => typeof x === "string")
    : undefined;
  return { mode, manualSlots, randomIds };
}

export function readAlternatePickBundle(competitionId: string): AlternatePickBundle {
  if (!competitionId || typeof localStorage === "undefined") return defaultAlternatePickBundle();
  try {
    const raw = localStorage.getItem(pickBundleKey(competitionId));
    if (!raw) return defaultAlternatePickBundle();
    const p = JSON.parse(raw) as Partial<AlternatePickBundle>;
    return {
      snapshot: typeof p.snapshot === "string" ? p.snapshot : "",
      lead: normalizeRolePick(p.lead),
      follow: normalizeRolePick(p.follow),
    };
  } catch {
    return defaultAlternatePickBundle();
  }
}

export function writeAlternatePickBundle(competitionId: string, bundle: AlternatePickBundle): void {
  if (!competitionId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(pickBundleKey(competitionId), JSON.stringify(bundle));
  } catch {
    /* ignore */
  }
}

/**
 * RP order: first `maxAlternates` competitors in `ranking` who are not in `finalistIds`.
 * Used for “highest non-finalist = 1st alternate” (then 2nd, 3rd, …).
 */
export function officialAlternateCompetitorIds(
  ranking: { competitor_id?: string }[],
  finalistIds: Set<string>,
  maxAlternates: number
): string[] {
  const cap = clampAnnouncedAlternateCount(maxAlternates);
  const out: string[] = [];
  for (const e of ranking) {
    const id = e.competitor_id;
    if (!id || finalistIds.has(id)) continue;
    out.push(id);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Among remaining non-finalists, take the first RP block that shares the same YES/ALT totals,
 * pick one at random, remove only that person, repeat until `cap` alternates.
 */
export function computeRandomTiesAlternateIds(
  ranking: { competitor_id?: string; yes_count: number; alt_count: number }[],
  finalistIds: Set<string>,
  maxAlternates: number,
  rng: () => number
): string[] {
  const cap = clampAnnouncedAlternateCount(maxAlternates);
  const pool = ranking
    .map((e) => ({
      id: e.competitor_id,
      yes: e.yes_count,
      alt: e.alt_count,
    }))
    .filter((e): e is { id: string; yes: number; alt: number } =>
      Boolean(e.id && !finalistIds.has(e.id))
    );

  const out: string[] = [];
  while (out.length < cap && pool.length > 0) {
    const { yes, alt } = pool[0];
    let k = 0;
    while (k < pool.length && pool[k].yes === yes && pool[k].alt === alt) {
      k++;
    }
    const group = pool.slice(0, k);
    const idx = Math.floor(rng() * group.length);
    const chosen = group[idx].id;
    out.push(chosen);
    const removeAt = pool.findIndex((p) => p.id === chosen);
    if (removeAt >= 0) pool.splice(removeAt, 1);
  }
  return out;
}

/**
 * For each slot, use manual pick if set and valid; otherwise next RP non-finalist not yet used.
 */
export function computeManualHybridAlternateIds(
  ranking: { competitor_id?: string }[],
  finalistIds: Set<string>,
  maxAlternates: number,
  manualSlots: string[]
): string[] {
  const cap = clampAnnouncedAlternateCount(maxAlternates);
  const rpQueue = ranking
    .map((e) => e.competitor_id)
    .filter((id): id is string => Boolean(id && !finalistIds.has(id)));

  const out: string[] = [];
  const used = new Set<string>();
  const slots = manualSlots.slice(0, cap);
  for (let i = 0; i < cap; i++) {
    const want = (slots[i] ?? "").trim();
    if (want && !finalistIds.has(want) && rpQueue.includes(want) && !used.has(want)) {
      out.push(want);
      used.add(want);
      continue;
    }
    const next = rpQueue.find((id) => !used.has(id));
    if (next) {
      out.push(next);
      used.add(next);
    }
  }
  return out;
}

/** Keep cached picks that are still valid; fill remaining slots from RP order. */
export function filterAndFillCachedAlternateIds(
  cached: string[],
  ranking: { competitor_id?: string }[],
  finalistIds: Set<string>,
  maxAlternates: number
): string[] {
  const cap = clampAnnouncedAlternateCount(maxAlternates);
  const rankingIds = new Set(
    ranking.map((e) => e.competitor_id).filter((x): x is string => Boolean(x))
  );
  const out: string[] = [];
  const used = new Set<string>();
  for (const id of cached) {
    if (out.length >= cap) break;
    if (!id || finalistIds.has(id) || !rankingIds.has(id) || used.has(id)) continue;
    out.push(id);
    used.add(id);
  }
  if (out.length >= cap) return out;
  const rpRest = officialAlternateCompetitorIds(ranking, finalistIds, cap * 3);
  for (const id of rpRest) {
    if (out.length >= cap) break;
    if (!used.has(id)) {
      out.push(id);
      used.add(id);
    }
  }
  return out.slice(0, cap);
}

export function resolveRoleAlternateIds(
  ranking: { competitor_id?: string; yes_count: number; alt_count: number }[],
  finalistIds: Set<string>,
  maxAlternates: number,
  rolePick: RoleAlternatePick,
  bundleSnapshot: string,
  currentSnapshot: string
): string[] {
  const cap = clampAnnouncedAlternateCount(maxAlternates);
  if (!ranking.length || cap < 1) return [];

  const snapshotOk = bundleSnapshot === currentSnapshot && currentSnapshot.length > 0;

  if (rolePick.mode === "manual") {
    return computeManualHybridAlternateIds(ranking, finalistIds, cap, rolePick.manualSlots ?? []);
  }

  if (rolePick.mode === "random_ties") {
    if (snapshotOk && rolePick.randomIds?.length) {
      return filterAndFillCachedAlternateIds(rolePick.randomIds, ranking, finalistIds, cap);
    }
    return officialAlternateCompetitorIds(ranking, finalistIds, cap);
  }

  return officialAlternateCompetitorIds(ranking, finalistIds, cap);
}
