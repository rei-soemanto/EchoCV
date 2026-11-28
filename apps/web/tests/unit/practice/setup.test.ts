import { describe, expect, it } from "vitest";

import explanations from "../../../../../shared/questions/explanations.json";
import {
  explanationLang,
  levelExplanation,
  questionSetExplanation,
  quickStartExplanation,
  roleExplanation,
} from "@/lib/practice/setup";

const ROLES = explanations.confirmed_roles;
const LEVELS = ["internship", "fresh_graduate", "junior", "mid_level"] as const;

describe("explanationLang", () => {
  it("returns en only for en and defaults everything else to id", () => {
    expect(explanationLang("en")).toBe("en");
    expect(explanationLang("id")).toBe("id");
    expect(explanationLang(null)).toBe("id");
    expect(explanationLang(undefined)).toBe("id");
    expect(explanationLang("fr")).toBe("id");
  });
});

describe("roleExplanation", () => {
  it.each(ROLES)("returns id and en copy for %s", (role) => {
    expect(roleExplanation(role, "id")).toEqual(explanations.roles[role as keyof typeof explanations.roles].id);
    expect(roleExplanation(role, "en")).toEqual(explanations.roles[role as keyof typeof explanations.roles].en);
  });

  it("returns null for unknown or empty roles", () => {
    expect(roleExplanation(null)).toBeNull();
    expect(roleExplanation(undefined)).toBeNull();
    expect(roleExplanation("Unknown role")).toBeNull();
    expect(roleExplanation("toString")).toBeNull();
  });
});

describe("levelExplanation", () => {
  it.each(LEVELS)("returns id and en copy for %s", (level) => {
    expect(levelExplanation(level, "id")).toEqual(explanations.levels[level].id);
    expect(levelExplanation(level, "en")).toEqual(explanations.levels[level].en);
  });

  it("returns null for unknown or empty levels", () => {
    expect(levelExplanation(null)).toBeNull();
    expect(levelExplanation(undefined)).toBeNull();
    expect(levelExplanation("senior")).toBeNull();
  });
});

describe("questionSetExplanation", () => {
  it("returns general and behavioral copy in id and en", () => {
    expect(questionSetExplanation("general", undefined, "id")).toEqual(explanations.question_sets.general.id);
    expect(questionSetExplanation("general", "Backend developer", "en")).toEqual(explanations.question_sets.general.en);
    expect(questionSetExplanation("behavioral", "QA engineer", "id")).toEqual(explanations.question_sets.behavioral.id);
    expect(questionSetExplanation("behavioral", null, "en")).toEqual(explanations.question_sets.behavioral.en);
  });

  it("falls back to generic role_specific copy when role is missing or unknown", () => {
    expect(questionSetExplanation("role_specific", undefined, "id")).toEqual(explanations.question_sets.role_specific.id);
    expect(questionSetExplanation("role_specific", null, "en")).toEqual(explanations.question_sets.role_specific.en);
    expect(questionSetExplanation("role_specific", "Unknown role", "id")).toEqual(
      explanations.question_sets.role_specific.id,
    );
  });

  it.each(ROLES)("returns per-role technical track copy for %s", (role) => {
    const key = role as keyof typeof explanations.role_specific_sets;
    expect(questionSetExplanation("role_specific", role, "id")).toEqual(explanations.role_specific_sets[key].id);
    expect(questionSetExplanation("role_specific", role, "en")).toEqual(explanations.role_specific_sets[key].en);
  });

  it("returns null for unknown or empty question sets", () => {
    expect(questionSetExplanation(null, "Backend developer")).toBeNull();
    expect(questionSetExplanation(undefined, "Backend developer")).toBeNull();
    expect(questionSetExplanation("custom", "Backend developer")).toBeNull();
  });
});

describe("quickStartExplanation", () => {
  it("returns id and en quick start copy", () => {
    expect(quickStartExplanation("id")).toEqual(explanations.quick_start.id);
    expect(quickStartExplanation("en")).toEqual(explanations.quick_start.en);
  });
});
