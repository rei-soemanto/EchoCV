"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "cn";

import { signOut } from "@/lib/auth";

const NAV = [
  { href: "/dashboard", label: "Beranda", icon: "nav-home" },
  { href: "/practice", label: "Latihan baru", icon: "nav-plus" },
  { href: "/history", label: "Riwayat sesi", icon: "nav-clock" },
  { href: "/progress", label: "Kemajuan", icon: "nav-chart" },
  { href: "/plans", label: "Paket", icon: "nav-card" },
  { href: "/privacy", label: "Privasi dan data", icon: "nav-shield" },
] as const;

export function AppSidebar({ fullName, email }: { fullName: string; email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signOutFailed, setSignOutFailed] = useState(false);

  async function leave() {
    if (!(await signOut())) {
      setSignOutFailed(true);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <aside className="flex shrink-0 flex-col gap-4 bg-surface-sidebar px-4 pt-6 pb-3 text-ink-inverse md:sticky md:top-0 md:h-screen md:w-60 md:gap-8 md:pt-8 md:pb-6">
      <Link href="/" className="text-h2 w-fit">
        EchoCV
      </Link>
      <nav aria-label="Navigasi utama">
        <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:px-0">
          {NAV.map(({ href, label, icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href} className="shrink-0">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 border-l-2 px-3 whitespace-nowrap transition-opacity",
                    active
                      ? "border-ink-inverse text-label"
                      : "text-body-sm border-transparent opacity-75 hover:opacity-100",
                  )}
                >
                  <Image src={`/icons/${icon}.svg`} alt="" width={24} height={24} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex items-center justify-between gap-4 border-t border-ink-inverse px-3 pt-3 md:mt-auto md:flex-col md:items-start md:gap-1 md:pt-4">
        <div className="flex min-w-0 flex-col gap-0.5 md:w-full">
          <p className="text-label truncate" title={fullName}>{fullName}</p>
          <p className="text-caption break-all opacity-85" title={email}>{email}</p>
        </div>
        <button type="button" onClick={leave} className="text-body-sm min-h-11 shrink-0 underline-offset-4 hover:underline">
          Keluar
        </button>
        {signOutFailed && (
          <p role="alert" className="text-caption">
            Belum bisa keluar. Coba lagi.
          </p>
        )}
      </div>
    </aside>
  );
}
