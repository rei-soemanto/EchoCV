"use client";

import rubric from "@echocv/shared/rubric.json";
import thresholds from "@echocv/shared/thresholds.json";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { FeedbackMarker, PaceMeter, TimecodeTape } from "@/components/report-parts";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  decimal,
  feedbackFor,
  loadReport,
  sessionStats,
  timecode,
  transcriptLines,
  type LoadResult,
  type ReportView,
} from "@/lib/report/view";

// Figma 09 Laporan.
const LABELS: Record<string, string> = Object.fromEntries(rubric.dimensions.map((d) => [d.id, d.label.id]));

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 border-t border-ink-primary pt-4">
      <p className="text-body-sm text-ink-secondary">{label}</p>
      <p className="flex items-baseline gap-2">
        <span className="text-number">{value}</span>
        <span className="text-body-sm text-ink-secondary">{unit}</span>
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-border-default pt-6">
      <h2 className="text-h2">{title}</h2>
      {children}
    </section>
  );
}

function Answer({ report, answer }: { report: ReportView; answer: ReportView["answers"][number] }) {
  const n = answer.answerIndex + 1;
  if (answer.status !== "analyzed" || !answer.speechMetrics) {
    return (
      <div className="flex flex-col gap-2 border-t border-border-default pt-4">
        <h3 className="text-h3">Pertanyaan {n}</h3>
        <p className="text-body">{answer.question}</p>
        <Badge tone="neutral" className="w-fit">
          {answer.status === "skipped" ? "Dilewati" : "Tidak dianalisis"}
        </Badge>
      </div>
    );
  }

  const speech = answer.speechMetrics;
  const duration = Math.max(speech.durationMs, 1);
  const notes = feedbackFor(report, answer.answerIndex);
  const timed = notes.filter((f) => f.atMs !== undefined);
  const content = answer.scores?.content_feedback;

  return (
    <div className="flex flex-col gap-4 border-t border-border-default pt-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-h3">Pertanyaan {n}</h3>
        <p className="text-body text-ink-secondary">{answer.question}</p>
      </div>
      <TimecodeTape
        issues={timed.map((f) => Math.min(f.atMs! / duration, 1))}
        scale={[0, 0.25, 0.5, 0.75, 1].map((x) => timecode(x * duration))}
      />
      {notes.filter((f) => f.dimension !== "content").length > 0 ? (
        <div className="grid gap-x-10 md:grid-cols-2 xl:grid-cols-3">
          {notes
            .filter((f) => f.dimension !== "content")
            .map((f, i) => (
              <FeedbackMarker
                key={i}
                time={f.atMs === undefined ? "Sepanjang jawaban" : timecode(f.atMs)}
                title={LABELS[f.dimension] ?? f.dimension}
                tip={f.message}
              />
            ))}
        </div>
      ) : (
        <p className="text-body-sm text-ink-secondary">Tidak ada catatan penyampaian untuk jawaban ini.</p>
      )}
      <div className="flex flex-col gap-3">
        <h4 className="text-label">Transkrip</h4>
        {transcriptLines(speech).map((line, i) => (
          <p key={i} className="flex gap-6">
            <span className="shrink-0 font-mono text-[13px] leading-[26px] text-ink-tertiary">{timecode(line.atMs)}</span>
            <span className="text-body">
              {line.parts.map((part, j) =>
                part.filler ? (
                  <mark key={j} className="bg-transparent font-semibold text-ink-warning underline">
                    {part.text}{" "}
                  </mark>
                ) : (
                  <span key={j}>{part.text} </span>
                ),
              )}
            </span>
          </p>
        ))}
      </div>
      {content && (
        <div className="grid gap-x-10 gap-y-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Badge tone="success" className="w-fit">
              Sudah baik
            </Badge>
            <p className="text-body-sm text-ink-secondary">{content.strength}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Badge tone="warning" className="w-fit">
              Bisa ditingkatkan
            </Badge>
            <p className="text-body-sm text-ink-secondary">{content.improvement}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function SessionReport({ sessionId, title, subtitle }: { sessionId: string; title: string; subtitle: string }) {
  const [result, setResult] = useState<LoadResult | null>(null);
  const [attempt, setAttempt] = useState({ rebuild: false });
  useEffect(() => {
    let live = true;
    loadReport(sessionId, attempt.rebuild).then((r) => live && setResult(r));
    return () => {
      live = false;
    };
  }, [sessionId, attempt]);
  const load = (rebuild: boolean) => {
    setResult(null);
    setAttempt({ rebuild });
  };

  const header = (
    <header className="flex flex-wrap items-start justify-between gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">{title}</h1>
        <p className="text-body text-ink-secondary">{subtitle}</p>
      </div>
      <Link href="/practice" className={buttonVariants()}>
        <Image src="/icons/arrow-right.svg" alt="" width={20} height={20} />
        Latihan lagi
      </Link>
    </header>
  );

  if (!result) {
    return (
      <div className="flex flex-col gap-10">
        {header}
        <p role="status" className="text-body text-ink-secondary">
          Menyusun laporan. Ini bisa memakan waktu hingga satu menit.
        </p>
      </div>
    );
  }
  if (!result.ok) {
    return (
      <div className="flex flex-col gap-10">
        {header}
        <div role="alert" className="flex flex-col gap-4">
          <p className="text-body">{result.message}</p>
          {(result.status === null || result.status >= 500) && (
            <button type="button" onClick={() => load(attempt.rebuild)} className={buttonVariants({ variant: "outline", className: "w-fit" })}>
              Coba lagi
            </button>
          )}
        </div>
      </div>
    );
  }

  const report = result.report;
  const stats = sessionStats(report.answers);
  const content = report.dimensionScores.find((d) => d.id === "content");
  const language = report.answers.find((a) => a.speechMetrics)?.speechMetrics?.language ?? "id";
  const wpmBand = thresholds.pace[language].wordsPerMinute;
  const low = Math.round(wpmBand.low);
  const high = Math.round(wpmBand.high);

  return (
    <div className="flex flex-col gap-10">
      {header}

      <div className="flex flex-col gap-6">
        <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Skor latihan" value={String(report.overallScore)} unit="dari 100" />
          <Stat
            label="Kata pengisi per menit"
            value={stats.fillersPerMinute === null ? "–" : decimal(stats.fillersPerMinute)}
            unit="target di bawah 3"
          />
          <Stat label="Jeda panjang" value={String(stats.longPauses)} unit="lebih dari 2 detik" />
          <Stat label="Isi jawaban" value={content ? String(content.score) : "–"} unit="dari 100" />
        </div>
        {report.contentStatus === "pending" && (
          <div className="flex flex-wrap items-center gap-4">
            <Badge tone="warning" className="shrink whitespace-normal">
              Ada isi jawaban yang belum dinilai
            </Badge>
            <button type="button" onClick={() => load(true)} className={buttonVariants({ variant: "outline" })}>
              Nilai ulang isi jawaban
            </button>
          </div>
        )}
        <p className="text-body-sm text-ink-secondary">
          Skor ini adalah latihan berbasis AI, bukan prediksi hasil wawancara kerja.
        </p>
      </div>

      <section className="flex flex-col gap-4 border-t border-ink-primary pt-6">
        <h2 className="text-h2">Tempo bicara dan penanda waktu</h2>
        {stats.wordsPerMinute !== null && (
          <PaceMeter
            wpm={stats.wordsPerMinute}
            min={Math.min(90, stats.wordsPerMinute)}
            max={Math.max(200, stats.wordsPerMinute)}
            targetLow={low}
            targetHigh={high}
          />
        )}
        {report.answers.map((answer) => (
          <Answer key={answer.answerIndex} report={report} answer={answer} />
        ))}
      </section>

      <Section title="Skor per aspek">
        <dl className="grid gap-x-10 gap-y-3 sm:grid-cols-2">
          {report.dimensionScores.map((d) => (
            <div key={d.id} className="text-body-sm flex justify-between gap-4 border-b border-border-default pb-3">
              <dt className="text-ink-secondary">{LABELS[d.id] ?? d.id}</dt>
              <dd className="font-mono">{d.score}</dd>
            </div>
          ))}
        </dl>
        <p className="text-caption text-ink-tertiary">Senyum hanya umpan balik dan tidak dihitung dalam skor latihan.</p>
      </Section>
    </div>
  );
}
