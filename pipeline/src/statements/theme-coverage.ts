/**
 * Canonical themes of the test and coverage assessment (#24).
 *
 * The ~10 themes are a decision of the spec (#15, via #9): derived from
 * federal competences and validated against the Eurovoc descriptors of the
 * legislature's votes. The final selection must carry 35 statements, 3-4 per
 * theme (five themes at 4, five at 3).
 *
 * Pure module: the pool command uses it to constrain the LLM's proposed
 * themes, the select command uses it to flag coverage gaps.
 */

export interface StatementTheme {
  /** Stable id used in Statement.theme and in the pool YAML. Path-safe. */
  id: string;
  /** Display label (FR). */
  label_fr: string;
}

/** Spec #15 theme list — ids align with the existing fixture theme ids. */
export const CANONICAL_THEMES: readonly StatementTheme[] = [
  { id: 'fiscalite', label_fr: 'Fiscalité' },
  { id: 'emploi', label_fr: 'Emploi' },
  { id: 'pensions-secu', label_fr: 'Pensions & sécurité sociale' },
  { id: 'sante', label_fr: 'Santé' },
  { id: 'migration', label_fr: 'Migration' },
  { id: 'justice-securite', label_fr: 'Justice & sécurité' },
  { id: 'energie-climat', label_fr: 'Énergie & climat' },
  { id: 'mobilite', label_fr: 'Mobilité' },
  { id: 'ethique-societe', label_fr: 'Éthique & société' },
  { id: 'defense-europe', label_fr: 'Défense & Europe' },
];

/** Total statements in the final selection (spec #15). */
export const SELECTION_TOTAL = 35;

/** Per-theme statement count in the final selection (spec #15: 3-4). */
export const SELECTION_TARGET = { min: 3, max: 4 } as const;

export function isCanonicalTheme(themeId: string): boolean {
  return CANONICAL_THEMES.some((theme) => theme.id === themeId);
}

export type ThemeCoverageStatus = 'gap' | 'ok' | 'overflow';

export interface ThemeCoverage {
  theme: StatementTheme;
  count: number;
  status: ThemeCoverageStatus;
}

export interface CoverageTarget {
  min: number;
  /** Use Number.POSITIVE_INFINITY when overflow is meaningless (pool). */
  max: number;
}

/**
 * Counts statements per canonical theme and flags gaps/overflows against
 * the target. Every canonical theme appears in the result — a theme with
 * zero statements is a gap, not an absence. An unknown theme id in the
 * input is a hard error: themes are validated at parse time, so one
 * arriving here means schema drift.
 */
export function assessThemeCoverage(
  themeIds: readonly string[],
  target: CoverageTarget = SELECTION_TARGET,
): ThemeCoverage[] {
  const counts = new Map<string, number>(CANONICAL_THEMES.map((theme) => [theme.id, 0]));
  for (const themeId of themeIds) {
    const current = counts.get(themeId);
    if (current === undefined) {
      throw new Error(
        `Unknown theme '${themeId}' — themes must be one of: ${CANONICAL_THEMES.map((t) => t.id).join(', ')}.`,
      );
    }
    counts.set(themeId, current + 1);
  }
  return CANONICAL_THEMES.map((theme) => {
    const count = counts.get(theme.id) ?? 0;
    const status: ThemeCoverageStatus =
      count < target.min ? 'gap' : count > target.max ? 'overflow' : 'ok';
    return { theme, count, status };
  });
}
