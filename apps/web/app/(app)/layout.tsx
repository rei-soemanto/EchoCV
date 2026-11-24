import { AppSidebar } from "@/components/app-sidebar";
import { requireProfile } from "@/lib/db/current-profile";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const account = await requireProfile();
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <AppSidebar {...account} />
      <main className="flex min-w-0 flex-1 flex-col px-4 pt-8 pb-16 md:px-12 md:pt-12">
        {children}
      </main>
    </div>
  );
}
