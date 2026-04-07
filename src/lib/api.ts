const API_BASE = import.meta.env.VITE_API_URL ?? "";

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("swing_score_token");
    if (token) h["Authorization"] = `Bearer ${token}`;
  }
  return h;
}

function headers(): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...authHeaders(),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = (body as { error?: string })?.error ?? res.statusText;
    throw new Error(message);
  }
  return res.json();
}

export type Event = {
  id: string;
  user_id?: string;
  name: string;
  year: number;
  created_at: string;
};

export type EventsResponse = { events: Event[] };

export async function getEvents(): Promise<EventsResponse> {
  const res = await fetch(`${API_BASE}/api/events`, { headers: headers() });
  return handleResponse<EventsResponse>(res);
}

export async function getEvent(id: string): Promise<Event> {
  const res = await fetch(`${API_BASE}/api/events/${id}`, { headers: headers() });
  return handleResponse<Event>(res);
}

export type CreateEventBody = { name: string; year: number };

export async function createEvent(body: CreateEventBody): Promise<Event> {
  const res = await fetch(`${API_BASE}/api/events`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handleResponse<Event>(res);
}

export type UpdateEventBody = { name?: string; year?: number };

export async function updateEvent(id: string, body: UpdateEventBody): Promise<Event> {
  const res = await fetch(`${API_BASE}/api/events/${id}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handleResponse<Event>(res);
}

// Competitions
export type DivisionType = "random_partner" | "fixed_partner" | "solo";

export type Competition = {
  id: string;
  event_id: string;
  name: string;
  division_type: DivisionType;
  number_assignment_mode: "manual" | "auto";
  created_at: string;
  updated_at: string;
};

export type CompetitionsResponse = { competitions: Competition[] };

export async function getCompetitions(eventId: string): Promise<CompetitionsResponse> {
  const res = await fetch(`${API_BASE}/api/events/${eventId}/competitions`, { headers: headers() });
  return handleResponse<CompetitionsResponse>(res);
}

export async function getCompetition(id: string): Promise<Competition> {
  const res = await fetch(`${API_BASE}/api/competitions/${id}`, { headers: headers() });
  return handleResponse<Competition>(res);
}

export type CreateCompetitionBody = {
  name: string;
  division_type: DivisionType;
  number_assignment_mode?: "manual" | "auto";
};

export async function createCompetition(eventId: string, body: CreateCompetitionBody): Promise<Competition> {
  const res = await fetch(`${API_BASE}/api/events/${eventId}/competitions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handleResponse<Competition>(res);
}

export async function deleteCompetition(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/competitions/${id}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = (body as { error?: string })?.error ?? res.statusText;
    throw new Error(message);
  }
}

// Competitors
export type Competitor = {
  id: string;
  competition_id: string;
  name: string;
  role: "lead" | "follow" | "solo";
  email?: string;
  number?: number;
  partner_name?: string;
  created_at: string;
};

export type CompetitorsResponse = { competitors: Competitor[] };

export async function getCompetitors(competitionId: string): Promise<CompetitorsResponse> {
  const res = await fetch(`${API_BASE}/api/competitions/${competitionId}/competitors`, { headers: headers() });
  return handleResponse<CompetitorsResponse>(res);
}

export type CreateCompetitorBody = {
  name: string;
  role: "lead" | "follow" | "solo";
  email?: string;
  number?: number;
  partner_name?: string;
};

export async function createCompetitor(competitionId: string, body: CreateCompetitorBody): Promise<Competitor> {
  const res = await fetch(`${API_BASE}/api/competitions/${competitionId}/competitors`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handleResponse<Competitor>(res);
}

export async function updateCompetitor(
  competitionId: string,
  id: string,
  body: Partial<CreateCompetitorBody>
): Promise<Competitor> {
  const res = await fetch(`${API_BASE}/api/competitions/${competitionId}/competitors/${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handleResponse<Competitor>(res);
}

export async function deleteCompetitor(competitionId: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/competitions/${competitionId}/competitors/${id}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as { error?: string })?.error ?? res.statusText;
    throw new Error(msg);
  }
}

export type ImportCompetitorsResult = { created: number; errors: { row: number; error: string }[] };

export async function importCompetitors(competitionId: string, file: File): Promise<ImportCompetitorsResult> {
  const form = new FormData();
  form.append("file", file);
  const h: HeadersInit = { ...authHeaders() };
  const res = await fetch(`${API_BASE}/api/competitions/${competitionId}/competitors/import`, {
    method: "POST",
    headers: h,
    body: form,
  });
  const data = await handleResponse<ImportCompetitorsResult>(res);
  // Go json encodes nil slices as null; normalize for clients.
  return { created: data.created, errors: data.errors ?? [] };
}

export async function downloadCompetitorsImportTemplate(competitionId: string): Promise<Blob> {
  const res = await fetch(
    `${API_BASE}/api/competitions/${competitionId}/competitors/import/template`,
    { headers: headers() }
  );
  if (!res.ok) throw new Error(res.statusText);
  return res.blob();
}

// Judges
export type Judge = { id: string; event_id?: string; name: string; email?: string; created_at: string };

export type JudgeWithAssigned = Judge & {
  assigned_rounds: ("prelim" | "final")[];
  votes_for_prelim?: "lead" | "follow";
  votes_for_final?: "lead" | "follow";
};

export type JudgesResponse = { judges: JudgeWithAssigned[] };

export type EventJudgesResponse = { judges: Judge[] };

export async function getEventJudges(eventId: string): Promise<EventJudgesResponse> {
  const res = await fetch(`${API_BASE}/api/events/${eventId}/judges`, { headers: headers() });
  return handleResponse<EventJudgesResponse>(res);
}

export async function createEventJudge(
  eventId: string,
  body: { name: string; email?: string }
): Promise<Judge> {
  const res = await fetch(`${API_BASE}/api/events/${eventId}/judges`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handleResponse<Judge>(res);
}

export async function updateEventJudge(
  eventId: string,
  judgeId: string,
  body: { name?: string; email?: string }
): Promise<Judge> {
  const res = await fetch(`${API_BASE}/api/events/${eventId}/judges/${judgeId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handleResponse<Judge>(res);
}

export async function deleteEventJudge(eventId: string, judgeId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/events/${eventId}/judges/${judgeId}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string })?.error ?? res.statusText);
  }
}

