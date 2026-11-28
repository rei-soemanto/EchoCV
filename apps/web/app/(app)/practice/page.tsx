import bank from "../../../../../shared/questions/bank.json";

import { quickStartExplanation } from "@/lib/practice/setup";
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
  const quickCopy = quick ? quickStartExplanation("id") : null;
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1">{quickCopy ? quickCopy.label : "Atur sesi latihan"}</h1>
        {quickCopy && (
          <>
            <p className="text-body max-w-2xl text-ink-secondary">{quickCopy.description}</p>
            <p className="text-body-sm max-w-2xl text-ink-secondary">Cocok untuk: {quickCopy.best_for}</p>
          </>
        )}
      </header>
      <SetupForm
        quick={quick}
        language={profile?.preferred_language === "en" ? "en" : "id"}
        enums={{ roles, levels, question_sets }}
      />
    </div>
  );
}
