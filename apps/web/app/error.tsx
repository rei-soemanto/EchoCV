"use client";

import { useEffect } from "react";

import { PlaceholderPage } from "@/components/placeholder-page";
import { TopBar } from "@/components/top-bar";
import { buttonVariants } from "@/components/ui/button";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <>
      <TopBar note="Terjadi gangguan" />
      <main className="px-4 pt-8 pb-16 md:px-12 md:pt-12">
        <PlaceholderPage
          title="Halaman ini belum bisa dibuka"
          description="Ada gangguan di pihak kami atau di koneksi internet Anda. Coba lagi sebentar lagi."
        >
          <button type="button" onClick={() => retry()} className={buttonVariants({ className: "w-fit" })}>
            Coba lagi
          </button>
        </PlaceholderPage>
      </main>
    </>
  );
}
