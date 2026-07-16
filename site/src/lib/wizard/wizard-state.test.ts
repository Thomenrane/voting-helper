import { describe, expect, it } from 'vitest';
import {
  ANSWERS_STORAGE_KEY,
  answeredCount,
  canGoNext,
  canGoPrevious,
  createWizard,
  currentAnswer,
  currentStatementId,
  goNext,
  goPrevious,
  isOnResults,
  isUserAnswer,
  parseStoredAnswers,
  serializeAnswers,
  setAnswer,
  shouldAutoAdvance,
} from './wizard-state.ts';

const IDS = ['s1', 's2', 's3', 's4'] as const;

describe('createWizard', () => {
  it('starts on the first question with no saved answers', () => {
    const state = createWizard(IDS);
    expect(state.currentIndex).toBe(0);
    expect(currentStatementId(state)).toBe('s1');
    expect(answeredCount(state)).toBe(0);
    expect(isOnResults(state)).toBe(false);
  });

  it('resumes on the first unanswered question', () => {
    const state = createWizard(IDS, { s1: 2, s2: 'sans_opinion' });
    expect(state.currentIndex).toBe(2);
    expect(currentStatementId(state)).toBe('s3');
    expect(answeredCount(state)).toBe(2);
  });

  it('resumes on the first gap even when later questions are answered', () => {
    const state = createWizard(IDS, { s1: 1, s3: -1 });
    expect(state.currentIndex).toBe(1);
    expect(answeredCount(state)).toBe(2);
  });

  it('resumes directly on results when every question is answered', () => {
    const state = createWizard(IDS, { s1: 0, s2: 1, s3: -2, s4: 'sans_opinion' });
    expect(isOnResults(state)).toBe(true);
    expect(currentStatementId(state)).toBeNull();
  });

  it('ignores saved answers for unknown statement ids', () => {
    const state = createWizard(IDS, { s1: 2, zz: -1 });
    expect(answeredCount(state)).toBe(1);
    expect(state.answers).toEqual({ s1: 2 });
  });
});

describe('setAnswer', () => {
  it('records the answer for the current question', () => {
    const state = setAnswer(createWizard(IDS), -1);
    expect(currentAnswer(state)).toBe(-1);
    expect(answeredCount(state)).toBe(1);
  });

  it('does not advance by itself', () => {
    const state = setAnswer(createWizard(IDS), 2);
    expect(state.currentIndex).toBe(0);
  });

  it('replaces a previous answer (modification)', () => {
    let state = setAnswer(createWizard(IDS), 2);
    state = setAnswer(state, 'sans_opinion');
    expect(currentAnswer(state)).toBe('sans_opinion');
    expect(answeredCount(state)).toBe(1);
  });

  it('is a no-op on the results view', () => {
    const state = createWizard(IDS, { s1: 0, s2: 0, s3: 0, s4: 0 });
    expect(setAnswer(state, 2)).toBe(state);
  });

  it('does not mutate the previous state', () => {
    const before = createWizard(IDS);
    setAnswer(before, 1);
    expect(answeredCount(before)).toBe(0);
  });
});

describe('navigation', () => {
  it('cannot go next while the current question is unanswered', () => {
    const state = createWizard(IDS);
    expect(canGoNext(state)).toBe(false);
    expect(goNext(state)).toBe(state);
  });

  it('goes to the next question once answered', () => {
    const state = goNext(setAnswer(createWizard(IDS), 0));
    expect(state.currentIndex).toBe(1);
    expect(currentStatementId(state)).toBe('s2');
  });

  it('reaches the results view after the last answer', () => {
    let state = createWizard(IDS, { s1: 1, s2: 1, s3: 1 });
    state = setAnswer(state, -2);
    state = goNext(state);
    expect(isOnResults(state)).toBe(true);
    expect(canGoNext(state)).toBe(false);
    expect(goNext(state)).toBe(state);
  });

  it('cannot go back from the first question', () => {
    const state = createWizard(IDS);
    expect(canGoPrevious(state)).toBe(false);
    expect(goPrevious(state)).toBe(state);
  });

  it('goes back to an answered question, keeping its answer for modification', () => {
    let state = goNext(setAnswer(createWizard(IDS), 2));
    state = goPrevious(state);
    expect(state.currentIndex).toBe(0);
    expect(currentAnswer(state)).toBe(2);
    state = setAnswer(state, -1);
    expect(currentAnswer(state)).toBe(-1);
  });

  it('goes back from the results view to the last question', () => {
    let state = createWizard(IDS, { s1: 0, s2: 0, s3: 0, s4: 2 });
    expect(isOnResults(state)).toBe(true);
    state = goPrevious(state);
    expect(currentStatementId(state)).toBe('s4');
    expect(currentAnswer(state)).toBe(2);
  });
});

