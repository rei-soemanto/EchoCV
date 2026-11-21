import Image from "next/image";
import Link from "next/link";

import { PlaceholderPage } from "@/components/placeholder-page";
import { buttonVariants } from "@/components/ui/button";

export default function PracticePage() {
  return (
    <PlaceholderPage
      title="Atur sesi latihan"
      description="Pilih peran, tingkat pengalaman, set pertanyaan dan bahasa. Sebelum mulai, periksa kamera dan mikrofon Anda."
    >
      <Link href="/practice/check" className={buttonVariants({ className: "w-fit" })}>
        <Image src="/icons/arrow-right.svg" alt="" width={20} height={20} />
        Lanjut ke kalibrasi
      </Link>
    </PlaceholderPage>
  );
}
