import explanations from "../../../../shared/questions/explanations.json";

export type ExplanationLang = "id" | "en";

export type SetupCopy = {
  label: string;
  description: string;
  best_for: string;
};

type LocalizedMap = Record<string, Record<ExplanationLang, SetupCopy>>;

const ROLES: LocalizedMap = explanations.roles;
const LEVELS: LocalizedMap = explanations.levels;
const QUESTION_SETS: LocalizedMap = explanations.question_sets;
const ROLE_SPECIFIC_SETS: LocalizedMap = explanations.role_specific_sets;

export function explanationLang(language: string | null | undefined): ExplanationLang {
  return language === "en" ? "en" : "id";
}

export function roleExplanation(role: string | null | undefined, lang: ExplanationLang = "id"): SetupCopy | null {
  if (!role || !Object.hasOwn(ROLES, role)) return null;
  return ROLES[role][lang];
}

export function levelExplanation(level: string | null | undefined, lang: ExplanationLang = "id"): SetupCopy | null {
  if (!level || !Object.hasOwn(LEVELS, level)) return null;
  return LEVELS[level][lang];
}

export function questionSetExplanation(
  questionSet: string | null | undefined,
  role: string | null | undefined,
  lang: ExplanationLang = "id",
): SetupCopy | null {
  if (!questionSet) return null;
  if (questionSet === "role_specific" && role && Object.hasOwn(ROLE_SPECIFIC_SETS, role)) {
    return ROLE_SPECIFIC_SETS[role][lang];
  }
  if (!Object.hasOwn(QUESTION_SETS, questionSet)) return null;
  return QUESTION_SETS[questionSet][lang];
}

export function quickStartExplanation(lang: ExplanationLang = "id"): SetupCopy {
  return explanations.quick_start[lang];
}
