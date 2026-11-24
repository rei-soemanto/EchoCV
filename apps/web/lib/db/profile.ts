import bank from "../../../../shared/questions/bank.json";
import { ageOn, MINIMUM_AGE } from "@/lib/age";
import type { Language } from "@/lib/db/sessions";

export const STATUSES = ["student", "fresh_graduate", "employed", "looking_for_work"] as const;

export type ProfileRequest = {
  profile: {
    full_name: string;
    date_of_birth: string;
    status: (typeof STATUSES)[number];
    job_field: string;
    preferred_language: Language;
  };
  consents: { analysis: true; model_training: boolean; hr_rater_sharing: boolean };
};

export type ProfileError = { ok: false; error: string; code: "invalid" | "consent_required" | "under_age" };

function isRealDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function parseProfileRequest(
  body: unknown,
  today: Date = new Date(),
): { ok: true; value: ProfileRequest } | ProfileError {
  const invalid = (error: string): ProfileError => ({ ok: false, error, code: "invalid" });
  if (typeof body !== "object" || body === null || Array.isArray(body)) return invalid("Send a JSON object.");
  const input = body as Record<string, unknown>;
  const consents = (typeof input.consents === "object" && input.consents !== null ? input.consents : {}) as Record<
    string,
    unknown
  >;

  const fullName = typeof input.full_name === "string" ? input.full_name.trim() : "";
  if (fullName.length < 1 || fullName.length > 100) return invalid("full_name must be 1 to 100 characters.");
  if (!isRealDate(input.date_of_birth) || input.date_of_birth > today.toISOString().slice(0, 10)) {
    return invalid("date_of_birth must be a past date in YYYY-MM-DD form.");
  }
  if (!STATUSES.includes(input.status as (typeof STATUSES)[number])) {
    return invalid(`status must be one of: ${STATUSES.join(", ")}.`);
  }
  if (!bank.enums.job_fields.includes(input.job_field as string)) {
    return invalid(`job_field must be one of: ${bank.enums.job_fields.join(", ")}.`);
  }
  if (!bank.enums.languages.includes(input.preferred_language as string)) {
    return invalid(`preferred_language must be one of: ${bank.enums.languages.join(", ")}.`);
  }
  for (const key of ["model_training", "hr_rater_sharing"]) {
    if (consents[key] !== undefined && typeof consents[key] !== "boolean") return invalid(`consents.${key} must be true or false.`);
  }
  if (consents.analysis !== true) {
    return {
      ok: false,
      code: "consent_required",
      error: "Recording-based analysis cannot run without the analysis consent, so the account was not created.",
    };
  }
  if (ageOn(input.date_of_birth, today) < MINIMUM_AGE) {
    return {
      ok: false,
      code: "under_age",
      error: "Users under 18 can join only through their school's EchoCV license.",
    };
  }

  return {
    ok: true,
    value: {
      profile: {
        full_name: fullName,
        date_of_birth: input.date_of_birth,
        status: input.status as (typeof STATUSES)[number],
        job_field: input.job_field as string,
        preferred_language: input.preferred_language as Language,
      },
      consents: {
        analysis: true,
        model_training: consents.model_training === true,
        hr_rater_sharing: consents.hr_rater_sharing === true,
      },
    },
  };
}