describe('shouldAutoAdvance', () => {
  it('is false while the current question is unanswered', () => {
    expect(shouldAutoAdvance(createWizard(IDS))).toBe(false);
  });

  it('is true when the next question is unanswered (fresh forward flow)', () => {
    const state = setAnswer(createWizard(IDS), 2);
    expect(shouldAutoAdvance(state)).toBe(true);
  });

  it('is false when the next question is already answered (modification flow)', () => {
    // User went back to s1 while s2 already holds an answer.
    let state = createWizard(IDS, { s1: 0, s2: 1 });
    state = goPrevious(goPrevious(state));
    expect(state.currentIndex).toBe(0);
    state = setAnswer(state, -2);
    expect(shouldAutoAdvance(state)).toBe(false);
  });

  it('is false on the last question — results are reached explicitly only', () => {
    let state = createWizard(IDS, { s1: 0, s2: 0, s3: 0 });
    expect(state.currentIndex).toBe(3);
    state = setAnswer(state, 2);
    expect(canGoNext(state)).toBe(true);
    expect(shouldAutoAdvance(state)).toBe(false);
  });

  it('is false on the results view', () => {
    expect(shouldAutoAdvance(createWizard(IDS, { s1: 0, s2: 0, s3: 0, s4: 0 }))).toBe(false);
  });
});

describe('isUserAnswer', () => {
  it('accepts the five scale degrees and « sans opinion »', () => {
    for (const value of [-2, -1, 0, 1, 2, 'sans_opinion']) {
      expect(isUserAnswer(value)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    for (const value of [3, -3, 0.5, NaN, '2', '', null, undefined, {}]) {
      expect(isUserAnswer(value)).toBe(false);
    }
  });
});

describe('persistence (pure string boundary)', () => {
  it('exposes a versioned, namespaced storage key', () => {
    expect(ANSWERS_STORAGE_KEY).toBe('voting-helper:answers:v1');
  });

  it('round-trips answers through serialize/parse', () => {
    const answers = { s1: 2, s2: 'sans_opinion', s4: -2 } as const;
    const parsed = parseStoredAnswers(serializeAnswers(answers), IDS);
    expect(parsed).toEqual(answers);
  });

  it('returns no answers for null or absent storage', () => {
    expect(parseStoredAnswers(null, IDS)).toEqual({});
  });

  it('returns no answers for corrupted JSON', () => {
    expect(parseStoredAnswers('{not json', IDS)).toEqual({});
  });

  it('returns no answers for JSON that is not an object', () => {
    expect(parseStoredAnswers('[2, 1]', IDS)).toEqual({});
    expect(parseStoredAnswers('"s1"', IDS)).toEqual({});
    expect(parseStoredAnswers('null', IDS)).toEqual({});
  });

  it('drops invalid values and unknown ids, keeps the valid rest', () => {
    const raw = JSON.stringify({
      s1: 5, // out of scale
      s2: '2', // string, not a number
      s3: 'sans_opinion',
      s4: -1.5, // not an integer of the scale
      zz: 2, // unknown id
    });
    expect(parseStoredAnswers(raw, IDS)).toEqual({ s3: 'sans_opinion' });
  });
});
