import rubric from "@echocv/shared/rubric.json";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { loadHistory } from "@/lib/db/history";
import { decimal } from "@/lib/report/view";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Kemajuan · EchoCV" };

const DATE = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });

/** A 0..100 score as a bar with its number, so the value never depends on the bar alone. */
function Bar({ label, score }: { label: string; score: number }) {
  return (
    <li className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-4 sm:grid-cols-[14rem_1fr_3rem]">
      <span className="text-body-sm truncate">{label}</span>
      <span className="h-3 overflow-hidden rounded-full bg-border-default" aria-hidden="true">
        <span className="block h-full rounded-full bg-surface-accent" style={{ width: `${score}%` }} />
      </span>
      <span className="text-body-sm text-right font-mono">{decimal(score)}</span>
    </li>
  );
}

export default async function ProgressPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const history = auth.user ? await loadHistory(supabase, auth.user.id, 100) : null;
  if (!history) throw new Error("Could not load the practice history.");
  const points = history.trends.overall;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1">Kemajuan</h1>
        <p className="text-body text-ink-secondary">Skor latihan Anda dari sesi ke sesi, dan rata-rata setiap aspek.</p>
      </header>

      {points.length === 0 ? (
        <div className="flex flex-col items-start gap-4">
          <p className="text-body text-ink-secondary">Kemajuan tampil setelah sesi pertama Anda punya laporan.</p>
          <Link href="/practice" className={buttonVariants()}>
            Mulai latihan
          </Link>
        </div>
      ) : (
        <>
          <section className="flex flex-col gap-4 border-t border-ink-primary pt-6">
            <h2 className="text-h2">Skor latihan</h2>
            <p className="text-body text-ink-secondary">
              {history.change === null
                ? "Satu sesi lagi untuk melihat perubahan."
                : history.change >= 0
                  ? `Naik ${decimal(history.change)} poin sejak sesi pertama.`
                  : `Turun ${decimal(-history.change)} poin sejak sesi pertama. Satu sesi yang sulit itu wajar.`}
            </p>
            <ol className="flex flex-col gap-3">
              {points.map((point, i) => (
                <Bar key={point.session_id} label={`${i + 1}. ${DATE.format(new Date(point.at))}`} score={point.score} />
              ))}
            </ol>
          </section>

          <section className="flex flex-col gap-4 border-t border-border-default pt-6">
            <h2 className="text-h2">Rata-rata per aspek</h2>
            <ol className="flex flex-col gap-3">
              {rubric.dimensions
                .filter((d) => history.averages[d.id] !== undefined)
                .map((d) => (
                  <Bar key={d.id} label={d.label.id} score={history.averages[d.id]} />
                ))}
            </ol>
            <p className="text-body-sm text-ink-secondary">Senyum hanya umpan balik dan tidak dihitung dalam skor latihan.</p>
          </section>
        </>
      )}
    </div>
  );
}
