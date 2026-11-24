import { redirect } from "next/navigation";

import { TopBar } from "@/components/top-bar";
import { SIGN_IN_PATH } from "@/lib/auth";
import { currentProfile } from "@/lib/db/current-profile";
import { safeNextPath } from "@/lib/supabase/proxy";

import { SignUpForm } from "./sign-up-form";

export const metadata = { title: "Daftar · EchoCV" };

// Reached after every sign-in: a user who already has a profile goes straight on to `next`.
export default async function SignUpPage(props: PageProps<"/sign-up">) {
  const params = await props.searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const account = await currentProfile();
  if (!account) redirect(SIGN_IN_PATH);
  if (account.fullName) redirect(next);

  return (
    <>
      <TopBar note={account.email} />
      <main className="flex flex-1 flex-col items-center px-4 pt-12 pb-20 md:px-12 md:pt-16">
        <SignUpForm next={next} />
      </main>
    </>
  );
}
