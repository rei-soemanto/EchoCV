import Link from "next/link";
import { redirect } from "next/navigation";

import { afterSignIn } from "@/lib/auth";
import { safeNextPath } from "@/lib/supabase/proxy";
import { createClient } from "@/lib/supabase/server";

import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Masuk atau daftar · EchoCV" };

const TICKS = Array.from({ length: 17 }, (_, i) => i);

// Figma 02 Masuk.
export default async function SignInPage(props: PageProps<"/sign-in">) {
  const params = await props.searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect(afterSignIn(next));

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <div className="flex flex-col justify-between gap-8 bg-surface-sidebar px-4 py-8 text-ink-inverse md:px-12 lg:w-[560px] lg:shrink-0 lg:p-16">
        <Link href="/" className="text-h2 lg:text-display w-fit">
          EchoCV
        </Link>
        <div className="hidden flex-col gap-6 lg:flex">
          <p className="text-h2">Latihan wawancara kerja dengan umpan balik yang tenang.</p>
          <div className="relative h-10 w-full bg-surface-sunken" aria-hidden="true">
            {TICKS.map((i) => (
              <span
                key={i}
                className={`absolute bottom-0 w-px bg-ink-primary opacity-50 ${i % 2 ? "h-10" : "h-8"}`}
                style={{ left: (i + 1) * 24 }}
              />
            ))}
            <span className="absolute -top-2 left-[168px] h-14 w-0.5 bg-warning-fill" />
          </div>
        </div>
      </div>
      <main className="flex flex-1 justify-center px-4 py-12 lg:items-center">
        <SignInForm next={next} failed={params.auth_error !== undefined} />
      </main>
    </div>
  );
}
