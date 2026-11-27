import Link from "next/link";

import { SessionTable } from "@/components/session-table";
import { buttonVariants } from "@/components/ui/button";
import { loadHistory } from "@/lib/db/history";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Riwayat sesi · EchoCV" };

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const history = auth.user ? await loadHistory(supabase, auth.user.id, 100) : null;
  if (!history) throw new Error("Could not load the practice history.");

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1">Riwayat sesi</h1>
        <p className="text-body text-ink-secondary">Semua sesi latihan Anda, yang terbaru di atas.</p>
      </header>
      {history.sessions.length ? (
        <SessionTable sessions={history.sessions} />
      ) : (
        <div className="flex flex-col items-start gap-4">
          <p className="text-body text-ink-secondary">Belum ada sesi latihan.</p>
          <Link href="/practice" className={buttonVariants()}>
            Mulai latihan pertama
          </Link>
        </div>
      )}
    </div>
  );
}
