// The plans from docs/pm/mvp-acceptance-criteria.md (UC-12), shown on the landing and plans pages.
export type Plan = {
  id: "free" | "sprint" | "premium" | "yearly";
  name: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  featured?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Gratis",
    price: "Rp 0",
    period: "per bulan",
    features: ["3 sesi latihan per bulan", "Laporan dengan stempel waktu", "Kuota kembali setiap tanggal 1"],
    cta: "Mulai gratis",
  },
  {
    id: "sprint",
    name: "Sprint Pass",
    price: "Rp 15.000",
    period: "untuk 7 hari",
    features: ["Sesi latihan selama 7 hari", "Tidak diperpanjang otomatis", "Cocok sebelum hari wawancara"],
    cta: "Beli Sprint Pass",
  },
  {
    id: "premium",
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
  {
    id: "yearly",
    name: "Tahunan",
    price: "Rp 299.000",
    period: "per tahun",
    features: ["Semua fitur Premium selama setahun", "Hemat sekitar 14% dibanding bulanan", "Perpanjangan otomatis hanya jika Anda setuju"],
    cta: "Pilih Tahunan",
  },
];

export const INSTITUTION_NOTE = "Untuk kampus dan institusi: Rp 50.000 per mahasiswa per tahun.";
