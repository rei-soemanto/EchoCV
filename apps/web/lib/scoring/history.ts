import rubric from "@echocv/shared/rubric.json";

export type HistorySession = {
  id: string;
  created_at: string;
  role: string;
  level: string;
  language: string;
  mode: string;
  status: string;
};

export type HistoryReport = {
  session_id: string;
  overall_score: number | string | null;
  report: { dimensionScores?: { id: string; score: number }[]; contentStatus?: string } | null;
};

type Point = { session_id: string; at: string; score: number };

const round = (value: number) => Math.round(value * 10) / 10;

export function summarizeHistory(sessions: HistorySession[], reports: HistoryReport[]) {
  const reportBySession = new Map(reports.map((report) => [report.session_id, report]));
  const oldestFirst = [...sessions].sort((a, b) => a.created_at.localeCompare(b.created_at));

  const overall: Point[] = [];
  const dimensions: Record<string, Point[]> = Object.fromEntries(rubric.dimensions.map(({ id }) => [id, []]));
  for (const session of oldestFirst) {
    const report = reportBySession.get(session.id);
    if (!report || report.overall_score === null) continue;
    overall.push({ session_id: session.id, at: session.created_at, score: Number(report.overall_score) });
    for (const { id, score } of report.report?.dimensionScores ?? []) {
      dimensions[id]?.push({ session_id: session.id, at: session.created_at, score });
    }
  }

  const averages = Object.fromEntries(
    Object.entries(dimensions)
      .filter(([, points]) => points.length)
      .map(([id, points]) => [id, round(points.reduce((sum, point) => sum + point.score, 0) / points.length)]),
  ) as Record<string, number>;

  const scored = rubric.dimensions.filter(({ id, weight }) => weight > 0 && averages[id] !== undefined);
  const weakest = scored.length
    ? scored.reduce((low, dimension) => (averages[dimension.id] < averages[low.id] ? dimension : low))
    : null;

  return {
    sessions: [...sessions]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((session) => {
        const report = reportBySession.get(session.id);
        return {
          ...session,
          overall_score: report?.overall_score === null || report === undefined ? null : Number(report.overall_score),
          content_status: report?.report?.contentStatus ?? null,
        };
      }),
    trends: { overall, dimensions },
    averages,
    weakest: weakest ? { id: weakest.id, label: weakest.label, score: averages[weakest.id] } : null,
    change: overall.length >= 2 ? round(overall[overall.length - 1].score - overall[0].score) : null,
  };
}