export type ImportJudgesResult = { created: number; errors: { row: number; error: string }[] };

export async function importEventJudges(eventId: string, file: File): Promise<ImportJudgesResult> {
  const form = new FormData();
  form.append("file", file);
  const h: HeadersInit = { ...authHeaders() };
  const res = await fetch(`${API_BASE}/api/events/${eventId}/judges/import`, {
    method: "POST",
    headers: h,
    body: form,
  });
  const data = await handleResponse<ImportJudgesResult>(res);
  return { created: data.created, errors: data.errors ?? [] };
}

export async function downloadJudgesImportTemplate(eventId: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/events/${eventId}/judges/import/template`, { headers: headers() });
  if (!res.ok) throw new Error(res.statusText);
  return res.blob();
}

export async function getJudges(competitionId: string): Promise<JudgesResponse> {
  const res = await fetch(`${API_BASE}/api/competitions/${competitionId}/judges`, { headers: headers() });
  return handleResponse<JudgesResponse>(res);
}

export async function assignJudge(
  competitionId: string,
  body: { judge_id: string; round: "prelim" | "final"; votes_for?: "lead" | "follow" }
): Promise<Judge> {
  const res = await fetch(`${API_BASE}/api/competitions/${competitionId}/judges`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handleResponse<Judge>(res);
}

export async function updateJudge(
  competitionId: string,
  judgeId: string,
  body: { name?: string; email?: string; round?: "prelim" | "final"; votes_for?: "lead" | "follow" }
): Promise<Judge> {
  const res = await fetch(`${API_BASE}/api/competitions/${competitionId}/judges/${judgeId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handleResponse<Judge>(res);
}

export async function unassignJudge(
  competitionId: string,
  judgeId: string,
  round: "prelim" | "final"
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/competitions/${competitionId}/judges/${judgeId}?round=${round}`,
    { method: "DELETE", headers: headers() }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string })?.error ?? res.statusText);
  }
}

// Prelim
export type PrelimConfig = {
  competition_id: string;
  heat_count: number;
  yes_count: number;
  alternate_count: number;
  /** When true, maybe/alternate slots have a defined preference order (print + scoring use alt_rank). */
  alternates_ranked?: boolean;
};

export type Heat = { id: string; competition_id: string; round: string; heat_number: number };

export type HeatSlot = {
  id: string;
  heat_id: string;
  slot_order: number;
  competitor_id?: string;
  pair_id?: string;
  numbers?: number[];
  display_name?: string;
  /** Mix & Match: which role this row is for (one API row per dancer). */
  scoring_role?: "lead" | "follow";
};

export type PrelimJudge = Judge & { votes_for_prelim?: "lead" | "follow" };

/** One persisted prelim vote (from GET /prelim). */
export type PrelimScoreRow = {
  judge_id: string;
  heat_slot_id: string;
  competitor_id?: string;
  is_yes: boolean;
  alt_rank?: number | null;
};

export type PrelimResponse = {
  config: PrelimConfig;
  has_config: boolean;
  heats: Heat[];
  heat_slots: HeatSlot[];
  judges?: PrelimJudge[];
  scores?: PrelimScoreRow[];
};

export async function getPrelim(competitionId: string): Promise<PrelimResponse> {
  const res = await fetch(`${API_BASE}/api/competitions/${competitionId}/prelim`, { headers: headers() });
  return handleResponse<PrelimResponse>(res);
}

export async function putPrelimConfig(
  competitionId: string,
  body: { heat_count: number; yes_count: number; alternate_count: number; alternates_ranked: boolean }
): Promise<PrelimConfig> {
  const res = await fetch(`${API_BASE}/api/competitions/${competitionId}/prelim/config`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handleResponse<PrelimConfig>(res);
}

export async function generatePrelimHeats(competitionId: string): Promise<{ heats: Heat[]; heat_slots: HeatSlot[] }> {
  const res = await fetch(`${API_BASE}/api/competitions/${competitionId}/prelim/heats/generate`, {
    method: "POST",
    headers: headers(),
  });
  return handleResponse<{ heats: Heat[]; heat_slots: HeatSlot[] }>(res);
}

export async function reRandomizePrelimHeats(competitionId: string): Promise<{ heats: Heat[]; heat_slots: HeatSlot[] }> {
  const res = await fetch(`${API_BASE}/api/competitions/${competitionId}/prelim/heats/re-randomize`, {
    method: "POST",
    headers: headers(),
  });
  return handleResponse<{ heats: Heat[]; heat_slots: HeatSlot[] }>(res);
}

export type PrelimHeatSlotAssignment = {
  id: string;
  heat_id: string;
  slot_order: number;
};

export async function putPrelimHeatSlots(competitionId: string, slots: PrelimHeatSlotAssignment[]): Promise<void> {
  const res = await fetch(`${API_BASE}/api/competitions/${competitionId}/prelim/heat-slots`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ slots }),
  });
  await handleResponse<{ status: string }>(res);
}

export async function putPrelimScores(
  competitionId: string,
  scores: { heat_slot_id: string; judge_id: string; competitor_id?: string; is_yes: boolean; alt_rank?: number }[]
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/competitions/${competitionId}/prelim/scores`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ scores }),
  });
  await handleResponse<{ status: string }>(res);
}

