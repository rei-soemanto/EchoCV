import { requireProfile } from "@/lib/db/current-profile";

export default async function FocusLayout({ children }: LayoutProps<"/">) {
  await requireProfile();
  return children;
}
