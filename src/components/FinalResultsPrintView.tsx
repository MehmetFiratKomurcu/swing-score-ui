export type FinalResultPrintRow = { place: number; display_name: string };

export type AnnouncePlaceDepth = 1 | 2 | 3;

function ordinalHeading(place: number): string {
  if (place === 1) return "1st place";
  if (place === 2) return "2nd place";
  if (place === 3) return "3rd place";
  const s = String(place);
  const last = s.slice(-1);
  const teen = place > 10 && place < 20;
  const suf = teen ? "th" : last === "1" ? "st" : last === "2" ? "nd" : last === "3" ? "rd" : "th";
  return `${place}${suf} place`;
}

function announcePhrase(depth: AnnouncePlaceDepth): string {
  if (depth === 1) return "1st place only";
  if (depth === 2) return "1st and 2nd place";
  return "1st, 2nd, and 3rd place";
}

type Props = {
  competitionName: string;
  announceDepth: AnnouncePlaceDepth;
  rows: FinalResultPrintRow[];
};

/**
 * Single-page style sheet for MC / stage: only the top N places you chose to announce.
 */
export function FinalResultsPrintView({ competitionName, announceDepth, rows }: Props) {
  return (
    <div className="print-content p-6 print:bg-white print:text-black">
      <div className="print-page">
        <h1 className="text-2xl font-bold mb-1 print:text-black">{competitionName}</h1>
        <p className="text-sm font-medium mb-1 print:text-neutral-700">Final — Placement results</p>
        <p className="text-xs mb-10 print:text-neutral-600">
          Announcement sheet (this printout): <span className="font-semibold print:text-black">{announcePhrase(announceDepth)}</span>
        </p>

        {rows.length === 0 ? (
          <p className="text-sm print:text-neutral-600">No results in this range.</p>
        ) : (
          <ul className="list-none space-y-10 p-0 m-0">
            {rows.map((row) => (
              <li key={row.place} className="border-b border-border pb-8 last:border-0 print:border-neutral-300">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-2 print:text-neutral-500">
                  {ordinalHeading(row.place)}
                </p>
                <p className="text-3xl font-bold leading-tight tracking-tight print:text-black">{row.display_name || "—"}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
