/**
 * Project wording rules as code, so the unit tests and the documentation
 * lint agree on one definition (ADOPTION_PLAN.md §7).
 *
 * HADES is described everywhere as a "penetrator with a nuclear warhead" /
 * "HADES penetrators". The brief forbids one family of phrasings that would
 * describe the round as an ordinary mass-accelerator slug carrying a bomb; the
 * regex below catches that family in every spelling the plan lists (the
 * "-tipped", "accelerator", "kinetic", "slugs" and "shells" variants), without
 * this source file ever spelling the phrase out. `tests/lint.test.ts` holds
 * the positive examples.
 */
export const FORBIDDEN_WORDING = /nuclear(?:[\s-]+(?:tipped|mass|accelerator|kinetic))*[\s-]+(?:rounds?|slugs?|shells?)/i;

/** True when `text` contains the forbidden HADES wording in any of its spellings. */
export const forbiddenWording = (text: string): boolean => FORBIDDEN_WORDING.test(text);

/** True when a HADES description names both the penetrator and the warhead. */
export const hadesWordingOk = (text: string): boolean => /penetrator/i.test(text) && /warhead/i.test(text);
