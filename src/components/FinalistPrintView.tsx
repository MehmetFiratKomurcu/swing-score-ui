import type { DivisionType, FinalistEntry, FinalistLeadFollow } from "@/lib/api";

export type AlternateEntry = { display_name: string };

type Props = {
  competitionName: string;
  finalists: FinalistEntry[];
  finalistLeads: FinalistLeadFollow[];
  finalistFollows: FinalistLeadFollow[];
  alternates?: AlternateEntry[];
  /** When mix & match finalists are still per-person (no final pairs saved), avoid printing 12 duplicate lines vs Leaders/Followers. */
  divisionType?: DivisionType;
};

function isMixMatchFinalistsBeforePartnerships(
  divisionType: DivisionType | undefined,
  finalists: FinalistEntry[],
  finalistLeads: FinalistLeadFollow[],
  finalistFollows: FinalistLeadFollow[]
): boolean {
  if (divisionType !== "random_partner") return false;
  if (!finalists.length || !finalistLeads.length || !finalistFollows.length) return false;
  return finalists.every((f) => f.competitor_id != null && f.pair_id == null);
}

function finalistNumberLabel(f: FinalistEntry): string {
  if (f.number != null) return `#${f.number}`;
  if (f.numbers?.length) return f.numbers.map((n) => `#${n}`).join(", ");
  return "—";
}

export function FinalistPrintView({
  competitionName,
  finalists,
  finalistLeads,
  finalistFollows,
  alternates = [],
  divisionType,
}: Props) {
  const hidePerPersonFinalistTable = isMixMatchFinalistsBeforePartnerships(
    divisionType,
    finalists,
    finalistLeads,
    finalistFollows
  );

  return (
    <div className="print-content p-6">
      <div className="break-after-page print-page">
        <h1 className="text-xl font-bold mb-2">{competitionName}</h1>
        <p className="text-sm text-muted-foreground mb-6">Prelim – Finalists (Finalists, Leaders, Followers, Alternates)</p>

        <h2 className="text-base font-semibold mb-2">Finalists</h2>
        {hidePerPersonFinalistTable ? (
          <p className="text-sm text-muted-foreground mb-6 max-w-prose">
            You advanced {finalistLeads.length} leads and {finalistFollows.length} follows — that is{" "}
            {Math.min(finalistLeads.length, finalistFollows.length)} couples by headcount, not 12 separate finalists.
            The list below was showing one row per person. Save <strong>Final partnerships</strong> on the Final page,
            then print again: you will get one row per competing couple (same as final scoring).
          </p>
        ) : (
          <table className="w-full border-collapse text-sm mb-6">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4">No</th>
                <th className="text-left py-2">Name</th>
              </tr>
            </thead>
            <tbody>
              {finalists.map((f, idx) => (
                <tr key={idx} className="border-b border-border">
                  <td className="py-2 pr-4">{finalistNumberLabel(f)}</td>
                  <td className="py-2">{f.display_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2 className="text-base font-semibold mb-2">Leaders</h2>
        <table className="w-full border-collapse text-sm mb-6">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4">No</th>
              <th className="text-left py-2">Name</th>
            </tr>
          </thead>
          <tbody>
            {finalistLeads.map((c, idx) => (
              <tr key={idx} className="border-b border-border">
                <td className="py-2 pr-4">{c.number != null ? `#${c.number}` : "—"}</td>
                <td className="py-2">{c.display_name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="text-base font-semibold mb-2">Followers</h2>
        <table className="w-full border-collapse text-sm mb-6">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4">No</th>
              <th className="text-left py-2">Name</th>
            </tr>
          </thead>
          <tbody>
            {finalistFollows.map((c, idx) => (
              <tr key={idx} className="border-b border-border">
                <td className="py-2 pr-4">{c.number != null ? `#${c.number}` : "—"}</td>
                <td className="py-2">{c.display_name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {alternates.length > 0 && (
          <>
            <h2 className="text-base font-semibold mb-2">Alternates</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4">Rank</th>
                  <th className="text-left py-2">Name</th>
                </tr>
              </thead>
              <tbody>
                {alternates.map((a, idx) => (
                  <tr key={idx} className="border-b border-border">
                    <td className="py-2 pr-4">{idx + 1}</td>
                    <td className="py-2">{a.display_name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
