"use client";

import Image from "next/image";
import Link from "next/link";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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

// Figma 06 Kalibrasi: camera preview plus device checks, all on the device.
export function DeviceCheck() {
  const { videoRef, status, hasCamera, hasMic, level, lighting, online, retry, checkLighting } =
    useMediaCapture();
  const waiting = status === "requesting";
  const failed = !waiting && status !== "ready";
  const device = (ok: boolean): [BadgeTone, string] =>
    waiting ? ["neutral", "Menunggu izin"] : ok ? ["success", "Siap"] : ["danger", "Tidak tersedia"];
  const [camTone, camText] = device(hasCamera);
  const [micTone, micText] = device(hasMic);
  const lit = Math.round(level * BARS);

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
          <p className="text-body-sm text-ink-inverse opacity-80">
            {waiting ? "Izinkan akses kamera dan mikrofon di browser" : "Posisikan wajah dalam bingkai"}
          </p>
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
          <div role="status" className="flex gap-3 border-y border-border-default py-4">
            <Image src="/icons/alert-warning.svg" alt="" width={20} height={20} className="size-5 shrink-0" />
            <p className="text-[15px] leading-[23px]">
              <span className="block font-semibold">Ruangan agak gelap</span>
              Hadapkan wajah ke sumber cahaya agar analisis lebih akurat.
            </p>
          </div>
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

        <p className="text-body-sm text-ink-secondary">
          Mode Live: video Anda dianalisis di perangkat dan tidak dikirim ke server.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          {hasCamera && hasMic ? (
            <Link href="/practice/room" className={buttonVariants()}>
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
