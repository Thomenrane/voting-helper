/**
 * Canonical display reference of a legislative dossier: '228' in legislature
 * '56' → 'DOC 56 0228' (Chamber numbering convention, see votes.types.ts).
 * Used both in the LLM prompt and in the LinkedVote.dossier field so the
 * review, the YAML and the site all show the same reference.
 */
export function formatDossierRef(legislature: string, dossierId: string): string {
  return `DOC ${legislature} ${dossierId.padStart(4, '0')}`;
}
