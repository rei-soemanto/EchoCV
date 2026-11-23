import session from "@echocv/shared/session.json";
import bank from "../../../../shared/questions/bank.json";

export type Language = "id" | "en";

export type SessionRequest = {
  job_field: string;
  role: string;
  level: string;
  language: Language;
  question_set: string;
  mode: "live" | "upload";
};

export type PickedQuestion = { question_id: string; question_text: string };

export const QUESTIONS_PER_SESSION = session.questionsPerSession;
export const QUICK_START_QUESTIONS = session.quickStartQuestions;
const MODES = ["live", "upload"];

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function oneOf(body: Record<string, unknown>, field: string, allowed: readonly string[]): string | null {
  const value = body[field];
  return typeof value === "string" && allowed.includes(value) ? value : null;
}

export function parseSessionRequest(body: unknown): Result<SessionRequest & { quick_start: boolean }> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Send a JSON object." };
  }
  const input = body as Record<string, unknown>;
  const quickStart = input.quick_start === true;
  const fields: [string, readonly string[]][] = [
    ["job_field", bank.enums.job_fields],
    ["role", bank.enums.roles],
    ["level", bank.enums.levels],
    ["language", bank.enums.languages],
    ["mode", MODES],
  ];
  if (!quickStart) fields.push(["question_set", bank.enums.question_sets]);

  const values: Record<string, string> = {};
  for (const [field, allowed] of fields) {
    const value = oneOf(input, field, allowed);
    if (value === null) return { ok: false, error: `${field} must be one of: ${allowed.join(", ")}.` };
    values[field] = value;
  }
  const quickQuestion = bank.questions.find((question) => question.tags.includes("quick_start"));
  if (quickStart && !quickQuestion) return { ok: false, error: "Quick start is not available." };

  return {
    ok: true,
    value: {
      job_field: values.job_field,
      role: values.role,
      level: values.level,
      language: values.language as Language,
      question_set: quickStart ? quickQuestion!.question_set : values.question_set,
      mode: values.mode as "live" | "upload",
      quick_start: quickStart,
    },
  };
}

export function pickQuestions(
  request: SessionRequest & { quick_start: boolean },
  random: () => number = Math.random,
): PickedQuestion[] {
  const matches = request.quick_start
    ? bank.questions.filter((question) => question.tags.includes("quick_start"))
    : bank.questions.filter(
        (question) =>
          question.job_field === request.job_field &&
          question.question_set === request.question_set &&
          question.levels.includes(request.level) &&
          (question.roles.includes("all") || question.roles.includes(request.role)),
      );
  const shuffled = [...matches];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled
    .slice(0, request.quick_start ? QUICK_START_QUESTIONS : QUESTIONS_PER_SESSION)
    .map((question) => ({ question_id: question.id, question_text: question.text[request.language] }));
}

export function parseSessionUpdate(body: unknown): Result<"finished" | "cancelled"> {
  const status = typeof body === "object" && body !== null ? (body as Record<string, unknown>).status : undefined;
  return status === "finished" || status === "cancelled"
    ? { ok: true, value: status }
    : { ok: false, error: "status must be one of: finished, cancelled." };
}
