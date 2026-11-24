"use client";

import Image from "next/image";
import Link from "next/link";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { useCalibration } from "@/hooks/use-calibration";
import { useMediaCapture } from "@/hooks/use-media-capture";
import { CAPTURE_ERROR_TEXT } from "@/lib/media";

const BARS = 24;

function Check({
  icon,
  label,
  tone,
  status,
}: {
  icon: string;
  label: string;
  tone: BadgeTone;
  status: string;
}) {
  return (
    <li className="flex items-center justify-between gap-4 border-b border-border-default py-3">
      <span className="text-body flex items-center gap-3">
        <Image src={`/icons/${icon}.svg`} alt="" width={20} height={20} />
        {label}
      </span>
      <Badge tone={tone}>{status}</Badge>
    </li>
  );
}

function Notice({
  role,
  title,
  children,
}: {
  role: "status" | "alert";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div role={role} className="flex gap-3 border-y border-border-default py-4">
      <Image src="/icons/alert-warning.svg" alt="" width={20} height={20} className="size-5 shrink-0" />
      <div className="flex flex-col items-start text-[15px] leading-[23px]">
        <span className="font-semibold">{title}</span>
        {children}
      </div>
    </div>
  );
}

// Figma 06 Kalibrasi: camera preview, device checks and the 5-second baseline, all on the device.
export function DeviceCheck({ sessionId }: { sessionId?: string }) {
  const { videoRef, status, hasCamera, hasMic, level, lighting, online, retry, checkLighting } =
    useMediaCapture();
  const waiting = status === "requesting";
  const failed = !waiting && status !== "ready";
  const device = (ok: boolean): [BadgeTone, string] =>
    waiting ? ["neutral", "Menunggu izin"] : ok ? ["success", "Siap"] : ["danger", "Tidak tersedia"];
  const [camTone, camText] = device(hasCamera);
  const [micTone, micText] = device(hasMic);
  const lit = Math.round(level * BARS);
  const calibration = useCalibration(videoRef);
  const running = calibration.phase === "running";
  const calibrated = calibration.phase === "done";

  return (
    <div className="flex flex-col gap-12 px-4 pt-8 pb-16 md:px-12 md:pt-12 lg:flex-row lg:gap-16">
      <div className="relative flex aspect-video min-w-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-surface-sidebar lg:aspect-auto lg:h-[480px]">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          aria-label="Pratinjau kamera"
          className={`absolute inset-0 size-full -scale-x-100 object-cover ${hasCamera ? "" : "hidden"}`}
        />
        <div className="relative flex flex-col items-center gap-4 px-6 text-center">
          <Image src="/face-guide.png" alt="" width={180} height={240} className="h-auto w-32 opacity-70 sm:w-[180px]" priority />
          {running ? (
            <p className="text-ink-inverse" aria-hidden="true">
              <span className="block font-display text-[56px] leading-[60px]">{calibration.secondsLeft}</span>
              <span className="text-body-sm opacity-80">
                {calibration.faceVisible ? "Tatap lensa kamera" : "Wajah belum terlihat"}
              </span>
            </p>
          ) : (
            <p className="text-body-sm text-ink-inverse opacity-80">
              {waiting ? "Izinkan akses kamera dan mikrofon di browser" : "Posisikan wajah dalam bingkai"}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:w-[400px] lg:shrink-0">
        <h1 className="text-h1">Periksa perangkat Anda</h1>
        <p className="text-body text-ink-secondary">
          Semua pemeriksaan ini hanya berlangsung di perangkat Anda.
        </p>

        {failed && (
          <div role="alert" className="flex flex-col items-start gap-2 border-y border-border-default py-4">
            <p className="text-[15px] leading-[23px] font-semibold text-ink-danger">
              Kamera atau mikrofon belum siap
            </p>
            <p className="text-[15px] leading-[23px]">{CAPTURE_ERROR_TEXT[status]}</p>
            <button type="button" onClick={retry} className={buttonVariants({ variant: "link", size: "text" })}>
              Coba lagi
            </button>
          </div>
        )}

        <ul>
          <Check icon="camera" label="Kamera" tone={camTone} status={camText} />
          <Check icon="mic" label="Mikrofon" tone={micTone} status={micText} />
          <Check
            icon="eye"
            label="Pencahayaan"
            tone={lighting === "ok" ? "success" : lighting === "dark" ? "warning" : "neutral"}
            status={lighting === "ok" ? "Cukup terang" : lighting === "dark" ? "Kurang terang" : "Belum diperiksa"}
          />
          <Check
            icon="check"
            label="Koneksi internet"
            tone={online ? "success" : "danger"}
            status={online ? "Terhubung" : "Terputus"}
          />
        </ul>

        <div className="flex flex-col gap-2">
          <p id="mic-test" className="text-label">
            Tes suara: ucapkan satu kalimat
          </p>
          <div
            role="meter"
            aria-labelledby="mic-test"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(level * 100)}
            className="flex gap-1"
          >
            {Array.from({ length: BARS }, (_, i) => (
              <span key={i} className={`h-5 w-2 ${i < lit ? "bg-success-fill" : "bg-border-strong"}`} />
            ))}
          </div>
        </div>

        {lighting === "dark" && (
          <Notice role="status" title="Ruangan agak gelap">
            Hadapkan wajah ke sumber cahaya agar analisis lebih akurat.
          </Notice>
        )}
        {hasCamera && (
          <button
            type="button"
            onClick={checkLighting}
            className={buttonVariants({ variant: "link", size: "text", className: "w-fit" })}
          >
            Periksa ulang pencahayaan
          </button>
        )}

        <section aria-labelledby="calibration-title" className="flex flex-col items-start gap-3">
          <div className="flex w-full items-center justify-between gap-4">
            <h2 id="calibration-title" className="text-label">
              Kalibrasi: tatap lensa kamera selama 5 detik
            </h2>
            {calibrated && <Badge tone="success">Selesai</Badge>}
          </div>
          <p className="text-body-sm text-ink-secondary">
            EchoCV mengukur posisi kepala dan arah pandang Anda saat menatap kamera, supaya kontak
            mata dinilai sesuai cara duduk Anda sendiri.
          </p>
          {(running || calibration.phase === "loading") && (
            <div className="flex w-full flex-col gap-2" aria-live="polite">
              <div
                role="progressbar"
                aria-label="Kemajuan kalibrasi"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(calibration.progress * 100)}
                className="h-2 w-full bg-surface-sunken"
              >
                <div className="h-full bg-surface-accent" style={{ width: `${calibration.progress * 100}%` }} />
              </div>
              <p className="text-caption text-ink-tertiary">
                {running ? `Tetap tatap lensa, ${calibration.secondsLeft} detik lagi` : "Menyiapkan analisis wajah…"}
              </p>
            </div>
          )}
          {calibration.phase === "failed" && (
            <Notice role="alert" title="Wajah tidak terlihat cukup lama">
              Pastikan seluruh wajah ada di dalam bingkai dan cukup terang, lalu ulangi kalibrasi.
            </Notice>
          )}
          {calibration.phase === "unsupported" && (
            <Notice role="alert" title="Analisis wajah tidak bisa berjalan di browser ini">
              Gunakan Chrome atau Edge versi terbaru, atau latihan dengan mengunggah rekaman.
              <Link href="/upload" className={buttonVariants({ variant: "link", size: "text" })}>
                Pakai mode Unggah
              </Link>
            </Notice>
          )}
          {calibration.delegate === "CPU" && (
            <p role="status" className="text-caption text-ink-tertiary">
              Analisis berjalan di CPU karena akselerasi grafis tidak tersedia. Hasilnya sama, hanya
              sedikit lebih lambat.
            </p>
          )}
          {!running && calibration.phase !== "loading" && (
            <button
              type="button"
              disabled={!hasCamera}
              onClick={calibration.start}
              className={buttonVariants({ variant: "outline" })}
            >
              {calibration.phase === "idle" ? "Mulai kalibrasi" : "Ulangi kalibrasi"}
            </button>
          )}
        </section>

        <p className="text-body-sm text-ink-secondary">
          Mode Live: video Anda dianalisis di perangkat dan tidak dikirim ke server.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          {hasCamera && hasMic && calibrated ? (
            <Link
              href={sessionId ? `/practice/room?session=${sessionId}` : "/practice"}
              className={buttonVariants()}
            >
              <Image src="/icons/arrow-right.svg" alt="" width={20} height={20} />
              Mulai wawancara
            </Link>
          ) : (
            <button type="button" disabled className={buttonVariants()}>
              <Image src="/icons/arrow-right.svg" alt="" width={20} height={20} />
              Mulai wawancara
            </button>
          )}
          <Link href="/practice" className={buttonVariants({ variant: "link", size: "text" })}>
            Kembali
          </Link>
        </div>
      </div>
    </div>
  );
}
