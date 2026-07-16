/**
 * Wizard state — pure logic for the one-question-at-a-time test (ticket #18).
 *
 * All functions are pure and return new state objects; nothing here touches
 * the DOM or localStorage. Persistence crosses this module's boundary as
 * plain strings (`serializeAnswers` / `parseStoredAnswers`), so the island
 * owns the (single) localStorage call site and answers never travel further
 * than the browser (#6).
 *
 * Index model: `currentIndex` ranges over 0..N-1 for questions and equals N
 * for the results view, so previous/next navigation covers the whole journey
 * including stepping back from the results into the last question.
 */
import type { UserAnswer, UserAnswers } from '@voting-helper/data';

/** Namespaced, versioned localStorage key for the saved answers (#6). */
export const ANSWERS_STORAGE_KEY = 'voting-helper:answers:v1';

export interface WizardState {
  readonly statementIds: readonly string[];
  /** 0..N-1 = question index; N = results view. */
  readonly currentIndex: number;
  readonly answers: UserAnswers;
}

const SCALE: readonly number[] = [-2, -1, 0, 1, 2];

function isUserAnswer(value: unknown): value is UserAnswer {
  return value === 'sans_opinion' || (typeof value === 'number' && SCALE.includes(value));
}

function firstUnansweredIndex(statementIds: readonly string[], answers: UserAnswers): number {
  const index = statementIds.findIndex((id) => !Object.hasOwn(answers, id));
  return index === -1 ? statementIds.length : index;
}

/**
 * Create the wizard, resuming on the first unanswered question.
 * Saved answers for unknown statement ids are dropped; when every question
 * is already answered the wizard opens directly on the results view.
 */
export function createWizard(
  statementIds: readonly string[],
  savedAnswers: UserAnswers = {},
): WizardState {
  const answers: Record<string, UserAnswer> = {};
  for (const id of statementIds) {
    if (Object.hasOwn(savedAnswers, id)) {
      const value = savedAnswers[id];
      if (value !== undefined) answers[id] = value;
    }
  }
  return { statementIds, currentIndex: firstUnansweredIndex(statementIds, answers), answers };
}

/** True when the wizard is showing the results view. */
export function isOnResults(state: WizardState): boolean {
  return state.currentIndex >= state.statementIds.length;
}

/** Statement id of the current question, or null on the results view. */
export function currentStatementId(state: WizardState): string | null {
  return state.statementIds[state.currentIndex] ?? null;
}

/** Answer of the current question, or undefined when unanswered / on results. */
export function currentAnswer(state: WizardState): UserAnswer | undefined {
  const id = currentStatementId(state);
  return id !== null && Object.hasOwn(state.answers, id) ? state.answers[id] : undefined;
}

/** Number of answered questions (« sans opinion » counts as answered). */
export function answeredCount(state: WizardState): number {
  return state.statementIds.filter((id) => Object.hasOwn(state.answers, id)).length;
}

/** Record (or replace) the answer of the current question. No auto-advance. */
export function setAnswer(state: WizardState, answer: UserAnswer): WizardState {
  const id = currentStatementId(state);
  if (id === null) return state;
  return { ...state, answers: { ...state.answers, [id]: answer } };
}

/** Next is allowed only once the current question is answered. */
export function canGoNext(state: WizardState): boolean {
  return !isOnResults(state) && currentAnswer(state) !== undefined;
}

export function goNext(state: WizardState): WizardState {
  return canGoNext(state) ? { ...state, currentIndex: state.currentIndex + 1 } : state;
}

export function canGoPrevious(state: WizardState): boolean {
  return state.currentIndex > 0;
}

/** Previous also steps back from the results view into the last question. */
export function goPrevious(state: WizardState): WizardState {
  return canGoPrevious(state) ? { ...state, currentIndex: state.currentIndex - 1 } : state;
}

/** Serialize answers for storage. Inverse of `parseStoredAnswers`. */
export function serializeAnswers(answers: UserAnswers): string {
  return JSON.stringify(answers);
}

/**
 * Parse a stored answers payload, tolerantly: corrupted JSON, non-object
 * payloads, unknown statement ids and out-of-scale values all degrade to
 * « not answered » rather than breaking the wizard.
 */
export function parseStoredAnswers(
  raw: string | null,
  statementIds: readonly string[],
): UserAnswers {
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const answers: Record<string, UserAnswer> = {};
  for (const id of statementIds) {
    if (!Object.hasOwn(parsed, id)) continue;
    const value = (parsed as Record<string, unknown>)[id];
    if (isUserAnswer(value)) answers[id] = value;
  }
  return answers;
}
