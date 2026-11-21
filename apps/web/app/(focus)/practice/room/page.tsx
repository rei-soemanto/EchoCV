import { PlaceholderPage } from "@/components/placeholder-page";
import { TopBar } from "@/components/top-bar";

export default function InterviewRoomPage() {
  return (
    <>
      <TopBar note="Ruang wawancara" />
      <main className="px-4 pt-8 pb-16 md:px-12 md:pt-12">
        <PlaceholderPage
          title="Ruang wawancara"
          description="Pertanyaan, perekaman dan umpan balik langsung selama sesi."
        />
      </main>
    </>
  );
}
