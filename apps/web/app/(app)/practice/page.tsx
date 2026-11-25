import bank from "../../../../../shared/questions/bank.json";

import { SetupForm } from "./setup-form";

export default async function PracticePage(props: PageProps<"/practice">) {
  const quick = (await props.searchParams).quick !== undefined;
  const { roles, levels, question_sets } = bank.enums;
  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-h1">{quick ? "Latihan cepat: perkenalkan diri" : "Atur sesi latihan"}</h1>
      <SetupForm quick={quick} enums={{ roles, levels, question_sets }} />
    </div>
  );
}
