import bank from "../../../../../shared/questions/bank.json";

import { SetupForm } from "./setup-form";

export default function PracticePage() {
  const { roles, levels, question_sets } = bank.enums;
  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-h1">Atur sesi latihan</h1>
      <SetupForm enums={{ roles, levels, question_sets }} />
    </div>
  );
}
