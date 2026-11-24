import Image from "next/image";
import Link from "next/link";

import { FeedbackMarker, PaceMeter, TimecodeTape } from "@/components/report-parts";
import { buttonVariants } from "@/components/ui/button";

const STEPS = [
  {
    n: "01",
    title: "Rekam jawaban",
    body: "Pilih peran dan bahasa, lalu jawab tiga pertanyaan lewat webcam. Atau unggah rekaman yang sudah Anda punya.",
  },
  {
    n: "02",
    title: "Baca laporan",
    body: "Lihat di detik ke berapa Anda terburu-buru, memakai kata pengisi atau mengalihkan pandangan, lengkap dengan satu saran.",
  },
  {
    n: "03",
    title: "Ulangi dan bandingkan",
    body: "Jawab pertanyaan yang sama sekali lagi, lalu lihat apa yang berubah antara percobaan pertama dan kedua.",
  },
];

const PLANS = [
  {
    name: "Gratis",
    price: "Rp 0",
    period: "per bulan",
    features: ["3 sesi latihan per bulan", "Laporan dengan stempel waktu", "Kuota kembali setiap tanggal 1"],
    cta: "Mulai gratis",
  },
  {
    name: "Sprint Pass",
    price: "Rp 15.000",
    period: "untuk 7 hari",
    features: ["Sesi latihan selama 7 hari", "Tidak diperpanjang otomatis", "Cocok sebelum hari wawancara"],
    cta: "Beli Sprint Pass",
  },
  {
    name: "Premium",
    price: "Rp 29.000",
    period: "per bulan",
    features: [
      "Laporan lengkap dan perbandingan percobaan",
      "Percobaan ulang dalam satu sesi tanpa kuota tambahan",
      "Perpanjangan otomatis hanya jika Anda setuju",
    ],
    cta: "Pilih Premium",
    featured: true,
  },
];

const section = "border-t border-border-default px-4 py-16 md:px-12 md:py-20";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-6 border-b border-border-default px-4 py-4 md:px-12 md:py-6">
        <Link href="/" className="text-h2">
          EchoCV
        </Link>
        <nav aria-label="Bagian halaman" className="text-body-sm hidden gap-10 text-ink-secondary md:flex">
          <a href="#cara-kerja" className="hover:text-ink-primary">Cara kerja</a>
          <a href="#paket" className="hover:text-ink-primary">Paket</a>
          <a href="#kampus" className="hover:text-ink-primary">Untuk kampus</a>
        </nav>
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className={buttonVariants({ variant: "link", size: "text" })}>
            Masuk
          </Link>
          <Link href="/practice" className={buttonVariants()}>
            Mulai latihan
          </Link>
        </div>
      </header>

      <main>
        <section className="flex flex-col gap-16 px-4 pt-14 pb-16 md:px-12 md:pt-20 lg:flex-row lg:gap-20">
          <div className="flex flex-col gap-6 lg:w-[600px] lg:shrink-0">
            <h1 className="text-display text-[40px] leading-[44px] md:text-[56px] md:leading-[60px]">
              Latihan wawancara kerja dengan umpan balik yang tenang.
            </h1>
            <p className="text-body-lg text-ink-secondary">
              Rekam satu jawaban. EchoCV menunjukkan di detik ke berapa Anda terburu-buru, memakai
              kata pengisi atau mengalihkan pandangan, lalu menyarankan satu hal untuk dicoba.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/practice" className={buttonVariants()}>
                <Image src="/icons/arrow-right.svg" alt="" width={20} height={20} />
                Mulai latihan gratis
              </Link>
              <a href="#contoh-laporan" className={buttonVariants({ variant: "outline" })}>
                Lihat contoh laporan
              </a>
            </div>
            <p className="text-caption flex items-center gap-2 text-ink-tertiary">
              <Image src="/icons/lock.svg" alt="" width={16} height={16} />
              Mode Live: video Anda dianalisis di perangkat dan tidak dikirim ke server.
            </p>
          </div>

          <figure
            id="contoh-laporan"
            className="flex min-w-0 flex-1 flex-col gap-6 border-t border-ink-primary pt-6"
          >
            <figcaption className="text-caption text-ink-tertiary">
              Contoh laporan: Frontend Developer, pertanyaan 1
            </figcaption>
            <PaceMeter wpm={142} min={90} max={200} targetLow={110} targetHigh={160} />
            <TimecodeTape
              issues={[0.18, 0.31, 0.62, 0.86]}
              playhead={0.42}
              scale={["0:00", "0:30", "1:00", "1:30", "2:00"]}
            />
            <div>
              <FeedbackMarker
                time="0:42 sampai 0:58"
                title="6 kata pengisi"
                tip="Coba jeda sebentar sebelum kalimat berikutnya."
              />
              <FeedbackMarker
                time="1:10 sampai 1:25"
                title="Pandangan sering keluar layar"
                tip="Tatap kamera saat menyebut pencapaian utama."
              />
            </div>
          </figure>
        </section>

        <section id="cara-kerja" className={`${section} flex flex-col gap-10`}>
          <h2 className="text-h2">Cara kerja</h2>
          <ol className="grid gap-12 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="flex flex-col gap-3 border-t border-ink-primary pt-4">
                <span className="font-display text-[40px] leading-[44px] font-medium">{s.n}</span>
                <h3 className="text-h3">{s.title}</h3>
                <p className="text-body text-ink-secondary">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="paket" className={`${section} flex flex-col gap-10`}>
          <div className="flex flex-col gap-2">
            <h2 className="text-h2">Paket</h2>
            <p className="text-body text-ink-secondary">
              Mulai gratis. Beli paket hanya saat Anda memang punya wawancara dalam waktu dekat.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {PLANS.map((p) => (
              <div key={p.name} className="flex flex-col gap-4">
                <div
                  className={`flex flex-1 flex-col gap-3 border-t py-6 ${p.featured ? "border-surface-accent bg-surface-accent-subtle px-4" : "border-ink-primary"}`}
                >
                  <h3 className="text-label text-ink-secondary">{p.name}</h3>
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-display text-[44px] leading-[48px]">{p.price}</span>
                    <span className="text-body-sm text-ink-secondary">{p.period}</span>
                  </p>
                  <ul className="text-body-sm flex flex-col gap-1 text-ink-secondary">
                    {p.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
                <Link
                  href="/plans"
                  className={buttonVariants({ variant: p.featured ? "default" : "outline", className: "w-full" })}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
          <p id="kampus" className="text-body-sm flex flex-wrap items-center gap-2 text-ink-secondary">
            Untuk kampus dan institusi: Rp 50.000 per mahasiswa per tahun.
            {/* shortcut: no team contact address yet; link it once there is one */}
            <span className={buttonVariants({ variant: "link", size: "text" })}>Hubungi kami</span>
          </p>
        </section>
      </main>

      <footer className="flex flex-col justify-between gap-6 border-t border-border-default px-4 py-8 md:flex-row md:px-12">
        <div className="flex max-w-[640px] flex-col gap-2">
          <p className="text-h2">EchoCV</p>
          <p className="text-caption text-ink-tertiary">
            Skor adalah latihan berbasis AI, bukan prediksi hasil wawancara kerja. EchoCV tidak
            menilai penampilan, pakaian atau atribut yang dilindungi.
          </p>
        </div>
        <nav aria-label="Tautan kaki" className="text-body-sm flex flex-wrap gap-8 text-ink-secondary">
          <Link href="/privacy" className="hover:text-ink-primary">Privasi dan data</Link>
          <span>Syarat penggunaan</span>
          <span>Hubungi kami</span>
        </nav>
      </footer>
    </div>
  );
}
