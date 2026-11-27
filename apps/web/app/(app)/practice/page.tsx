import bank from "../../../../../shared/questions/bank.json";

import { createClient } from "@/lib/supabase/server";

import { SetupForm } from "./setup-form";

export default async function PracticePage(props: PageProps<"/practice">) {
  const quick = (await props.searchParams).quick !== undefined;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("preferred_language")
    .eq("id", auth.user?.id ?? "")
    .maybeSingle();
  const { roles, levels, question_sets } = bank.enums;
  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-h1">{quick ? "Latihan cepat: perkenalkan diri" : "Atur sesi latihan"}</h1>
      <SetupForm quick={quick} language={profile?.preferred_language === "en" ? "en" : "id"} enums={{ roles, levels, question_sets }} />
    </div>
  );
}
