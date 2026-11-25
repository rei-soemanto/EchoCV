import Link from "next/link";

import { PlaceholderPage } from "@/components/placeholder-page";
import { TopBar } from "@/components/top-bar";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Halaman tidak ditemukan · EchoCV" };

export default function NotFound() {
  return (
    <>
      <TopBar note="Tidak ditemukan" />
      <main className="px-4 pt-8 pb-16 md:px-12 md:pt-12">
        <PlaceholderPage
          title="Halaman tidak ditemukan"
          description="Alamat ini salah, atau halamannya bukan milik akun Anda."
        >
          <Link href="/dashboard" className={buttonVariants({ className: "w-fit" })}>
            Ke beranda
          </Link>
        </PlaceholderPage>
      </main>
    </>
  );
}