export type PrelimRankingEntry = {
  slot_id: string;
  yes_count: number;
  alt_count: number;
  competitor_id?: string;
  pair_id?: string;
};

export type PrelimResultsResponse = {
  division_type?: DivisionType;
  ranking: PrelimRankingEntry[];
  cut_line_index: number;
  judge_count: number;
  /** Mix & Match: leads ranked only from lead judges’ ballots. */
  lead_ranking?: PrelimRankingEntry[];
  lead_cut_line_index?: number;
  lead_judge_count?: number;
  /** Mix & Match: follows ranked only from follow judges’ ballots. */
  follow_ranking?: PrelimRankingEntry[];
  follow_cut_line_index?: number;
  follow_judge_count?: number;
};

export async function getPrelimResults(competitionId: string): Promise<PrelimResultsResponse> {
  const res = await fetch(`${API_BASE}/api/competitions/${competitionId}/prelim/results`, { headers: headers() });
  return handleResponse<PrelimResultsResponse>(res);
}

export async function advanceToFinal(
  competitionId: string,
  body: { competitor_ids?: string[]; pair_ids?: string[] }
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/competitions/${competitionId}/prelim/advance`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  await handleResponse<{ status: string }>(res);
}

// Final
export type FinalistEntry = {
  competitor_id?: string;
  pair_id?: string;
  number?: number;
  numbers?: number[];
  display_name: string;
};

export type FinalistLeadFollow = {
  competitor_id: string;
  number?: number;
  display_name: string;
};

export type FinalResponse = {
  advanced_to_final: { id: string; competition_id: string; competitor_id?: string; pair_id?: string }[];
  pairs: { id: string; lead_competitor_id: string; follow_competitor_id: string }[];
  heats: Heat[];
  heat_slots: HeatSlot[];
  final_scores: { judge_id: string; rank: number; competitor_id?: string; pair_id?: string }[];
  finalists?: FinalistEntry[];
  judges?: Judge[];
  finalist_leads?: FinalistLeadFollow[];
  finalist_follows?: FinalistLeadFollow[];
};

export async function getFinal(competitionId: string): Promise<FinalResponse> {
  const res = await fetch(`${API_BASE}/api/competitions/${competitionId}/final`, { headers: headers() });
  return handleResponse<FinalResponse>(res);
}

export async function postFinalPartnerships(
  competitionId: string,
  pairs: { lead_competitor_id: string; follow_competitor_id: string }[]
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/competitions/${competitionId}/final/partnerships`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ pairs }),
  });
  await handleResponse<{ status: string }>(res);
}

export async function putFinalScores(
  competitionId: string,
  scores: { judge_id: string; competitor_id?: string; pair_id?: string; rank: number }[]
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/competitions/${competitionId}/final/scores`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ scores }),
  });
  await handleResponse<{ status: string }>(res);
}

export type FinalResultPlace = { place: number; display_name: string; key?: string; ranks?: number[] };

export async function getFinalResults(competitionId: string): Promise<{ results: FinalResultPlace[]; places: FinalResultPlace[] }> {
  const res = await fetch(`${API_BASE}/api/competitions/${competitionId}/final/results`, { headers: headers() });
  return handleResponse<{ results: FinalResultPlace[]; places: FinalResultPlace[] }>(res);
}

export async function downloadFinalExport(competitionId: string, format: "csv" | "xlsx" = "xlsx"): Promise<Blob> {
  const res = await fetch(
    `${API_BASE}/api/competitions/${competitionId}/final/export?format=${format}`,
    { headers: headers() }
  );
  if (!res.ok) throw new Error(res.statusText);
  return res.blob();
}
