// Apart from lib/db/profile.ts so client pages do not bundle the question bank with it.
export const MINIMUM_AGE = 18;

export function ageOn(dateOfBirth: string, today: Date): number {
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  const age = today.getUTCFullYear() - year;
  const beforeBirthday =
    today.getUTCMonth() + 1 < month || (today.getUTCMonth() + 1 === month && today.getUTCDate() < day);
  return beforeBirthday ? age - 1 : age;
}
