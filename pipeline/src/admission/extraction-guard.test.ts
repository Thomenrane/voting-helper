/**
 * Preuve que la porte fail-closed couvre LES DEUX chemins producteurs de
 * positions de `extract:positions` — le live ET l'ingest (#42 × #44).
 *
 * Le fichier de commande s'auto-exécute à l'import (`runExtractPositions()
 * .catch(fail)`) et ne peut donc pas être importé en test. Mais les deux
 * chemins appliquent la MÊME garde, une unique `assertPartyAdmitted(verdict)`
 * placée AVANT le bloc d'orchestration partagé live+ingest. Ce test compose
 * exactement cette garde — évidence des couches texte → verdict → gate — et
 * prouve qu'un parti non-PASS est refusé (donc ne peut produire de positions
 * ni en live ni via `--ingest`), et qu'un parti PASS passe.
 */
import { describe, expect, it } from 'vitest';

import type { ProgrammeTextLayer } from '../extraction/text-layer.ts';
import { buildPartyAdmissionInput, type DocumentSignals } from './evidence.ts';
import { getExpectedIdentity } from './expected-identity.ts';
import { assertPartyAdmitted, SourceNotAdmittedError } from './gate.ts';
import { admitParty } from './verdict.ts';

function layerOf(sourceId: string, ...pages: string[]): ProgrammeTextLayer {
  return {
    source_id: sourceId,
    source_sha256: 'sha',
    extractor: 'unpdf',
    page_count: pages.length,
    pages: pages.map((text, i) => ({ page: i + 1, text })),
  };
}

/** Reproduit la garde que la commande applique, à l'identique, sur live ET ingest. */
function guardParty(partyId: string, signals: DocumentSignals[], presentSourceIds: string[]): void {
  const expected = getExpectedIdentity(partyId);
  const verdict = admitParty(buildPartyAdmissionInput(expected, signals, presentSourceIds));
  assertPartyAdmitted(verdict);
}

describe('garde d\'extraction fail-closed — couvre live ET ingest', () => {
  it('REFUSE un parti non-PASS (couche texte qui DISCUTE le fédéral sans se déclarer fédéral)', () => {
    // Fenêtre style N-VA : parle du fédéral (« federale overheid », « in de
    // Kamer ») mais aucune phrase forte d'auto-désignation → UNCERTAIN.
    const pages: string[] = [
      'Voor Vlaamse Welvaart',
      'Het verkiezingsprogramma van de N-VA — 2024',
      'Wij halen bevoegdheden weg bij de federale overheid. In de Kamer strijden wij verder.',
    ];
    while (pages.length < 120) pages.push(`inhoud ${pages.length + 1}`);
    const signals: DocumentSignals[] = [
      { source_id: 'nva-programme-2024', layer: layerOf('nva-programme-2024', ...pages), knownPages: null },
    ];

    // C'est la garde exacte du chemin --ingest (et du live) : elle doit lever.
    expect(() => guardParty('nva', signals, ['nva-programme-2024'])).toThrow(SourceNotAdmittedError);
  });

  it('LAISSE PASSER un parti PASS (programme fédéral, phrase forte + année proche + bonnes pages)', () => {
    const pages: string[] = ['Programme pour les élections fédérales du 9 juin 2024'];
    while (pages.length < 120) pages.push(`contenu ${pages.length + 1}`);
    const signals: DocumentSignals[] = [
      { source_id: 'nva-programme-2024', layer: layerOf('nva-programme-2024', ...pages), knownPages: null },
    ];
    expect(() => guardParty('nva', signals, ['nva-programme-2024'])).not.toThrow();
  });
});
