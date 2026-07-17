export type {
  Citation,
  ContextNote,
  DossierDirection,
  GroupVotePosition,
  LinkedVote,
  Party,
  PartyPosition,
  PositionStatus,
  PositionValue,
  ProgrammePosition,
  Statement,
  UserAnswer,
  UserAnswers,
} from './schema.ts';

export {
  deriveRelativeVote,
  deriveVotePosition,
  type DerivedVotePosition,
} from './linked-vote.ts';

export type { ChangelogEntry, ChangelogEntryKind } from './changelog.ts';
export { CHANGELOG } from './changelog.ts';

export { PARTIES } from './fixtures/parties.fixture.ts';
export { STATEMENTS } from './fixtures/statements.fixture.ts';
export { PARTY_POSITIONS } from './fixtures/positions.fixture.ts';
