"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const NAV = [
  { href: "/dashboard", label: "Beranda", icon: "nav-home" },
  { href: "/practice", label: "Latihan baru", icon: "nav-plus" },
  { href: "/history", label: "Riwayat sesi", icon: "nav-clock" },
  { href: "/progress", label: "Kemajuan", icon: "nav-chart" },
  { href: "/plans", label: "Paket", icon: "nav-card" },
  { href: "/privacy", label: "Privasi dan data", icon: "nav-shield" },
] as const;

// Figma "Sidebar" (04 Beranda). Active item: 2px left rule and a heavier label.
// Below md it becomes a top bar with a scrollable nav row.
export function AppSidebar() {
  const pathname = usePathname();
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
      {/* shortcut: placeholder account until Supabase Auth sign-in (KAN-38) supplies the user */}
      <div className="mt-auto hidden flex-col gap-1 border-t border-ink-inverse px-3 pt-4 md:flex">
        <p className="text-label">Akun tamu</p>
        <p className="text-caption opacity-75">Masuk untuk menyimpan riwayat</p>
      </div>
    </aside>
  );
}
